import { Schema, model, Document, Types } from 'mongoose';

import {
  ConversationIdType,
  UserIdType,
  ReActAgentIdType,
  GraphAgentIdType,
  NodeIdType,
  EdgeIdType,
  ConversationId,
  MessageIdType,
  MessageId,
  SnippetId,
  SnippetIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { EmbedSchema, LineCharPos, type Embed } from './store.entity';
import {
  AgentMemoryConfig,
  AgentMemoryRecord,
  AgentMemoryRecordSchema,
} from '../../memory/memory.interface';

interface Sender {
  System: 'system'; // initial instructions, node prompts, etc.
  Human: 'human'; // actual user input
  AI: 'ai'; // final AI/agent response
  Internal: 'internal'; // chain‑of‑thought, "Thought:" entries, observations, actions
}

interface ConversationMessage {
  _id: MessageIdType; // Custom ID for this message
  timestamp: string; // ISO string
  sender: Sender; // system | human | ai | internal
  text: string; // the content of that turn
  nodeId: NodeIdType; // which node's context this belongs to
  edgeId?: EdgeIdType; // which edge triggered the transition (if any)
  order: number; // order of the message in the conversation (for sorting)

  /** optional extra fields for React‐style reasoning steps */
  thought?: string; // "Thought: …"
  action?: string; // "Action: …"
  observation?: string; // "Observation: …"
  finalAnswer?: string; // "FinalAnswer: …"

  embedding?: Embed; // optional embedding for this message to allow semantic search
}

interface ConversationSnippet {
  _id: SnippetIdType; // Custom ID for this snippet
  parentId: MessageIdType; // ID of the parent message this snippet is derived from
  text: string; // the content of the snippet
  sender: Sender; // system | human | ai | internal
  position: {
    start: LineCharPos; // start position of the snippet in the parent message
    end: LineCharPos; // end position of the snippet in the parent message
  };

  embedding?: Embed; // optional embedding for this snippet to allow semantic search
}

// Definition for graph execution state in checkpoints
interface GraphExecutionSnapshot {
  executionHistory: Array<{
    nodeId: NodeIdType;
    nodeName: string;
    input: string;
    output: string;
    timestamp: string;
    executionTime: number;
  }>;
  activeEdges: any[]; // Edge array
  pausedAtNode?: NodeIdType; // If paused between nodes
  pausedBranches?: NodeIdType[]; // Specific branches that are paused
  currentInput?: string; // Input being processed when paused
}

// Definition for checkpoints
interface ConversationCheckpoint {
  _id: string; // Unique checkpoint ID
  name: string; // User-friendly name for the checkpoint
  description?: string; // Optional description
  timestamp: string; // When the checkpoint was created
  checkpointType:
    | 'conversation'
    | 'graph-node-start'
    | 'graph-node-end'
    | 'graph-between-nodes';
  conversationState: {
    currentNode: NodeIdType; // Node state at checkpoint time
    messages: ConversationMessage[]; // Messages at checkpoint time
    snippets?: ConversationSnippet[]; // Snippets at checkpoint time
    memoryRecords: AgentMemoryRecord; // Memory state at checkpoint time
  };
  graphState?: GraphExecutionSnapshot; // Graph-specific state
}

interface Conversation extends Document<ConversationIdType> {
  _id: ConversationIdType;
  ownerId: UserIdType; // who owns this conversation
  agentId: GraphAgentIdType | ReActAgentIdType;
  currentNode: NodeIdType;

  /** your AgentMemory settings (type, bufferSize, prompts, etc.) */
  memoryConfig: AgentMemoryConfig;

  /** the live memory store you append to as the agent writes or summarizes */
  memoryRecords: AgentMemoryRecord;

  /** full chat history, including system & internal CoT steps */
  messages: ConversationMessage[];
  snippets?: ConversationSnippet[];
  summary: {
    data: string; // optional summary of the conversation
    embedding?: Embed; // optional embedding for the conversation to allow semantic search
  };

  /** checkpoints for conversation state */
  checkpoints?: ConversationCheckpoint[];

  createdAt?: string; // timestamp for when the conversation was created
  updatedAt?: string; // timestamp for when the conversation was last updated
}

const ConversationMessageSchema = new Schema<ConversationMessage>(
  {
    _id: {
      type: String,
      index: true,
      default: () => MessageId.create(new Types.ObjectId()),
    },
    timestamp: { type: String, required: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    nodeId: { type: String, required: true },
    edgeId: { type: String },
    thought: { type: String },
    action: { type: String },
    observation: { type: String },
    finalAnswer: { type: String },
    embedding: { type: EmbedSchema, required: false },
    order: { type: Number, required: true },
  },
  { timestamps: true },
);

const ConversationSnippetSchema = new Schema<ConversationSnippet>(
  {
    _id: {
      type: String,
      index: true,
      default: () => SnippetId.create(new Types.ObjectId()),
    },
    parentId: { type: String, required: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    embedding: { type: EmbedSchema, required: false },
    position: {
      start: { type: { line: Number, character: Number } },
      end: { type: { line: Number, character: Number } },
    },
  },
  { timestamps: true },
);

const GraphExecutionSnapshotSchema = new Schema<GraphExecutionSnapshot>(
  {
    executionHistory: [
      {
        nodeId: { type: String, required: true },
        nodeName: { type: String, required: true },
        input: { type: String, required: true },
        output: { type: String, required: true },
        timestamp: { type: String, required: true },
        executionTime: { type: Number, required: true },
      },
    ],
    activeEdges: { type: Schema.Types.Mixed, required: true },
    pausedAtNode: { type: String },
    pausedBranches: [{ type: String }],
    currentInput: { type: String },
  },
  { _id: false },
);

const ConversationCheckpointSchema = new Schema<ConversationCheckpoint>(
  {
    _id: {
      type: String,
      index: true,
      default: () => new Types.ObjectId().toString(),
    },
    name: { type: String, required: true },
    description: { type: String },
    timestamp: { type: String, required: true },
    checkpointType: {
      type: String,
      enum: [
        'conversation',
        'graph-node-start',
        'graph-node-end',
        'graph-between-nodes',
      ],
      default: 'conversation',
    },
    conversationState: {
      currentNode: { type: String, required: true },
      messages: { type: [ConversationMessageSchema], required: true },
      snippets: { type: [ConversationSnippetSchema] },
      memoryRecords: { type: AgentMemoryRecordSchema, required: true },
    },
    graphState: { type: GraphExecutionSnapshotSchema },
  },
  { _id: false },
);

const ConversationSchema = new Schema<Conversation>(
  {
    _id: {
      type: String,
      default: () => ConversationId.create(new Types.ObjectId()),
    },
    ownerId: { type: String, index: true, required: true },
    agentId: { type: String, index: true, required: true },
    currentNode: { type: String, index: true, required: true },
    memoryConfig: { type: Object, required: true },
    memoryRecords: {
      type: AgentMemoryRecordSchema,
      default: {},
    },
    messages: {
      type: [ConversationMessageSchema],
      default: [],
      required: true,
    },
    snippets: {
      type: [ConversationSnippetSchema],
      default: [],
      required: false,
    },
    summary: { type: { data: String, embedding: EmbedSchema }, default: {} },
    checkpoints: {
      type: [ConversationCheckpointSchema],
      default: [],
      required: false,
    },
  },
  { timestamps: true },
);

const ConversationModel = model<Conversation>(
  'conversation',
  ConversationSchema,
);
export default ConversationModel;
export {
  ConversationMessageSchema,
  ConversationSchema,
  ConversationModel,
  ConversationMessage,
  ConversationSnippet,
  ConversationCheckpoint,
  ConversationCheckpointSchema,
  Conversation,
  Sender,
};
