import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  GraphAgentIdType,
  ReActAgentIdType,
  ExpertAgentIdType,
  EdgeIdType,
  NodeIdType,
  GraphAgentId,
  EdgeId,
  NodeId,
  ReActAgentId,
  ExpertAgentId,
  ToolId,
} from '@core/infrastructure/database/utils/custom_types';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { Tool } from '@core/infrastructure/agents/tools/toolkit.interface';
import { Providers } from '@core/infrastructure/agents/components/llm/interfaces/llm.interface';

export { AgentMemoryConfig };

type Command = `/${string}`;

enum AgentState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERRORED = 'errored',
}

enum CheckPointTypes {
  Nodes = 'nodes',
  Tools = 'tools',
  All = 'all',
}

export interface ParsingConfig {
  vectorStoreRefRegex: RegExp; // pattern to identify a reference to the vector store
  linkRegex: RegExp; // pattern to identify a link
  conversationsRefRegex: RegExp; // pattern to identify a reference to conversations
  attachmentsRefRegex: RegExp; // pattern to identify a reference to attachments
}

export const DefaultParsingConfig: ParsingConfig = {
  vectorStoreRefRegex: /<vectorstore>(.*?)<\/vectorstore>/g,
  linkRegex: /<link>(.*?)<\/link>/g,
  conversationsRefRegex: /<conversations>(.*?)<\/conversations>/g,
  attachmentsRefRegex: /<attachments>(.*?)<\/attachments>/g,
};

interface AgentCheckpointConfig {
  enabled: boolean; // whether checkpointing is active
  allowList: CheckPointTypes; // which types of checkpoints are allowed
  maxCheckpoints: number; // maximum number of checkpoints
  autoSave: boolean; // whether to auto save checkpoints
}

interface AgentLoaderConfig {
  enabled: boolean; // whether the loader is active
  type: ('file' | 'link' | 'image')[]; // type of loader (e.g., file, link, image)
  maxFileSize: number; // maximum file size allowed in bytes
  allowedTypes: string[]; // allowed file types (e.g., 'text', 'pdf', 'docx')
}

interface AgentIntelligenceConfig {
  llm: {
    provider: string; // name of the provider (e.g., OpenAI, Anthropic)
    model: string; // model name (e.g., gpt-3.5-turbo)
    tokenLimit: number; // maximum tokens for the model
  };
  escalate: boolean; // whether to escalate to smarter LLM / human if agent can't answer
  providerEscalationOptions: (
    | Providers.GOOGLE
    | Providers.OPENAI
    | Providers.ANTHROPIC
    | Providers.GROQ
    | Providers.XAI
    | Providers.NVIDIA
    | 'human'
  )[]; // options for model escalation, in order of least to most expensive
  modelEscalationTable: {
    [key in Providers]: {
      model: string; // model name (e.g., gpt-3.5-turbo)
      tokenLimit: number; // maximum tokens for the model
    }[];
  };
}

interface ReActAgentConfig {
  _id: ReActAgentIdType;
  state: AgentState;
  // Additional metadata expected by validator
  userId?: string;
  name?: string;
  description?: string;
  purpose?: string;
  enabled: boolean;
  cot: {
    enabled: boolean; // whether CoT prompting is active for explicit step‑by‑step reasoning
    promptTemplate: string; // template that kicks off chain‑of‑thought with a cue
    maxTokens: number; // cap on total reasoning tokens to avoid truncating multi‑step chains
    temperature: number; // randomness control (0 = deterministic, ↑ = more creative)
    topP: number; // nucleus sampling threshold; restricts to most probable tokens summing to p
    frequencyPenalty: number; // penalizes tokens based on prior frequency to reduce repetition
    presencePenalty: number; // penalizes tokens that have already appeared to encourage new concepts
    fewShotExamples: // example QA cycles to prime the agent on ReAct patterns
    {
      input: string; // user input to the agent
      thought: string; // agent's thought process
      action: string; // action to take
      observation: string; // result of the action
      finalAnswer: string; // final answer to the question
    }[];
    stopSequences: string[]; // strings that halt further reasoning segments
    maxSteps: number; // maximum Thought→Action loops before automatically finishing
    selfConsistency: {
      // run multiple reasoning paths and vote on the most consistent answer
      enabled: boolean;
      samples: number;
    };
    temperatureModifiable: boolean; // allow adjusting temperature at runtime without redeploy
    maxTokensModifiable: boolean; // allow runtime tuning of maxTokens
  };
  tools: Tool[];
  canModifyStorage: boolean;
  intelligence: AgentIntelligenceConfig;

  // Memory configuration (added)
  memory?: AgentMemoryConfig;
}

