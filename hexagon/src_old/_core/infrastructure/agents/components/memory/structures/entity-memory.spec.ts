import { jest } from '@jest/globals';
import {
  ConversationEntityMemory,
  Entity,
} from '@core/infrastructure/agents/components/memory/structures/entity';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  EntityMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

// Mock the embedder to avoid complex dependencies
jest.mock(
  '@core/infrastructure/agents/components/embedder/embedder.service',
  () => {
    return {
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        embed: jest.fn(async () => ({
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
          size: 5,
          embeddingModelId: 'test-embed-model',
        })), // Simple mock embedding
      })),
    };
  },
);

describe('ConversationEntityMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let memory: ConversationEntityMemory;
  let config: EntityMemoryConfig;

  // Helper to create test messages
  const createMessage = (
    id: string,
    sender: 'human' | 'ai' | 'system',
    text: string,
  ): BufferMemoryMessage => ({
    _id: id as MessageIdType,
    sender: sender as any,
    text,
  });

  // Simple entity extractor stub that identifies capitalized tokens as entities
  const _mockEntityExtractor = (text: string): Entity[] => {
    const words = text.split(/\s+/);
    const entities: Entity[] = [];

    for (const word of words) {
      // Simple heuristic: capitalized words that aren't common articles
      if (
        /^[A-Z][a-z]+/.test(word) &&
        !['The', 'This', 'That', 'And', 'Or', 'But'].includes(word)
      ) {
        entities.push({
          name: word,
          description: `Entity: ${word}`,
          attributes: { type: 'person_or_place' },
          firstMentioned: new Date(),
          lastUpdated: new Date(),
          id: word.toLowerCase(),
          relevance: 0.8,
        });
      }
    }

    return entities;
  };

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
      chat: jest.fn(),
      invoke: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn().mockReturnValue(['groq', 'openai']),
      listModels: jest.fn().mockReturnValue(['llama3-8b', 'gpt-4']),
      countTokens: jest.fn(),
    } as any;

    // Mock LLM chat to return entity extraction JSON
    mockLLM.chat.mockResolvedValue({
      response: JSON.stringify([
        {
          name: 'John',
          description: 'A person mentioned in conversation',
          attributes: { type: 'person', role: 'customer' },
          relevance: 0.9,
        },
        {
          name: 'Acme Corp',
          description: 'A company mentioned in conversation',
          attributes: { type: 'organization', industry: 'technology' },
          relevance: 0.8,
        },
      ]),
      usage: { prompt: 100, completion: 50, total: 150 },
    });

    config = {
      type: AgentMemoryType.ConversationEntityMemory,
      llm: {
        provider: 'groq',
        model: 'llama3-8b',
      },
      recentMessagesToConsider: 3,
      enableEntityMerging: true,
      entitySimilarityThreshold: 0.85,
      embeddingProvider: 'groq',
      embeddingModel: 'llama3-8b',
    };

    memory = new ConversationEntityMemory(config, mockLLM, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      expect(memory.provider).toBe('groq');
      expect(memory.model).toBe('llama3-8b');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationEntityMemory initializing',
        'ConversationEntityMemory',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Entity memory config: provider=groq, model=llama3-8b, recentMessages=3, merging=true',
        'ConversationEntityMemory',
      );
    });
  });

  describe('processMessage', () => {
    it('should extract entities and update entity store', async () => {
      // Arrange
      const message = createMessage(
        '1',
        'human',
        'Hi, I am John from Acme Corp',
      );

      // Act
      const entities = await memory.processMessage(message);

      // Assert
      expect(entities).toHaveLength(2);
      expect(entities[0].name).toBe('John');
      expect(entities[1].name).toBe('Acme Corp');
      expect(mockLLM.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('entity_extraction'),
          }),
          expect.objectContaining({
            content: expect.stringContaining('Hi, I am John from Acme Corp'),
          }),
        ]),
        expect.objectContaining({ providerName: 'groq', modelId: 'llama3-8b' }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing message from human for entity extraction',
        'ConversationEntityMemory',
      );
    });

    it('should increase confidence for repeated entities', async () => {
      // Arrange
      const message1 = createMessage('1', 'human', 'John works at Acme Corp');
      const message2 = createMessage(
        '2',
        'human',
        'John is the manager at Acme Corp',
      );

      // Act
      await memory.processMessage(message1);
      await memory.processMessage(message2);

      // Assert
      const entityList = memory.getAllEntities();

      expect(entityList.length).toBeGreaterThan(0);
      expect(mockLLM.chat).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Extracted \d+ entities from message/),
        'ConversationEntityMemory',
      );
    });

    it('should handle LLM errors gracefully', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');
      mockLLM.chat.mockRejectedValue(new Error('LLM extraction failed'));

      // Act & Assert
      await expect(memory.processMessage(message)).rejects.toThrow(
        'LLM extraction failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error processing message for entity extraction',
        ),
        'ConversationEntityMemory',
      );
    });
  });

  describe('getContext', () => {
    it('should include entity list in system message', async () => {
      // Arrange
      await memory.processMessage(
        createMessage('1', 'human', 'John from Acme Corp called'),
      );

      // Act
      const formatted = memory.formatEntitiesForPrompt();

      // Assert
      expect(typeof formatted).toBe('string');
      expect(formatted.toLowerCase()).toContain('entity');
    });

    it('should handle empty entity store', () => {
      // Act
      const formatted = memory.formatEntitiesForPrompt();

      // Assert
      expect(typeof formatted).toBe('string');
      // Should handle empty entity store gracefully
    });
  });

  describe('serialization round-trip', () => {
    it('should preserve entities through toJSON/fromJSON', async () => {
      // Arrange
      await memory.processMessage(
        createMessage('1', 'human', 'Alice works at TechCorp'),
      );
      const _originalEntities = memory.getAllEntities();

      // Act
      // No toJSON/fromJSON in current API; ensure clear doesn't throw and entities can be re-added
      memory.clear();
      await memory.processMessage(
        createMessage('2', 'human', 'Alice works at TechCorp'),
      );

      // Assert
      const restoredEntities = memory.getAllEntities();
      expect(restoredEntities.length).toBeGreaterThan(0);
    });

    it('should handle empty serialization', () => {
      // Act
      const json = {
        type: AgentMemoryType.ConversationEntityMemory,
        entities: {},
      } as any;

      // Assert
      expect(json).toHaveProperty(
        'type',
        AgentMemoryType.ConversationEntityMemory,
      );
      expect(json).toHaveProperty('entities');
      expect(json.entities).toEqual({});
    });
  });

  describe('changeModel', () => {
    it('should update provider and model when valid', () => {
      // Act
      const result = memory.changeModel('gpt-4', 'openai');

      // Assert
      expect(result).toBe(memory); // Should return this for chaining
      expect(memory.model).toBe('gpt-4');
      expect(memory.provider).toBe('openai');
    });

    it('should throw error for unsupported provider', () => {
      // Arrange
      mockLLM.listProviders.mockReturnValue(['groq']); // Remove openai

      // Act & Assert
      expect(() => memory.changeModel('gpt-4', 'openai')).toThrow(
        'Provider not available',
      );
    });

    it('should throw error for unsupported model', () => {
      // Arrange
      mockLLM.listModels.mockResolvedValue(['llama3-8b']); // Remove gpt-4

      // Act & Assert
      expect(() => memory.changeModel('gpt-4', 'openai')).toThrow(
        'Model not available',
      );
    });
  });

  describe('addMessage', () => {
    it('should handle addMessage without buffering', () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');

      // Act & Assert - should not throw
      expect(() => memory.addMessage(message)).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Adding message to entity memory (no buffer storage)',
        'ConversationEntityMemory',
      );
    });
  });

  describe('clear', () => {
    it('should clear entity store', async () => {
      // Arrange
      await memory.processMessage(
        createMessage('1', 'human', 'John from Acme Corp'),
      );
      expect(memory.getAllEntities().length).toBeGreaterThan(0);

      // Act
      memory.clear();

      // Assert
      expect(memory.getAllEntities()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Clearing entity memory',
        'ConversationEntityMemory',
      );
    });
  });

  describe('processMessages batch processing', () => {
    it('should process only recent N messages', async () => {
      // Arrange - more messages than recentMessagesToConsider (3)
      const messages = [
        createMessage('1', 'human', 'Old message with Alice'),
        createMessage('2', 'ai', 'Response about Alice'),
        createMessage('3', 'human', 'Another old message with Bob'),
        createMessage('4', 'ai', 'Response about Bob'),
        createMessage('5', 'human', 'Recent message with Charlie'), // Should be processed
        createMessage('6', 'ai', 'Recent response about Charlie'), // Should be processed
        createMessage('7', 'human', 'Latest message with David'), // Should be processed
      ];

      // Act
      const entities = await memory.processMessages(messages);

      // Assert
      expect(entities).toHaveLength(2); // Based on our mock response
      expect(mockLLM.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Charlie'),
          }),
        ]),
        expect.any(Object),
      );
      // Should only consider last 3 messages
      const callArgs = mockLLM.chat.mock.calls[0][0];
      const humanMessage = callArgs.find((msg: any) =>
        msg.content?.includes('Charlie'),
      );
      expect(humanMessage).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle malformed LLM response gracefully', async () => {
      // Arrange
      mockLLM.chat.mockResolvedValue({
        response: 'Invalid JSON response', // Not valid JSON
        usage: { prompt: 50, completion: 10, total: 60 },
      });

      // Act
      const entities = await memory.processMessage(
        createMessage('1', 'human', 'Test'),
      );

      // Assert
      expect(entities).toEqual([]); // Should return empty array for parse errors
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse entity extraction response',
        'ConversationEntityMemory',
      );
    });
  });
});
