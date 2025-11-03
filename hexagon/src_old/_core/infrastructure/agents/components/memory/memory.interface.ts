import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import EmbeddingHandler from '../embedder/embedder.service';
import { TextSplitterType } from '../textsplitters/textsplitter.factory';
import { ConversationMessage } from '../vectorstores/entities/conversation.entity';
import { Schema } from 'mongoose';

export type BufferMemoryMessage = Pick<
  ConversationMessage,
  '_id' | 'sender' | 'text'
>;

export interface MemoryStructure {
  addMessage(message: BufferMemoryMessage): any | Promise<any>;
  processMessage(message: BufferMemoryMessage): any | Promise<any>;
}

export enum AgentMemoryType {
  None = 'none',
  ConversationBufferMemory = 'cbm',
  ConversationBufferWindowMemory = 'cbwm',
  ConversationSummaryMemory = 'csm',
  ConversationSummaryBufferMemory = 'csbm',
  ConversationTokenBufferMemory = 'ctbm',
  ConversationEntityMemory = 'cem',
  ConversationKGMemory = 'ckgm',
  VectorStoreRetrieverMemory = 'vsrm',
}

// Configuration base for all memory types
export interface BaseMemoryConfig {
  type: AgentMemoryType;
  // humanPrefix?: string;
  // llmPrefix?: string;
  // historyKey?: string;
  // inputKey?: string;
  // outputKey?: string;
  // returnType?: "string" | "list";
}

/**
 * Options for configuring VectorStoreRetrieverMemory
 */
export interface VectorStoreRetrieverMemoryOptions {
  /** The user ID that owns the conversation */
  userId: UserIdType;

  /** The conversation ID to store memories in (optional, will create new if not provided) */
  conversationId?: ConversationIdType;

  /** Type of text splitter to use when creating snippets */
  textSplitterType?: TextSplitterType;

  /** Options for the text splitter */
  textSplitterOptions?: any;

  /** Whether to use semantic search, text search, or hybrid search */
  searchType?: 'semantic' | 'text' | 'hybrid';

  /** Alpha value for hybrid search (0-1), balancing semantic vs text search */
  hybridSearchAlpha?: number;
}

// Specific memory configs
export interface BufferMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationBufferMemory;
}
export interface BufferWindowMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationBufferWindowMemory;
  maxSize: number;
}
export interface TokenBufferMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationTokenBufferMemory;
  maxTokenLimit: number;
}
export interface SummaryMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationSummaryMemory;
  llm?: { provider: string; model: string; tokenLimit: number | string };
  summaryPrompt?: string;
  summary?: string;
}
export interface SummaryBufferMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationSummaryBufferMemory;
  maxSize: number;
  llm?: { provider: string; model: string; tokenLimit: number | string };
  summaryPrompt?: string;
  summaryBuffer?: BufferMemoryMessage[];
}
export interface EntityMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationEntityMemory;
  entityExtractionPrompt?: string;
  llm?: { provider: string; model: string; tokenLimit?: number | string };
  recentMessagesToConsider?: number;
  enableEntityMerging?: boolean;
  entitySimilarityThreshold?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  embedder?: EmbeddingHandler;
}
export interface KGMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.ConversationKGMemory;
  relationExtractionPrompt?: string;
  llm?: {
    provider: string;
    model: string;
    tokenLimit?: number | string;
    embeddingProvider?: string;
    embeddingModel?: string;
  };
  recentMessagesToConsider?: number;
  filterLowConfidenceRelations?: boolean;
  relationConfidenceThreshold?: number;
  enableEmbeddings?: boolean;
}
export interface VectorStoreRetrieverMemoryConfig extends BaseMemoryConfig {
  type: AgentMemoryType.VectorStoreRetrieverMemory;
  userId: UserIdType;
  conversationId: ConversationIdType;
  useSnippets: boolean;
  topK?: number;
  searchType?: 'semantic' | 'text' | 'hybrid';
  textSplitterType?: TextSplitterType;
  textSplitterOptions?: any;
  hybridSearchAlpha?: number;
}

// Union of all memory configurations
type AgentMemoryConfig =
  | BufferMemoryConfig
  | BufferWindowMemoryConfig
  | TokenBufferMemoryConfig
  | SummaryMemoryConfig
  | SummaryBufferMemoryConfig
  | EntityMemoryConfig
  | KGMemoryConfig
  | VectorStoreRetrieverMemoryConfig;

// Serialized data for each memory type
interface BufferMemoryData {
  type:
    | AgentMemoryType.ConversationBufferMemory
    | AgentMemoryType.ConversationBufferWindowMemory;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
}
interface TokenBufferMemoryData {
  type: AgentMemoryType.ConversationTokenBufferMemory;
  messages: Array<{ role: string; content: string }>; // raw messages, trimmed to token limit
}
interface SummaryMemoryData {
  type: AgentMemoryType.ConversationSummaryMemory;
  summary: string;
}
interface SummaryBufferMemoryData {
  type: AgentMemoryType.ConversationSummaryBufferMemory;
  summary: string;
  buffer: Array<{ role: string; content: string }>;
}
interface EntityMemoryData {
  type: AgentMemoryType.ConversationEntityMemory;
  entities: Array<{ [key: string]: any }>;
  history?: Array<{ role: string; content: string }>;
}
interface KGMemoryData {
  type: AgentMemoryType.ConversationKGMemory;
  graph: any; // structure representing the knowledge graph
}
interface VectorStoreRetrieverMemoryData {
  type: AgentMemoryType.VectorStoreRetrieverMemory;
  key: string;
  // serialized index or pointers to vector entries
}

// Union of all serialized memory data types
type AgentMemoryData =
  | BufferMemoryData
  | TokenBufferMemoryData
  | SummaryMemoryData
  | SummaryBufferMemoryData
  | EntityMemoryData
  | KGMemoryData
  | VectorStoreRetrieverMemoryData;

// Full memory record combining configuration and stored data
interface AgentMemoryRecord {
  config: AgentMemoryConfig;
  data: AgentMemoryData;
  lastUpdated?: string;
}

const AgentMemoryRecordSchema = new Schema<AgentMemoryRecord>({
  config: { type: Object, required: true },
  data: { type: Object, required: true },
  lastUpdated: { type: String, required: false },
});

// Export interfaces
export {
  AgentMemoryConfig,
  AgentMemoryData,
  AgentMemoryRecord,
  AgentMemoryRecordSchema,
};

/**
 * MemoryBank holds multiple agent memories keyed by agent or conversation IDs,
 * ready for persistence/storage.
 */
type MemoryBank = Record<string, AgentMemoryRecord>;
export { MemoryBank };
