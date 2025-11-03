import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage, MessageContent } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';
import { Embed } from '../../vectorstores/entities/store.entity';

/** Tokens used in a single request */
export interface TokenUsage {
  // Canonical fields
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  // Common alias fields used by some SDKs/mocks
  prompt?: number;
  completion?: number;
  total?: number;
}

/** Aggregated usage stats */
export interface UsageStats {
  lastRequest?: TokenUsage;
  cumulative: TokenUsage;
}

/** Result of a chat invocation */
export interface ChatInvocationResult {
  response: MessageContent;
  usage: TokenUsage;
  raw?: unknown;
  chunks?: unknown[];
  generations?: unknown[];
}

/** Result of an embedding invocation */
export interface EmbedInvocationResult {
  embeddings: Embed;
  usage?: TokenUsage;
}

/** Unified interface for chat-based LLMs and embedding models */
export default interface LLMProviderInterface {
  /** Unique provider identifier */
  providerName: string;
  /** Human-readable name */
  displayName: string;
  /** Default chat model ID */
  defaultLLMModelId: string;
  /** Default embedding model ID */
  defaultEmbeddingModelId: string;

  //─── Chat / Completion ────────────────────────────────────────────────────

  /** List available chat models */
  listModels(config?: BaseChatModelCallOptions): Promise<string[]> | string[];

  /** Instantiate a LangChain chat model */
  getLLM(modelId: string, config?: BaseChatModelCallOptions): BaseChatModel;

  /** Invoke chat with a sequence of messages */
  invokeChat(
    model: BaseChatModel,
    messages: BaseMessage[],
    config?: BaseChatModelCallOptions,
  ): Promise<ChatInvocationResult>;

  /** Stream chat responses in real-time */
  streamChat?(
    model: BaseChatModel,
    messages: BaseMessage[],
    config?: BaseChatModelCallOptions,
  ): AsyncIterable<ChatInvocationResult>;

  /** Batch multiple chat invocations */
  batchChat?(
    model: BaseChatModel,
    batchMessages: BaseMessage[][],
    config?: BaseChatModelCallOptions,
  ): Promise<ChatInvocationResult[]>;

  //─── Embeddings ──────────────────────────────────────────────────────────

  /** List available embedding models */
  listEmbeddingModels(
    config?: Record<string, unknown>,
  ): Promise<string[]> | string[];

  /** Instantiate an embedding model */
  getEmbeddingModel(
    modelId: string,
    config?: Record<string, unknown>,
  ): Embeddings;

  /** Embed a single input (text or messages) */
  embed(
    model: Embeddings,
    input: string | BaseMessage[],
    config?: Record<string, unknown>,
  ): Promise<EmbedInvocationResult>;

  /** Batch embed multiple inputs */
  embedBatch?(
    model: Embeddings,
    inputs: (string | BaseMessage[])[],
    config?: Record<string, unknown>,
  ): Promise<EmbedInvocationResult[]>;

  //─── Token Counting & Usage ──────────────────────────────────────────────

  /** Count tokens for given text or messages */
  countTokens(textOrMessages: string | BaseMessage[], modelId?: string): number;

  /** Reset cumulative usage stats */
  resetUsage?(): void;

  /** Get aggregated usage stats */
  getUsageStats(): UsageStats;

  //─── Miscellaneous ───────────────────────────────────────────────────────

  /** Check provider health (credentials, connectivity) */
  healthCheck?(): Promise<boolean>;
}
