import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AssistantType {
  STUDY_HELPER = 'study_helper',
  PROBLEM_SOLVER = 'problem_solver',
  MOCK_INTERVIEWER = 'mock_interviewer',
  RESUME_CRITIQUER = 'resume_critiquer',
  CALENDAR_ASSISTANT = 'calendar_assistant',
  CODE_HELPER = 'code_helper',
  RESEARCH = 'research',
  GRAPH_AGENT = 'graph_agent',
  REACT_AGENT = 'react_agent',
  CUSTOM = 'custom',
}

export enum AssistantMode {
  PRECISE = 'precise',
  CREATIVE = 'creative',
  BALANCED = 'balanced',
  SOCRATIC = 'socratic',
  CUSTOM = 'custom',
  VISUAL_LEARNING = 'visual_learning',
}

export enum AssistantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISABLED = 'disabled',
  DRAFT = 'draft',
}

export enum AgentState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERRORED = 'errored',
}

@Schema()
export class CustomPrompt {
  @Prop()
  name!: string;

  @Prop()
  content!: string;

  @Prop({ default: 0 })
  priority!: number;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, any>;
}

@Schema()
export class ContextBlock {
  @Prop()
  name!: string;

  @Prop()
  content!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: [String], default: [] })
  applicableTopics!: string[];

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, any>;
}

@Schema()
export class AssistantToolConfig {
  @Prop()
  toolName!: string;

  @Prop({ default: true })
  isEnabled!: boolean;

  @Prop({ type: Object, default: {} })
  parameters!: Record<string, any>;

  @Prop()
  customInstructions?: string;
}

@Schema()
export class NodeConfig {
  @Prop()
  id?: string;

  @Prop()
  type!: string;

  @Prop({ type: Object })
  config!: Record<string, any>;

  @Prop()
  prompt?: string;

  @Prop({ default: false })
  requiresUserInput!: boolean;

  @Prop({ type: Object })
  next?: string | Record<string, string> | null;
}

@Schema()
export class LLMParameters {
  @Prop({ default: 0.7 })
  temperature?: number;

  @Prop()
  topP?: number;

  @Prop()
  presencePenalty?: number;

  @Prop()
  frequencyPenalty?: number;

  @Prop()
  maxTokens?: number;
}

// ReAct Agent specific schemas
@Schema()
export class CoTConfig {
  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ default: "Question: {input}\nThought: Let's think step by step…" })
  promptTemplate!: string;

  @Prop({ default: 512 })
  maxTokens!: number;

  @Prop({ default: 0.7 })
  temperature!: number;

  @Prop({ default: 0.9 })
  topP!: number;

  @Prop({ default: 0.0 })
  frequencyPenalty!: number;

  @Prop({ default: 0.0 })
  presencePenalty!: number;

  @Prop({ type: [Object], default: [] })
  fewShotExamples!: Array<{
    input: string;
    thought: string;
    action: string;
    observation: string;
    finalAnswer: string;
  }>;

  @Prop({ type: [String], default: [] })
  stopSequences!: string[];

  @Prop({ default: 5 })
  maxSteps!: number;

  @Prop({
    type: {
      enabled: { type: Boolean, default: true },
      samples: { type: Number, default: 3 },
    },
    default: { enabled: true, samples: 3 },
  })
  selfConsistency!: {
    enabled: boolean;
    samples: number;
  };

  @Prop({ default: true })
  temperatureModifiable!: boolean;

  @Prop({ default: true })
  maxTokensModifiable!: boolean;
}

@Schema()
export class IntelligenceConfig {
  @Prop({
    type: {
      provider: { type: String },
      model: { type: String },
      tokenLimit: { type: Number },
    },
  })
  llm!: {
    provider: string;
    model: string;
    tokenLimit: number;
  };
  // definite-assignment: set by schema/mapping

  @Prop({ default: false })
  escalate!: boolean;

  @Prop({ type: [String], default: [] })
  providerEscalationOptions!: string[];

  @Prop({ type: Object, default: {} })
  modelEscalationTable!: Record<
    string,
    Array<{
      model: string;
      tokenLimit: number;
    }>
  >;
}

@Schema()
export class ReActAgentConfig {
  @Prop({ type: String, default: () => new Types.ObjectId().toString() })
  _id!: string;

  @Prop({
    type: String,
    enum: Object.values(AgentState),
    default: AgentState.INITIALIZING,
  })
  state!: AgentState;

  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ type: CoTConfig, default: () => ({}) })
  cot!: CoTConfig;

  @Prop({ type: [Object], default: [] })
  tools!: any[];

  @Prop({ default: false })
  canModifyStorage!: boolean;

  @Prop({ type: IntelligenceConfig })
  intelligence!: IntelligenceConfig;

  // Memory configuration for ReAct agent
  @Prop({ type: Object })
  memory?: any;
}