interface ExpertAgentConfig {
  _id: ExpertAgentIdType;
  state: AgentState;
  // Additional metadata
  userId?: string;
  name?: string;
  description?: string;
  purpose?: string;
  enabled: boolean;
  research: {
    enabled: boolean; // whether research mode is active
    promptTemplate: string; // template for research queries
    maxSources: number; // maximum number of sources to research per question
    researchDepth: 'basic' | 'advanced'; // depth of research (basic or advanced)
    maxTokens: number; // cap on total research tokens
    temperature: number; // randomness control for synthesis
    citationStyle: 'inline' | 'footnote' | 'endnote'; // how to present citations
  };
  tools: Tool[];
  canModifyStorage: boolean;
  intelligence: AgentIntelligenceConfig;
  memory?: AgentMemoryConfig;
}

export interface Node {
  _id: NodeIdType;
  command?: Command | '_newmessage';
  name: string;
  description: string;
  llm: {
    provider: string;
    model: string;
    tokenLimit: number;
  };
  ReActConfig: ReActAgentConfig;
  userInteraction?: {
    mode: 'continuous_chat' | 'single_react_cycle';
    requireApproval?: boolean; // pause for user approval before proceeding
    confidenceThreshold?: number; // 0-1, pause if confidence below this
    approvalPrompt?: string; // custom message shown to user for approval
    // For single_react_cycle mode
    // Note: maxCoTSteps is handled by ReActConfig.cot.maxSteps to avoid duplication
    allowUserPrompting?: boolean; // let user help with additional prompts when confidence is low
    // For continuous_chat mode
    showEndChatButton?: boolean; // show button to end chat session
  };
}

interface Edge {
  _id: EdgeIdType;
  from: NodeIdType;
  to: NodeIdType;
  condition: {
    type: 'keyword' | 'analysis';
    keyword?: string;
    analysisPrompt?: string;
    analysisProvider: {
      provider: string;
      model: string;
      tokenLimit: number;
    };
  };
  memoryOverride?: AgentMemoryConfig;
  contextFrom: NodeIdType[];
  // New fields for flow control
  exclusiveGroup?: string; // Edges with same exclusiveGroup are mutually exclusive
  priority?: number; // Lower number = higher priority for exclusive groups
  isJoin?: boolean; // If true, this edge waits for all predecessors
  joinPredecessors?: NodeIdType[]; // Nodes that must complete before this edge triggers
}

interface GraphAgent {
  _id: GraphAgentIdType;
  state?: AgentState;
  nodes: Node[];
  edges: Edge[];
  memory: AgentMemoryConfig;
  checkpoints: {
    enabled: boolean;
    allowList: CheckPointTypes;
  };
}

const ToolSchema: Schema<Omit<Tool, 'concatenate'>> = new Schema({
  _id: {
    type: String,
    required: true,
    unique: true,
    default: () => ToolId.create(new Types.ObjectId()),
  }, // unique identifier
  name: { type: String, required: true }, // unique identifier
  description: { type: String, required: true }, // human-readable overview
  type: { type: String, enum: ['actor', 'retriever'] }, // literal union for IDE safety
  retrieverConfig: { type: Schema.Types.Mixed, default: null }, // RAG-specific parameters
  useCase: { type: String, required: true }, // scenario in which this tool excels
  inputSchema: { type: Schema.Types.Mixed, required: true }, // JSON Schema for validating inputs
  outputSchema: { type: Schema.Types.Mixed, required: true }, // JSON Schema for validating outputs
  invocationExample: [{ type: Schema.Types.Mixed }], // sample invocations for in-context guidance
  retries: { type: Number, default: 0 }, // retry count on failure
  errorEvent: [
    {
      name: { type: String, required: true },
      guidance: { type: String, required: true },
      retryable: { type: Boolean, default: false },
    },
  ], // structured error handling hooks
  parallel: { type: Boolean, default: false }, // allow concurrent runs?
  maxIterations: { type: Number, default: 1 }, // guardrails on loops
  pauseBeforeUse: { type: Boolean, default: false }, // throttle for external calls
  userModifyQuery: { type: Boolean, default: false }, // allow user to adjust inputs?
});

export interface ReActAgentDocument extends Document {
  _id: ReActAgentIdType;
  state: string;
  enabled: boolean;
  cot: {
    enabled: boolean;
    promptTemplate: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    fewShotExamples: Array<{
      input: string;
      thought: string;
      action: string;
      observation: string;
      finalAnswer: string;
    }>;
    stopSequences: string[];
    maxSteps: number;
    selfConsistency: {
      enabled: boolean;
      samples: number;
    };
    temperatureModifiable: boolean;
    maxTokensModifiable: boolean;
  };
  tools: Tool[];
  canModifyStorage: boolean;
  intelligence: {
    escalate: boolean;
    modelEscalationOptions: string[];
  };
  memory?: import('@core/infrastructure/agents/components/memory/memory.interface').AgentMemoryConfig;
}

