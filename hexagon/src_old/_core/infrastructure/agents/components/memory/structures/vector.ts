import VectorStoreService, {
  ConvoSearchResult,
} from '../../vectorstores/services/vectorstore.service';
import { TextSplitterType } from '../../textsplitters/textsplitter.factory';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import {
  ConversationMessage,
  ConversationSnippet,
} from '../../vectorstores/entities/conversation.entity';
import {
  BufferMemoryMessage,
  MemoryStructure,
  VectorStoreRetrieverMemoryConfig,
} from '../memory.interface';
import { EmbeddingOptions } from '../../embedder/embedder.service';
import { Inject } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * VectorStoreRetrieverMemory
 *
 * This memory implementation stores conversation snippets as embeddings in a vector store
 * and retrieves the top-k most relevant memories based on semantic similarity. It is
 * particularly suited for retrieval-augmented generation scenarios where past snippets
 * need to be fetched semantically from a large memory store.
 *
 * It integrates with the VectorStoreService to persist memories between sessions and
 * leverages text splitting to break conversations into semantically meaningful chunks.
 */
export class VectorStoreRetrieverMemory implements MemoryStructure {
  private userId: UserIdType;
  private conversationId?: ConversationIdType;
  private searchType: 'semantic' | 'text' | 'hybrid';
  private hybridSearchAlpha: number;
  private topK: number;
  private textSplitterType: TextSplitterType;
  private textSplitterOptions: any;