// Graph Agent specific schemas
@Schema()
export class GraphNode {
  @Prop({ type: String, default: () => new Types.ObjectId().toString() })
  _id!: string;
  @Prop()
  command?: string;

  @Prop()
  name!: string;

  @Prop()
  description!: string;

  @Prop({
    type: {
      provider: { type: String },
      model: { type: String },
      tokenLimit: { type: Number },
    },
  })
  llm!: {
    provider: string;
    model: string;
    tokenLimit: number;
  };

  @Prop({ type: ReActAgentConfig })
  ReActConfig!: ReActAgentConfig;

  @Prop({ type: Object })
  userInteraction?: {
    mode: 'continuous_chat' | 'single_react_cycle';
    requireApproval?: boolean;
    confidenceThreshold?: number;
    approvalPrompt?: string;
    // Note: maxCoTSteps is handled by ReActConfig.cot.maxSteps to avoid duplication
    allowUserPrompting?: boolean;
    showEndChatButton?: boolean;
  };
}

@Schema()
export class GraphEdge {
  @Prop({ type: String, default: () => new Types.ObjectId().toString() })
  _id!: string;

  @Prop()
  from!: string;

  @Prop()
  to!: string;

  @Prop({
    type: {
      type: { type: String, enum: ['keyword', 'analysis'] },
      keyword: String,
      analysisPrompt: String,
      analysisProvider: {
        provider: { type: String },
        model: { type: String },
        tokenLimit: { type: Number },
      },
    },
    // removed required to prevent schema config errors
  })
  condition!: {
    type: 'keyword' | 'analysis';
    keyword?: string;
    analysisPrompt?: string;
    analysisProvider: {
      provider: string;
      model: string;
      tokenLimit: number;
    };
  };
  // indicate set by schema

  @Prop({ type: Object })
  memoryOverride?: any;

  @Prop({ type: [String], default: [] })
  contextFrom!: string[];
}

@Schema()
export class GraphAgentConfig {
  @Prop({ type: String, default: () => new Types.ObjectId().toString() })
  _id!: string;

  @Prop({
    type: String,
    enum: Object.values(AgentState),
    default: AgentState.INITIALIZING,
  })
  state?: AgentState;

  @Prop({ type: [GraphNode], default: [] })
  nodes!: GraphNode[];

  @Prop({ type: [GraphEdge], default: [] })
  edges!: GraphEdge[];

  @Prop({ type: Object })
  memory?: any;

  @Prop({
    type: {
      enabled: { type: Boolean, default: true },
      allowList: {
        type: String,
        enum: ['nodes', 'tools', 'all'],
        default: 'nodes',
      },
    },
  })
  checkpoints!: {
    enabled: boolean;
    allowList: 'nodes' | 'tools' | 'all';
  };
  // indicate set by schema
}

@Schema({ timestamps: true })
export class Assistant extends Document {
  @Prop({ unique: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(AssistantType),
    default: AssistantType.CUSTOM,
  })
  type!: AssistantType;

  @Prop({
    type: String,
    enum: Object.values(AssistantMode),
    default: AssistantMode.BALANCED,
  })
  primaryMode!: AssistantMode;

  @Prop({
    type: String,
    enum: Object.values(AssistantStatus),
    default: AssistantStatus.ACTIVE,
  })
  status!: AssistantStatus;

  // Agent type identifier
  @Prop({
    type: String,
    enum: ['react', 'graph', 'custom'],
    default: 'custom',
  })
  agentType!: string;

  // Agent-specific configurations
  @Prop({ type: ReActAgentConfig })
  reactConfig?: ReActAgentConfig;

  @Prop({ type: GraphAgentConfig })
  graphConfig?: GraphAgentConfig;

  // Legacy fields for backward compatibility
  @Prop({ type: [NodeConfig], default: [] })
  blocks!: NodeConfig[];

  @Prop({ type: [CustomPrompt], default: [] })
  customPrompts!: CustomPrompt[];

  @Prop({ type: [ContextBlock], default: [] })
  contextBlocks!: ContextBlock[];

  @Prop({ type: [AssistantToolConfig], default: [] })
  tools!: AssistantToolConfig[];

  @Prop({ type: [String], default: [] })
  subjectExpertise!: string[];

  @Prop({ default: false })
  isPublic!: boolean;

  @Prop()
  userId?: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, any>;

  // Virtual fields for agent integration
  agentInstanceId?: string;
  lastExecuted?: Date;
  executionCount?: number;
  // Definite assignment assertions for DI/framework-set properties
  // (user requested: use `!` for TS2564 fixes)
  _id!: string;
  llm!: any;
}

export const AssistantSchema = SchemaFactory.createForClass(Assistant);

// Add indexes for performance
AssistantSchema.index({ type: 1 });
AssistantSchema.index({ agentType: 1 });
AssistantSchema.index({ userId: 1 });
AssistantSchema.index({ isPublic: 1 });
AssistantSchema.index({ status: 1 });
