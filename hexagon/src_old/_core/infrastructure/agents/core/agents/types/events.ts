import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { ConversationIdType } from '@core/infrastructure/database/utils/custom_types';
import { AgentState, ReActAgentConfig } from './agent.entity';

/**
 * Event types emitted by BaseAgent for observability and control
 */
export interface BaseAgentEvents {
  // Lifecycle events
  'agent-initializing': { conversationId: ConversationIdType; timestamp: Date };
  'agent-ready': { conversationId: ConversationIdType; timestamp: Date };
  'agent-state-changed': {
    previousState: AgentState;
    newState: AgentState;
    conversationId: ConversationIdType;
    timestamp: Date;
  };

  // Memory events
  'memory-loading': {
    conversationId: ConversationIdType;
    memoryType: string;
    timestamp: Date;
  };
  'memory-loaded': {
    conversationId: ConversationIdType;
    memoryType: string;
    timestamp: Date;
  };
  'memory-assembling': { conversationId: ConversationIdType; timestamp: Date };
  'memory-assembled': {
    conversationId: ConversationIdType;
    payloadSize: number;
    timestamp: Date;
  };
  'memory-switched': {
    conversationId: ConversationIdType;
    oldConfig: AgentMemoryConfig;
    newConfig: AgentMemoryConfig;
    timestamp: Date;
  };

  // Prompt building events
  'prompt-building': {
    input: string;
    tokenTarget?: number;
    contentSequence: string[];
    timestamp: Date;
  };
  'prompt-built': {
    finalTokenCount: number;
    tokenTarget?: number;
    memoryTokens: number;
    preloadTokens: number;
    timestamp: Date;
  };
  'prompt-token-limit-reached': {
    currentTokens: number;
    limit: number;
    step: string;
    timestamp: Date;
  };
  // LLM interaction events
  'llm-invocation-start': {
    provider: string;
    model: string;
    streaming: boolean;
    promptTokens: number;
    timestamp: Date;
  };
  'llm-invocation-complete': {
    provider: string;
    model: string;
    streaming: boolean;
    responseTokens?: number;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    timestamp: Date;
  };
  'llm-streaming-chunk': {
    chunk: string;
    provider: string;
    model: string;
    timestamp: Date;
  };
  'llm-provider-switched': {
    oldProvider: string;
    newProvider: string;
    reason?: string;
    timestamp: Date;
  };

  // Checkpoint events
  'checkpoint-creating': {
    conversationId: ConversationIdType;
    checkpointData: any;
    timestamp: Date;
  };
  'checkpoint-created': {
    conversationId: ConversationIdType;
    checkpointId: string;
    timestamp: Date;
  };
  'checkpoint-restoring': {
    conversationId: ConversationIdType;
    checkpointId: string;
    timestamp: Date;
  };
  'checkpoint-restored': {
    conversationId: ConversationIdType;
    checkpointId: string;
    result: any;
    timestamp: Date;
  };

  // Configuration events
  'config-updated': {
    configType: string;
    oldConfig: any;
    newConfig: any;
    timestamp: Date;
  };
  'conversation-switched': {
    oldConversationId?: ConversationIdType;
    newConversationId: ConversationIdType;
    timestamp: Date;
  };

  // Operation control events
  'operation-aborted': {
    operationType: string;
    reason?: string;
    timestamp: Date;
  };
  'correction-applied': {
    input: string;
    response: string;
    timestamp: Date;
  };
  'correction-failed': {
    input: string;
    error: string;
    timestamp: Date;
  };

  // Error and warning events
  error: {
    error: Error;
    context: string;
    timestamp: Date;
  };
  warning: {
    message: string;
    context: string;
    timestamp: Date;
  };

  // File and attachment events
  'attachments-processing': {
    fileCount: number;
    totalSize: number;
    timestamp: Date;
  };
  'attachments-processed': {
    fileCount: number;
    processedSize: number;
    duration: number;
    timestamp: Date;
  };
}

export interface ReActAgentEvents extends BaseAgentEvents {
  // ReAct agent initialization events
  'react-agent-initializing': {
    settings: Partial<ReActAgentConfig>;
    defaultSettings: Partial<ReActAgentConfig>;
    timestamp: Date;
  };
  'react-agent-configured': {
    maxSteps: number;
    temperature: number;
    provider: string;
    model: string;
    cotEnabled: boolean;
    selfConsistencyEnabled: boolean;
    timestamp: Date;
  };

  // ReAct reasoning lifecycle events
  'react-reasoning-start': {
    input: string;
    maxSteps: number;
    timestamp: Date;
  };
  'react-reasoning-complete': {
    totalSteps: number;
    maxSteps: number;
    input: string;
    timestamp: Date;
  };
  'react-max-steps-exceeded': {
    maxSteps: number;
    finalStep: number;
    input: string;
    timestamp: Date;
  };

  // Step-level events
  'react-step-start': {
    stepNumber: number;
    maxSteps: number;
    input: string;
    timestamp: Date;
  };
  'react-step-complete': {
    stepNumber: number;
    thoughtGenerated: boolean;
    actionExecuted: boolean;
    finalAnswerReached: boolean;
    timestamp: Date;
  };

  // Thought generation events
  'react-thought-generating': {
    stepNumber: number;
    promptTokens: number;
    timestamp: Date;
  };
  'react-thought-completed': {
    stepNumber: number;
    thought: string;
    timestamp: Date;
  };

  // Action planning and execution events
  'react-action-planned': {
    stepNumber: number;
    action: string;
    actionInput: any;
    thought: string;
    timestamp: Date;
  };
  'react-tool-execution-start': {
    stepNumber: number;
    toolName: string;
    toolInput: any;
    timestamp: Date;
  };
  'react-tool-execution-complete': {
    stepNumber: number;
    toolName: string;
    toolInput: any;
    observation: string;
    timestamp: Date;
  };
  'react-tool-execution-error': {
    stepNumber: number;
    toolName: string;
    toolInput: any;
    error: string;
    timestamp: Date;
  };

  // Observation events
  'react-observation-generated': {
    stepNumber: number;
    observation: string;
    timestamp: Date;
  };

  // Streaming events
  'react-streaming-chunk': {
    chunk: string;
    stepNumber: number;
    bufferLength: number;
    timestamp: Date;
  };

  // Final answer events
  'react-final-answer': {
    answer: string;
    stepNumber: number;
    totalSteps: number;
    timestamp: Date;
  };

  // Error and parsing events
  'react-parsing-error': {
    stepNumber: number;
    error: string;
    buffer?: string;
    actionInput?: string;
    timestamp: Date;
  };
}
