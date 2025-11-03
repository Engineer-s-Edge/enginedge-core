import { jest } from '@jest/globals';
import { VectorStoreRetrieverMemory } from '@core/infrastructure/agents/components/memory/structures/vector';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  VectorStoreRetrieverMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';

// Mock the vector store search result interface
interface ConvoSearchResult {
  _id: string;
  score: number;
  data?: any;
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  similarity?: number;
  type?: 'message' | 'snippet';
  metadata?: Record<string, any>;
}

describe('VectorStoreRetrieverMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockVectorStore: jest.Mocked<VectorStoreService>;
  let memory: VectorStoreRetrieverMemory;
  let config: VectorStoreRetrieverMemoryConfig;
  let mockEmbedderConfig: EmbeddingOptions;

  const userId = 'user123' as UserIdType;
  const conversationId = 'conv456' as ConversationIdType;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      log: jest.fn(),
      setContext: jest.fn(),
    } as any;

    mockVectorStore = {
      semanticSearchConvo: jest.fn(),
      textSearchConvo: jest.fn(),
      hybridSearchConvo: jest.fn(),
      changeEmbedder: jest.fn(),
      generateSnippets: jest.fn(),
      deleteConversation: jest.fn(),
    } as any;

    // Mock chain calls for changeEmbedder
    mockVectorStore.changeEmbedder.mockReturnValue(mockVectorStore);

    mockEmbedderConfig = {
      providerName: 'groq',
      modelId: 'text-embedding-ada-002',
    };

    config = {
      type: AgentMemoryType.VectorStoreRetrieverMemory,
      userId,
      conversationId,
      useSnippets: true,
      topK: 5,
      searchType: 'semantic',
      textSplitterType: 'recursive',
      textSplitterOptions: { chunkSize: 1000, chunkOverlap: 200 },
      hybridSearchAlpha: 0.5,
    };

    memory = new VectorStoreRetrieverMemory(
      mockVectorStore,
      config,
      mockLogger,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Vector store memory config: userId=${userId}, conversationId=${conversationId}, searchType=semantic, topK=5`,
        'VectorStoreRetrieverMemory',
      );
    });

    it('should throw error if conversationId not set before search', async () => {
      // Arrange - create memory without conversationId
      const uninitializedConfig = {
        ...config,
        conversationId: undefined as any,
      };
      const uninitializedMemory = new VectorStoreRetrieverMemory(
        mockVectorStore,
        uninitializedConfig,
        mockLogger,
      );

      // Act & Assert
      await expect(
        uninitializedMemory.searchMemory(
          'test query',
          5,
          true,
          mockEmbedderConfig,
        ),
      ).rejects.toThrow('Conversation not initialized');
    });
  });

  describe('configuration access', () => {
    it('should have userId and conversationId set from config', () => {
      // Assert via logs - verify config was applied correctly
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Vector store memory config: userId=${userId}, conversationId=${conversationId}, searchType=semantic, topK=5`,
        'VectorStoreRetrieverMemory',
      );
    });
  });

  describe('searchMemory routing', () => {
    const mockResults: ConvoSearchResult[] = [
      {
        _id: 'msg1',
        score: 0.95,
        data: { content: 'This is a relevant message' },
      },
      {
        _id: 'snippet1',
        score: 0.88,
        data: { content: 'This is a relevant snippet' },
      },
    ];

    beforeEach(() => {
      mockVectorStore.semanticSearchConvo.mockResolvedValue(mockResults);
      mockVectorStore.textSearchConvo.mockResolvedValue(mockResults);
      mockVectorStore.hybridSearchConvo.mockResolvedValue(mockResults);
    });

    it('should route to semantic search', async () => {
      // Act
      const results = await memory.searchMemory(
        'test query',
        5,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(mockVectorStore.changeEmbedder).toHaveBeenCalledWith(
        mockEmbedderConfig,
      );
      expect(mockVectorStore.semanticSearchConvo).toHaveBeenCalledWith(
        'test query',
        5,
        userId,
        true,
        mockEmbedderConfig,
      );
      expect(results).toEqual(mockResults);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performing semantic search',
        'VectorStoreRetrieverMemory',
      );
    });

    it('should route to text search', async () => {
      // Arrange
      config.searchType = 'text';
      memory = new VectorStoreRetrieverMemory(
        mockVectorStore,
        config,
        mockLogger,
      );

      // Act
      const results = await memory.searchMemory(
        'test query',
        3,
        false,
        mockEmbedderConfig,
      );

      // Assert
      expect(mockVectorStore.textSearchConvo).toHaveBeenCalledWith(
        'test query',
        3,
        userId,
        false,
      );
      expect(results).toEqual(mockResults);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performing text search',
        'VectorStoreRetrieverMemory',
      );
    });

    it('should route to hybrid search with alpha parameter', async () => {
      // Arrange
      config.searchType = 'hybrid';
      config.hybridSearchAlpha = 0.7;
      memory = new VectorStoreRetrieverMemory(
        mockVectorStore,
        config,
        mockLogger,
      );

      // Act
      const results = await memory.searchMemory(
        'test query',
        10,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(mockVectorStore.hybridSearchConvo).toHaveBeenCalledWith(
        'test query',
        10,
        0.7,
        userId,
        true,
        mockEmbedderConfig,
      );
      expect(results).toEqual(mockResults);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performing hybrid search (alpha=0.7)',
        'VectorStoreRetrieverMemory',
      );
    });

    it('should use default parameters from config', async () => {
      // Act - use defaults (topK will use default, but still need useSnippets and embedderConfig)
      const results = await memory.searchMemory(
        'test query',
        undefined as any,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(mockVectorStore.semanticSearchConvo).toHaveBeenCalledWith(
        'test query',
        5, // default topK from config
        userId,
        true, // useSnippets
        mockEmbedderConfig,
      );
    });
  });

  describe('getRelevantMemories', () => {
    it('should return messages and snippets from search results', async () => {
      // Arrange
      const searchResults: ConvoSearchResult[] = [
        { _id: 'msg1', score: 0.9, data: { content: 'Message content' } },
        { _id: 'snip1', score: 0.85, data: { content: 'Snippet content' } },
      ];
      mockVectorStore.semanticSearchConvo.mockResolvedValue(searchResults);

      // Act
      const memories = await memory.getRelevantMemories(
        'query',
        5,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(memories).toEqual([
        { content: 'Message content' },
        { content: 'Snippet content' },
      ]);
    });
  });

  describe('getContextForPrompt', () => {
    it('should concatenate content from search results', async () => {
      // Arrange
      const searchResults: ConvoSearchResult[] = [
        {
          _id: 'msg1',
          score: 0.9,
          data: { sender: 'user', text: 'First relevant content' },
        },
        {
          _id: 'msg2',
          score: 0.8,
          data: { sender: 'assistant', text: 'Second relevant content' },
        },
      ];
      mockVectorStore.semanticSearchConvo.mockResolvedValue(searchResults);

      // Act
      const context = await memory.getContextForPrompt(
        'query',
        5,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(typeof context).toBe('string');
      expect(context).toContain('First relevant content');
      expect(context).toContain('Second relevant content');
      expect(context).toContain('user:');
      expect(context).toContain('assistant:');
    });

    it('should handle empty search results', async () => {
      // Arrange
      mockVectorStore.semanticSearchConvo.mockResolvedValue([]);

      // Act
      const context = await memory.getContextForPrompt(
        'query',
        5,
        true,
        mockEmbedderConfig,
      );

      // Assert
      expect(context).toBe('No relevant memories found.');
    });
  });

  describe('regenerateSnippets', () => {
    it('should call vector store with new splitter and options', async () => {
      // Arrange

      // Act
      await memory.regenerateSnippets(mockEmbedderConfig, 'semantic', {
        bufferSize: 2,
        percentile: 95,
      });

      // Assert
      expect(mockVectorStore.generateSnippets).toHaveBeenCalledWith(
        conversationId,
        'semantic',
        { bufferSize: 2, percentile: 95 },
        mockEmbedderConfig,
      );
    });

    it('should update internal splitter configuration', async () => {
      // Arrange

      // Act
      await memory.regenerateSnippets(mockEmbedderConfig, 'semantic', {
        bufferSize: 3,
      });

      // Assert - verify options are stored (through subsequent calls)
      await memory.regenerateSnippets(mockEmbedderConfig);
      expect(mockVectorStore.generateSnippets).toHaveBeenCalledWith(
        conversationId,
        'semantic', // Should use updated type
        { bufferSize: 3 }, // Should use updated options
        mockEmbedderConfig,
      );
    });
  });

  describe('clear', () => {
    it('should delete conversation data in vector store', async () => {
      // Arrange

      // Act
      await memory.clear();

      // Assert
      expect(mockVectorStore.deleteConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Deleting conversation ${conversationId} for user ${userId}`,
        'VectorStoreRetrieverMemory',
      );
    });
  });

  describe('error handling', () => {
    it('should map underlying vector store error with context', async () => {
      // Arrange
      mockVectorStore.semanticSearchConvo.mockRejectedValue(
        new Error('Vector store connection failed'),
      );

      // Act & Assert
      await expect(
        memory.searchMemory('query', 5, true, mockEmbedderConfig),
      ).rejects.toThrow('Vector store connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during memory search'),
        'VectorStoreRetrieverMemory',
      );
    });

    it('should handle regenerateSnippets errors', async () => {
      // Arrange
      mockVectorStore.generateSnippets.mockRejectedValue(
        new Error('Regeneration failed'),
      );

      // Act & Assert
      await expect(
        memory.regenerateSnippets(mockEmbedderConfig),
      ).rejects.toThrow('Regeneration failed');
    });
  });

  describe('configuration behavior', () => {
    beforeEach(() => {
      // Setup mocks for these tests
      mockVectorStore.semanticSearchConvo.mockResolvedValue([]);
      mockVectorStore.textSearchConvo.mockResolvedValue([]);
      mockVectorStore.hybridSearchConvo.mockResolvedValue([]);
    });

    it('should use semantic search by default', async () => {
      // Act
      await memory.searchMemory('test', 5, true, mockEmbedderConfig);

      // Assert - verify it calls semantic search method
      expect(mockVectorStore.semanticSearchConvo).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performing semantic search',
        'VectorStoreRetrieverMemory',
      );
    });

    it('should respect configured topK setting', async () => {
      // Act - use default topK from config (5)
      await memory.searchMemory(
        'test',
        undefined as any,
        true,
        mockEmbedderConfig,
      );

      // Assert - should use default topK of 5
      expect(mockVectorStore.semanticSearchConvo).toHaveBeenCalledWith(
        'test',
        5,
        userId,
        true,
        mockEmbedderConfig,
      );
    });

    it('should handle useSnippets parameter correctly', async () => {
      // Act
      await memory.searchMemory('test', 5, false, mockEmbedderConfig);

      // Assert
      expect(mockVectorStore.semanticSearchConvo).toHaveBeenCalledWith(
        'test',
        5,
        userId,
        false,
        mockEmbedderConfig,
      );
    });
  });

  describe('addMessage and processMessage', () => {
    it('should handle addMessage gracefully (no-op for retriever)', () => {
      // Act & Assert - should not throw
      expect(() => memory.addMessage({} as any)).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Adding message from undefined to vector store memory (no direct processing)',
        'VectorStoreRetrieverMemory',
      );
    });

    it('should handle processMessage gracefully (no-op for retriever)', () => {
      // Act & Assert - should not throw
      expect(() => memory.processMessage({} as any)).not.toThrow();
    });
  });
});