const ReActAgentSchema: Schema<ReActAgentDocument> = new Schema({
  _id: {
    type: String,
    required: true,
    unique: true,
    default: () => ReActAgentId.create(new Types.ObjectId()),
  },
  state: {
    type: String,
    enum: Object.values({
      INITIALIZING: 'initializing',
      READY: 'ready',
      RUNNING: 'running',
      PAUSED: 'paused',
      STOPPED: 'stopped',
      ERRORED: 'errored',
    }),
    default: 'initializing',
  },
  enabled: { type: Boolean, default: true },
  cot: {
    enabled: { type: Boolean, default: true },
    promptTemplate: {
      type: String,
      default: "Question: {input}\nThought: Let's think step by step…",
    },
    maxTokens: { type: Number, default: 512 },
    temperature: { type: Number, default: 0.7 },
    topP: { type: Number, default: 0.9 },
    frequencyPenalty: { type: Number, default: 0.0 },
    presencePenalty: { type: Number, default: 0.0 },
    fewShotExamples: [
      {
        input: String,
        thought: String,
        action: String,
        observation: String,
        finalAnswer: String,
      },
    ],
    stopSequences: [{ type: String }],
    maxSteps: { type: Number, default: 5 },
    selfConsistency: {
      enabled: { type: Boolean, default: true },
      samples: { type: Number, default: 3 },
    },
    temperatureModifiable: { type: Boolean, default: true },
    maxTokensModifiable: { type: Boolean, default: true },
  },
  tools: { type: [ToolSchema], default: [] },
  canModifyStorage: { type: Boolean, default: false },
  intelligence: {
    escalate: { type: Boolean, default: false },
    modelEscalationOptions: { type: [String], default: [] },
    llm: {
      provider: { type: String },
      model: { type: String },
      tokenLimit: { type: Number },
    },
  },
  memory: { type: Schema.Types.Mixed },
});

const NodeSchema: Schema<Node> = new Schema({
  _id: {
    type: String,
    required: true,
    unique: true,
    default: () => NodeId.create(new Types.ObjectId()),
  },
  command: { type: String },
  name: { type: String, required: true },
  description: { type: String, required: true },
  llm: {
    provider: { type: String },
    model: { type: String },
    tokenLimit: { type: Number },
  },
  ReActConfig: { type: ReActAgentSchema, required: true },
});

const EdgeSchema: Schema<Edge> = new Schema({
  _id: {
    type: String,
    required: true,
    unique: true,
    default: () => EdgeId.create(new Types.ObjectId()),
  },
  from: { type: String, required: true },
  to: { type: String, required: true },
  condition: {
    type: { type: String, enum: ['keyword', 'analysis'] },
    analysisPrompt: { type: String },
    analysisProvider: {
      provider: { type: String },
      model: { type: String },
      tokenLimit: { type: Number },
    },
  },
  memoryOverride: { type: Schema.Types.Mixed },
  contextFrom: [{ type: Schema.Types.ObjectId, ref: 'Context' }],
});

export interface GraphAgentDocument extends Document {
  _id: GraphAgentIdType;
  state?: string;
  nodes: Node[];
  edges: Edge[];
  memory: AgentMemoryConfig;
  checkpoints: {
    enabled: boolean;
    allowList: 'nodes' | 'tools' | 'all';
  };
}

const GraphAgentSchema: Schema<GraphAgentDocument> = new Schema({
  _id: {
    type: String,
    required: true,
    unique: true,
    default: () => GraphAgentId.create(new Types.ObjectId()),
  },
  state: {
    type: String,
    enum: Object.values({
      INITIALIZING: 'initializing',
      READY: 'ready',
      RUNNING: 'running',
      PAUSED: 'paused',
      STOPPED: 'stopped',
      ERRORED: 'errored',
    }),
    default: 'initializing',
  },
  nodes: { type: [NodeSchema], default: [] },
  edges: { type: [EdgeSchema], default: [] },
  memory: { type: Schema.Types.Mixed, required: true },
  checkpoints: {
    enabled: { type: Boolean, default: false },
    allowList: {
      type: String,
      enum: Object.values({ Nodes: 'nodes', Tools: 'tools', All: 'all' }),
      default: 'all',
    },
  },
});

// Base agent schema with common fields and discriminator field
const BaseAgentSchema = new Schema(
  {
    _id: { type: String, required: true, unique: true },
    agentType: {
      type: String,
      required: true,
      enum: ['ReactAgent', 'GraphAgent'],
    },
  },
  { discriminatorKey: 'agentType' },
);

// Create the base model
export const AgentsModel = mongoose.model('Agents', BaseAgentSchema);

// Create the discriminators for different agent types
export const ReactAgentModel = AgentsModel.discriminator<ReActAgentDocument>(
  'ReactAgent',
  ReActAgentSchema,
);

export const GraphAgentModel = AgentsModel.discriminator<GraphAgentDocument>(
  'GraphAgent',
  GraphAgentSchema,
);

export {
  Command,
  AgentState,
  CheckPointTypes,
  Tool,
  ReActAgentConfig,
  ExpertAgentConfig,
  Edge,
  GraphAgent,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
};