  constructor(
    @Inject(VectorStoreService)
    private readonly vectorStore: VectorStoreService,
    private readonly vsrm_config: VectorStoreRetrieverMemoryConfig,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'VectorStoreRetrieverMemory initializing',
      VectorStoreRetrieverMemory.name,
    );
    this.userId = this.vsrm_config.userId;
    this.conversationId = this.vsrm_config.conversationId;
    this.searchType = this.vsrm_config.searchType || 'hybrid';
    this.hybridSearchAlpha =
      this.vsrm_config.hybridSearchAlpha !== undefined
        ? this.vsrm_config.hybridSearchAlpha
        : 0.5;
    this.topK = this.vsrm_config.topK || 5;
    this.textSplitterType = this.vsrm_config.textSplitterType || 'recursive';
    this.textSplitterOptions = this.vsrm_config.textSplitterOptions || {};
    this.logger.info(
      `Vector store memory config: userId=${this.userId}, conversationId=${this.conversationId}, searchType=${this.searchType}, topK=${this.topK}`,
      VectorStoreRetrieverMemory.name,
    );
  }

  // Add a new message to the memory
  addMessage(message: BufferMemoryMessage): void {
    this.logger.info(
      `Adding message from ${message.sender} to vector store memory (no direct processing)`,
      VectorStoreRetrieverMemory.name,
    );
    // Since the vector store links directly to the conversation, we don't need to do anything here
  }

  // Process a new message
  processMessage(message: BufferMemoryMessage): void {
    this.logger.info(
      `Processing message from ${message.sender} in vector store memory (no direct processing)`,
      VectorStoreRetrieverMemory.name,
    );
    // Since the vector store links directly to the conversation, we don't need to do anything here
  }

  /**
   * Search for relevant messages based on a query
   */
  async searchMemory(
    query: string,
    topK: number = this.topK,
    useSnippets: boolean = true,
    embedderConfig: EmbeddingOptions,
  ): Promise<ConvoSearchResult[]> {
    this.logger.info(
      `Searching memory with query: "${query}" (topK=${topK}, useSnippets=${useSnippets}, searchType=${this.searchType})`,
      VectorStoreRetrieverMemory.name,
    );
    if (!this.conversationId) {
      this.logger.error(
        'Conversation not initialized for memory search',
        VectorStoreRetrieverMemory.name,
      );
      throw new Error('Conversation not initialized. Call initialize() first.');
    }

    try {
      let results: ConvoSearchResult[];

      switch (this.searchType) {
        case 'semantic':
          this.logger.info(
            'Performing semantic search',
            VectorStoreRetrieverMemory.name,
          );
          results = await this.vectorStore
            .changeEmbedder(embedderConfig)
            .semanticSearchConvo(
              query,
              topK,
              this.userId,
              useSnippets,
              embedderConfig,
            );
          break;
        case 'text':
          this.logger.info(
            'Performing text search',
            VectorStoreRetrieverMemory.name,
          );
          results = await this.vectorStore
            .changeEmbedder(embedderConfig)
            .textSearchConvo(query, topK, this.userId, useSnippets);
          break;
        case 'hybrid':
        default:
          this.logger.info(
            `Performing hybrid search (alpha=${this.hybridSearchAlpha})`,
            VectorStoreRetrieverMemory.name,
          );
          results = await this.vectorStore
            .changeEmbedder(embedderConfig)
            .hybridSearchConvo(
              query,
              topK,
              this.hybridSearchAlpha,
              this.userId,
              useSnippets,
              embedderConfig,
            );
          break;
      }

      this.logger.info(
        `Memory search completed, found ${results.length} results`,
        VectorStoreRetrieverMemory.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error during memory search\n' + (info.stack || ''),
        VectorStoreRetrieverMemory.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Get the most relevant memories for a query
   */
  async getRelevantMemories(
    query: string,
    count: number = this.topK,
    useSnippets: boolean,
    embedderConfig: EmbeddingOptions,
  ): Promise<(ConversationMessage | ConversationSnippet)[]> {
    const searchResults = await this.searchMemory(
      query,
      count,
      useSnippets,
      embedderConfig,
    );

    return searchResults.map((result) => {
      return result.data as ConversationMessage | ConversationSnippet;
    });
  }

  /**
   * Get formatted content from relevant memories to inject into a prompt
   */
  async getContextForPrompt(
    query: string,
    count: number = this.topK,
    useSnippets: boolean,
    embedderConfig: EmbeddingOptions,
  ): Promise<string> {
    const memories = await this.getRelevantMemories(
      query,
      count,
      useSnippets,
      embedderConfig,
    );

    if (memories.length === 0) {
      return 'No relevant memories found.';
    }

    return memories
      .map((memory) => `${memory.sender}: ${memory.text}`)
      .join('\n\n');
  }

  /**
   * Update the summary of the conversation
   */
  async updateSummary(
    summary: string,
    embedderConfig: EmbeddingOptions,
  ): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation not initialized. Call initialize() first.');
    }

    await this.vectorStore.changeEmbedder(embedderConfig).updateConversation(
      this.conversationId,
      {
        summary: {
          data: summary,
        },
      },
      embedderConfig,
    );
  }

  /**
   * Clear the memory by deleting the conversation
   */
  async clear(): Promise<void> {
    this.logger.info(
      'Clearing vector store memory',
      VectorStoreRetrieverMemory.name,
    );
    if (!this.conversationId) {
      this.logger.info(
        'No conversation ID to clear',
        VectorStoreRetrieverMemory.name,
      );
      return;
    }

    try {
      this.logger.info(
        `Deleting conversation ${this.conversationId} for user ${this.userId}`,
        VectorStoreRetrieverMemory.name,
      );
      await this.vectorStore.deleteConversation(
        this.conversationId,
        this.userId,
      );
      this.conversationId = undefined;
      this.logger.info(
        'Vector store memory cleared successfully',
        VectorStoreRetrieverMemory.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error clearing vector store memory\n' + (info.stack || ''),
        VectorStoreRetrieverMemory.name,
      );
    }
  }

  /**
   * Generate snippets from existing messages in the conversation
   */
  async regenerateSnippets(
    embedderConfig: EmbeddingOptions,
    newSplitterType?: TextSplitterType,
    newSplitterOptions?: any,
  ): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation not initialized. Call initialize() first.');
    }

    const splitterType = newSplitterType || this.textSplitterType;
    const splitterOptions = newSplitterOptions || this.textSplitterOptions;

    await this.vectorStore
      .changeEmbedder(embedderConfig)
      .generateSnippets(
        this.conversationId,
        splitterType,
        splitterOptions,
        embedderConfig,
      );

    // Update internal settings if new ones were provided
    if (newSplitterType) {
      this.textSplitterType = newSplitterType;
    }

    if (newSplitterOptions) {
      this.textSplitterOptions = newSplitterOptions;
    }
  }

  /**
   * Get the conversation ID
   */
  getConversationId(): ConversationIdType | undefined {
    return this.conversationId;
  }

  /**
   * Update search configuration
   */
  updateSearchConfig(
    searchType: 'semantic' | 'text' | 'hybrid',
    hybridSearchAlpha?: number,
  ): this {
    this.searchType = searchType;

    if (hybridSearchAlpha !== undefined) {
      this.hybridSearchAlpha = hybridSearchAlpha;
    }

    return this;
  }
}
