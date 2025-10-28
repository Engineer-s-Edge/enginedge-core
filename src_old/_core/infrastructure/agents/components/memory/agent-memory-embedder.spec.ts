import { jest } from '@jest/globals';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { TextSplitterService } from '@core/infrastructure/agents/components/textsplitters';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';

describe('AgentMemory.ensureEmbedder and cache', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let mockVectorStore: jest.Mocked<VectorStoreService>;
  let mockTextSplitter: jest.Mocked<TextSplitterService>;
  let agentMemory: AgentMemory;

  const mockEmbeddingModels = [
    { provider: 'groq', modelId: 'embed-1' },
    { provider: 'openai', modelId: 'text-embedding-ada-002' },
  ];

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

    mockLLM = {
      getFallbackEmbeddingModels: jest.fn(),
      invoke: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn(),
      listModels: jest.fn(),
    } as any;

    mockVectorStore = {} as any;
    mockTextSplitter = {} as any;

    // Mock getFallbackEmbeddingModels to return deterministic models
    mockLLM.getFallbackEmbeddingModels.mockResolvedValue(mockEmbeddingModels);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureEmbedder configuration', () => {
    it('should set embedderConfig and ready=true on first call', async () => {
      // Arrange - create AgentMemory without pre-configured embedder
      agentMemory = new AgentMemory(
        5, // cache size
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Verify initial state
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory will configure embedder on first use',
        'AgentMemory',
      );

      // Act - trigger embedder configuration through internal ensureEmbedder
      // Since ensureEmbedder is private, we'll test it through a public method that uses it
      // For this test, we'll access it via reflection or use awaitInit
      await agentMemory.awaitInit();

      // Assert
      expect(mockLLM.getFallbackEmbeddingModels).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory embedder configured with provider: groq, model: embed-1',
        'AgentMemory',
      );
    });

    it('should reuse existing config on subsequent calls', async () => {
      // Arrange - create AgentMemory with pre-configured embedder
      const preConfiguredEmbedder: EmbeddingOptions = {
        providerName: 'openai',
        modelId: 'text-embedding-ada-002',
      };

      agentMemory = new AgentMemory(
        3,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
        preConfiguredEmbedder,
      );

      // Verify pre-configured state
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory ready with pre-configured embedder',
        'AgentMemory',
      );

      // Act - multiple calls to awaitInit should not reconfigure
      await agentMemory.awaitInit();
      await agentMemory.awaitInit();

      // Assert
      expect(mockLLM.getFallbackEmbeddingModels).not.toHaveBeenCalled();
    });

    it('should throw clear error when no embedding models available', async () => {
      // Arrange
      mockLLM.getFallbackEmbeddingModels.mockResolvedValue([]);
      agentMemory = new AgentMemory(
        2,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Act & Assert
      await expect(agentMemory.awaitInit()).rejects.toThrow(
        'No embedding models available. Please configure at least one embedding model.',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'No embedding models available for AgentMemory',
        undefined,
        'AgentMemory',
      );
    });

    it('should handle embedder configuration errors gracefully', async () => {
      // Arrange
      mockLLM.getFallbackEmbeddingModels.mockRejectedValue(
        new Error('LLM service unavailable'),
      );
      agentMemory = new AgentMemory(
        2,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Act & Assert
      await expect(agentMemory.awaitInit()).rejects.toThrow(
        'LLM service unavailable',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to configure embedder for AgentMemory'),
        'AgentMemory',
      );
    });

    it('should filter out null models when selecting embedder', async () => {
      // Arrange
      const modelsWithNulls = [
        null,
        { provider: 'groq', modelId: 'embed-1' },
        null,
        { provider: 'openai', modelId: 'text-embedding-ada-002' },
      ];
      mockLLM.getFallbackEmbeddingModels.mockResolvedValue(
        modelsWithNulls as any,
      );
      agentMemory = new AgentMemory(
        2,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Act
      await agentMemory.awaitInit();

      // Assert - should pick the first non-null model
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory embedder configured with provider: groq, model: embed-1',
        'AgentMemory',
      );
    });
  });

  describe('cache management', () => {
    beforeEach(() => {
      agentMemory = new AgentMemory(
        3, // Small cache for testing
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );
    });

    it('should clearCache without unsetting embedder readiness', async () => {
      // Arrange - ensure embedder is ready
      await agentMemory.awaitInit();

      // Act
      agentMemory.clearCache();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleared AgentMemory cache, removed 0 conversations',
        'AgentMemory',
      );

      // Embedder should still be ready - subsequent awaitInit should not reconfigure
      mockLLM.getFallbackEmbeddingModels.mockClear();
      await agentMemory.awaitInit();
      expect(mockLLM.getFallbackEmbeddingModels).not.toHaveBeenCalled();
    });

    it('should resize cache and evict oldest entries when needed', () => {
      // Act - resize to smaller cache
      agentMemory.setCacheSize(1);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory cache resized from 3 to 1, evicted 0 conversations',
        'AgentMemory',
      );
    });

    it('should initialize with specified cache size', () => {
      // Arrange & Act
      const largeCacheMemory = new AgentMemory(
        10,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory initialized with cache size: 10',
        'AgentMemory',
      );
    });
  });

  describe('awaitInit behavior', () => {
    it('should wait for embedder configuration to complete', async () => {
      // Arrange - create memory that needs configuration
      agentMemory = new AgentMemory(
        2,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Mock a delayed response to test waiting behavior
      let resolveEmbedding: any;
      const embeddingPromise = new Promise((resolve) => {
        resolveEmbedding = resolve;
      });
      mockLLM.getFallbackEmbeddingModels.mockReturnValue(
        embeddingPromise as any,
      );

      // Act - start awaitInit
      const initPromise = agentMemory.awaitInit();

      // Should not be ready yet
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('AgentMemory embedder configured'),
        'AgentMemory',
      );

      // Complete the embedding configuration
      resolveEmbedding(mockEmbeddingModels);
      await initPromise;

      // Assert - should now be configured
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AgentMemory embedder configured with provider: groq, model: embed-1',
        'AgentMemory',
      );
    });

    it('should resolve immediately when already ready', async () => {
      // Arrange - pre-configured memory
      const preConfigured: EmbeddingOptions = {
        providerName: 'groq',
        modelId: 'embed-1',
      };
      agentMemory = new AgentMemory(
        2,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
        preConfigured,
      );

      // Act - multiple concurrent calls should all resolve quickly
      const promises = [
        agentMemory.awaitInit(),
        agentMemory.awaitInit(),
        agentMemory.awaitInit(),
      ];

      // Assert - all should resolve without calling LLM
      await Promise.all(promises);
      expect(mockLLM.getFallbackEmbeddingModels).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete lifecycle: init -> clear -> resize -> init', async () => {
      // Arrange
      agentMemory = new AgentMemory(
        5,
        mockVectorStore,
        mockTextSplitter,
        mockLLM,
        mockLogger,
      );

      // Act - complete lifecycle
      await agentMemory.awaitInit(); // Initial configuration
      agentMemory.clearCache(); // Clear cache
      agentMemory.setCacheSize(2); // Resize
      await agentMemory.awaitInit(); // Should not reconfigure

      // Assert - embedder should only be configured once
      expect(mockLLM.getFallbackEmbeddingModels).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuring embedder for AgentMemory',
        'AgentMemory',
      );
    });
  });
});
