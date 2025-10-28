import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { VectorStoreRepository } from '@core/infrastructure/agents/components/vectorstores/repos/store.repository';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import EmbeddingHandler, {
  EmbeddingOptions,
} from '@core/infrastructure/agents/components/embedder/embedder.service';
import { TextSplitterService } from '@core/infrastructure/agents/components/textsplitters';
import { MyLogger } from '@core/services/logger/logger.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { Embed } from '@core/infrastructure/agents/components/vectorstores/entities/store.entity';

// Result shape from VectorStoreService search APIs
interface ConvoSearchResultOut {
  _id: string;
  score: number;
  data?: { text: string };
}

describe('VectorStoreService Conversation Embeddings (Integration)', () => {
  let service: VectorStoreService;
  let mockVectorStoreRepo: jest.Mocked<VectorStoreRepository>;
  let mockConversationRepo: jest.Mocked<ConversationRepository>;
  let mockEmbeddingHandler: jest.Mocked<EmbeddingHandler>;
  let mockTextSplitterService: jest.Mocked<TextSplitterService>;
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;

  const userId = 'user123' as UserIdType;
  const conversationId = 'conv456' as ConversationIdType;
  const embeddingConfig: EmbeddingOptions = {
    providerName: 'groq',
    modelId: 'text-embedding-ada-002',
  };

  // Mock embedding vectors for deterministic testing
  const mockEmbedding: Embed = {
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    size: 5,
    embeddingModelId: 'test',
  };
  const similarEmbedding: Embed = {
    embedding: [0.15, 0.25, 0.35, 0.45, 0.55],
    size: 5,
    embeddingModelId: 'test',
  }; // Similar to mockEmbedding
  const _differentEmbedding: Embed = {
    embedding: [0.9, 0.8, 0.7, 0.6, 0.5],
    size: 5,
    embeddingModelId: 'test',
  }; // Different from mockEmbedding

  beforeEach(async () => {
    // Create mocked dependencies
    mockVectorStoreRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByConversation: jest.fn(),
    } as any;

    mockConversationRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findAllByUserId: jest.fn(),
    } as any;

    mockEmbeddingHandler = {
      embed: jest.fn(),
    } as any;

    mockTextSplitterService = {
      split: jest.fn(),
      splitWithLines: jest.fn(),
    } as any;

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
      chat: jest.fn(),
    } as any;

    // Setup mock implementations
    mockEmbeddingHandler.embed.mockResolvedValue(mockEmbedding);

    mockTextSplitterService.split.mockResolvedValue([
      'First text chunk here.',
      'Second text chunk follows.',
    ]);
    mockTextSplitterService.splitWithLines.mockResolvedValue([
      {
        text: 'First text chunk here.',
        start: { line: 1, character: 0 },
        end: { line: 1, character: 10 },
      },
      {
        text: 'Second text chunk follows.',
        start: { line: 2, character: 0 },
        end: { line: 2, character: 22 },
      },
    ]);

    // LLM mock used by createConversation for summary generation
    (mockLLM.chat as any).mockResolvedValue({ response: 'Mock summary' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreService,
        { provide: VectorStoreRepository, useValue: mockVectorStoreRepo },
        { provide: ConversationRepository, useValue: mockConversationRepo },
        { provide: EmbeddingHandler, useValue: mockEmbeddingHandler },
        { provide: TextSplitterService, useValue: mockTextSplitterService },
        { provide: LLMService, useValue: mockLLM },
        { provide: MyLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<VectorStoreService>(VectorStoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should generate embeddings based on options flags', async () => {
      // Arrange
      const options = {
        summary: { generate: true, generateEmbed: true },
        messages: { generateEmbed: true },
        snippets: {
          split: true,
          generateEmbed: true,
          splitType: 'character' as const,
        },
      };
      const initialMessages = [
        {
          sender: 'human' as any,
          text: 'Hello world',
          nodeId: 'n1' as any,
          timestamp: new Date().toISOString(),
          order: 0,
        },
        {
          sender: 'ai' as any,
          text: 'Hi there!',
          nodeId: 'n1' as any,
          timestamp: new Date().toISOString(),
          order: 1,
        },
      ];
      (mockConversationRepo.create as any).mockImplementation(
        async () => ({}) as any,
      );

      // Act
      await service.createConversation(
        userId,
        'graphAgent' as any,
        'node-1' as any,
        {} as any,
        { initialMessages, ...options },
        embeddingConfig,
      );

      // Assert - should call embed for summary, messages, and snippets
      // summary + 2 messages + >=2 snippets
      expect(
        (mockEmbeddingHandler.embed as jest.Mock).mock.calls.length,
      ).toBeGreaterThanOrEqual(5);
      expect(mockConversationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: userId,
          messages: expect.any(Array),
          snippets: expect.any(Array),
          summary: expect.objectContaining({
            data: expect.any(String),
            embedding: mockEmbedding,
          }),
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created conversation'),
        'VectorStoreService',
      );
    });

    it('should skip embedding generation when flags are false', async () => {
      // Arrange
      const options = {
        summary: { generate: false, generateEmbed: false },
        messages: { generateEmbed: false },
        snippets: { split: false, generateEmbed: false },
      } as const;
      (mockConversationRepo.create as any).mockImplementation(
        async () => ({}) as any,
      );

      // Act
      await service.createConversation(
        userId,
        'graphAgent' as any,
        'node-1' as any,
        {} as any,
        { initialMessages: [], ...options },
        embeddingConfig,
      );

      // Assert - should not call embed
      expect(mockEmbeddingHandler.embed).not.toHaveBeenCalled();
      expect(mockConversationRepo.create).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('should generate message and snippet embeddings when enabled', async () => {
      // Arrange
      const messageContent = 'New test message content';
      const mockConversation = {
        _id: conversationId,
        ownerId: userId,
        messages: [],
      };
      mockConversationRepo.findById.mockResolvedValue(mockConversation as any);
      (mockTextSplitterService.splitWithLines as any).mockImplementationOnce(
        async () => [
          {
            text: 'First text chunk here.',
            start: { line: 1, character: 0 },
            end: { line: 1, character: 10 },
          },
          {
            text: 'Second text chunk follows.',
            start: { line: 2, character: 0 },
            end: { line: 2, character: 22 },
          },
        ],
      );

      // Act
      await service.addMessage(
        conversationId,
        {
          text: messageContent,
          sender: 'human' as any,
          nodeId: 'n1' as any,
          timestamp: new Date().toISOString(),
          order: 0,
        },
        true,
        true,
        true,
        'character',
        {},
        embeddingConfig,
      );

      // Assert
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        messageContent,
        embeddingConfig,
      );
      expect(mockTextSplitterService.splitWithLines).toHaveBeenCalled();
      expect(mockConversationRepo.update).toHaveBeenCalled();
    });

    it('should skip embedding generation when flags are disabled', async () => {
      // Arrange
      const messageContent = 'Test message without embeddings';
      const mockConversation = {
        _id: conversationId,
        ownerId: userId,
        messages: [],
      };
      mockConversationRepo.findById.mockResolvedValue(mockConversation as any);

      // Act
      await service.addMessage(
        conversationId,
        {
          text: messageContent,
          sender: 'human' as any,
          nodeId: 'n1' as any,
          timestamp: new Date().toISOString(),
          order: 0,
        },
        false,
        false,
        false,
      );

      // Assert
      expect(mockEmbeddingHandler.embed).not.toHaveBeenCalled();
      expect(mockTextSplitterService.splitWithLines).not.toHaveBeenCalled();
    });
  });

  describe('attachEmbeddingsToConversation', () => {
    const mockConversation = {
      _id: conversationId,
      ownerId: userId,
      messages: [
        { _id: 'msg1', text: 'Message 1', sender: 'human' },
        { _id: 'msg2', text: 'Message 2', sender: 'ai' },
      ],
      snippets: [
        { _id: 'sn1', parentId: 'msg1', text: 'Snippet 1', sender: 'human' },
        { _id: 'sn2', parentId: 'msg2', text: 'Snippet 2', sender: 'ai' },
      ],
      summary: { data: 'Test conversation summary', embedding: undefined },
    } as any;

    beforeEach(() => {
      mockConversationRepo.findById.mockResolvedValue(mockConversation as any);
    });

    it('should throw unauthorized error for non-owner', async () => {
      // Arrange
      const unauthorizedUserId = 'otherUser' as UserIdType;

      // Act & Assert
      await expect(
        service.attachEmbeddingsToConversation(
          conversationId,
          { summary: true, messages: true, snippets: true },
          { ownerId: unauthorizedUserId },
          embeddingConfig,
        ),
      ).rejects.toThrow(/Unauthorized/);
    });

    it('should generate only summary embeddings when summary flag is true', async () => {
      // Act
      await service.attachEmbeddingsToConversation(
        conversationId,
        { summary: false, messages: false, snippets: true },
        { ownerId: userId },
        embeddingConfig,
      );

      // Assert
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        'Snippet 1',
        embeddingConfig,
      );
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        'Snippet 2',
        embeddingConfig,
      );
    });
  });

  describe('semanticSearchConvo and hybridSearchConvo', () => {
    beforeEach(() => {
      (mockConversationRepo.findAllByUserId as any).mockImplementation(
        async () => [
          {
            _id: 'c1',
            ownerId: userId,
            messages: [
              {
                _id: 'msg1',
                text: 'Very relevant content',
                sender: 'human',
                embedding: mockEmbedding,
              },
              {
                _id: 'msg2',
                text: 'Less relevant content',
                sender: 'human',
                embedding: similarEmbedding,
              },
            ],
            snippets: [
              {
                _id: 'snippet1',
                text: 'Most relevant snippet',
                sender: 'human',
                embedding: mockEmbedding,
                parentId: 'msg1',
                position: {
                  start: { line: 1, character: 0 },
                  end: { line: 1, character: 10 },
                },
              },
              {
                _id: 'snippet2',
                text: 'Somewhat relevant snippet',
                sender: 'human',
                embedding: similarEmbedding,
                parentId: 'msg2',
                position: {
                  start: { line: 2, character: 0 },
                  end: { line: 2, character: 22 },
                },
              },
            ],
          },
        ],
      );
    });

    it('should generate query embedding once and return ordered results', async () => {
      // Act
      const results = await service.semanticSearchConvo(
        'test query',
        5,
        userId,
        true,
        embeddingConfig,
      );

      // Assert
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        'test query',
        embeddingConfig,
      );
      expect(Array.isArray(results)).toBe(true);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('should blend scores correctly in hybrid search with alpha parameter', async () => {
      // Arrange
      const alpha = 0.7; // Favor semantic over text search
      // Mock text search results with different scores
      (service as any).textSearchConvo = jest.fn().mockImplementation(
        async () =>
          [
            { _id: 'msg1', score: 0.6 },
            { _id: 'snippet1', score: 0.9 },
          ] as ConvoSearchResultOut[],
      );

      // Act
      const results = await service.hybridSearchConvo(
        'test query',
        5,
        alpha,
        userId,
        true,
        embeddingConfig,
      );

      // Assert
      expect((service as any).textSearchConvo).toHaveBeenCalled();
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        'test query',
        embeddingConfig,
      );

      // Verify hybrid scoring: alpha * semantic + (1-alpha) * text
      // First result: 0.7 * 0.9 + 0.3 * 0.6 = 0.81
      // Second result: 0.7 * 0.8 + 0.3 * 0.9 = 0.83
      // So second should rank higher in hybrid
      expect(results[0].score).toBeGreaterThan(0.8);
    });

    it('should handle ordering changes when alpha shifts in hybrid search', async () => {
      // Arrange - setup results where text and semantic rankings differ
      (mockConversationRepo.findAllByUserId as any).mockImplementation(
        async () => [
          {
            _id: 'c1',
            ownerId: userId,
            messages: [
              {
                _id: 'A',
                text: 'Content A',
                sender: 'human',
                embedding: mockEmbedding,
              },
              {
                _id: 'B',
                text: 'Content B',
                sender: 'human',
                embedding: similarEmbedding,
              },
            ],
            snippets: [],
          },
        ],
      );
      // Force semantic search to prefer A and text search to prefer B
      (service as any).semanticSearchConvo = jest.fn().mockImplementation(
        async () =>
          [
            { _id: 'A', score: 1.0 },
            { _id: 'B', score: 0.2 },
          ] as ConvoSearchResultOut[],
      );
      (service as any).textSearchConvo = jest.fn().mockImplementation(
        async () =>
          [
            { _id: 'A', score: 0.6 },
            { _id: 'B', score: 0.95 },
          ] as ConvoSearchResultOut[],
      );

      // Act - test with high alpha (favor semantic)
      const highAlphaResults = await service.hybridSearchConvo(
        'query',
        5,
        0.9,
        userId,
        false,
        embeddingConfig,
      );

      // Act - test with low alpha (favor text)
      const lowAlphaResults = await service.hybridSearchConvo(
        'query',
        5,
        0.1,
        userId,
        false,
        embeddingConfig,
      );

      // Assert - ordering should change based on alpha
      expect(highAlphaResults[0]._id).toBe('A'); // Semantic winner with high alpha
      expect(lowAlphaResults[0]._id).toBe('B'); // Text winner with low alpha
    });
  });

  describe('changeEmbedder', () => {
    it('should persist new embedder configuration and use in subsequent operations', async () => {
      // Arrange
      const newEmbeddingConfig: EmbeddingOptions = {
        providerName: 'openai',
        modelId: 'text-embedding-ada-002',
      };

      // Act
      const result = service.changeEmbedder(newEmbeddingConfig);

      // Assert - should return service for chaining
      expect(result).toBe(service);

      // Act - perform an operation that uses embeddings
      (mockConversationRepo.findAllByUserId as any).mockImplementation(
        async () => [],
      );
      await service.semanticSearchConvo('test', 5, userId, true);

      // Assert - should use new embedder configuration
      expect(mockEmbeddingHandler.embed).toHaveBeenCalledWith(
        'test',
        newEmbeddingConfig,
      );
    });
  });

  describe('error handling', () => {
    it('should handle embedding service errors gracefully', async () => {
      // Arrange
      mockEmbeddingHandler.embed.mockRejectedValue(
        new Error('Embedding service failed'),
      );
      const mockConversation = {
        _id: conversationId,
        ownerId: userId,
        messages: [],
      };
      mockConversationRepo.findById.mockResolvedValue(mockConversation as any);

      // Act & Assert
      await expect(
        service.addMessage(
          conversationId,
          {
            text: 'test',
            sender: 'human' as any,
            nodeId: 'n1' as any,
            timestamp: new Date().toISOString(),
            order: 0,
          },
          true,
          false,
          false,
          undefined,
          undefined,
          embeddingConfig,
        ),
      ).rejects.toThrow('Embedding service failed');
    });

    it('should handle repository errors in search operations', async () => {
      // Arrange
      (mockConversationRepo.findAllByUserId as any).mockImplementation(
        async () => {
          throw new Error('Database connection failed');
        },
      );

      // Act & Assert
      await expect(
        service.semanticSearchConvo('query', 5, userId, true, embeddingConfig),
      ).rejects.toThrow('Database connection failed');
    });
  });
});
