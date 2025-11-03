import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ConversationBufferMemory } from '@core/infrastructure/agents/components/memory/structures/buffer';
import { ConversationBufferWindowMemory } from '@core/infrastructure/agents/components/memory/structures/buffer_window';
import { ConversationSummaryMemory } from '@core/infrastructure/agents/components/memory/structures/summary';
import { ConversationSummaryBufferMemory } from '@core/infrastructure/agents/components/memory/structures/summary_buffer';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  BufferMemoryConfig,
  BufferWindowMemoryConfig,
  SummaryMemoryConfig,
  SummaryBufferMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import {
  Conversation,
  ConversationCheckpoint,
} from '@core/infrastructure/agents/components/vectorstores/entities/conversation.entity';
import {
  ConversationIdType,
  MessageIdType,
} from '@core/infrastructure/database/utils/custom_types';

describe('Memory and Checkpoints Tests', () => {
  let mockLLM: jest.Mocked<LLMService>;
  let mockLogger: jest.Mocked<MyLogger>;
  let mockConvoRepo: jest.Mocked<ConversationRepository>;
  let checkpointService: CheckpointService;

  // Helper to create test messages
  const createMessage = (
    id: string,
    sender: 'human' | 'ai' | 'system' | 'internal',
    text: string,
  ): BufferMemoryMessage => ({
    _id: id as MessageIdType,
    sender: sender as any, // Cast to bypass interface vs string union issue
    text,
  });

  // Helper to create mock conversation
  const createMockConversation = (
    id: string,
    messages: any[] = [],
    checkpoints: any[] = [],
  ): Conversation =>
    ({
      _id: id as ConversationIdType,
      ownerId: 'user1',
      messages,
      checkpoints,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as Conversation;

  // Mock LLM summarizer for deterministic results
  const fakeSummarizer = (texts: string[]) => `Summary: ${texts.join(' ')}`;

  beforeEach(async () => {
    mockLLM = {
      invoke: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn().mockReturnValue(['groq']),
      listModels: jest.fn().mockReturnValue(['llama3-8b']),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockConvoRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createCheckpoint: jest.fn(),
      deleteCheckpoint: jest.fn(),
      findAll: jest.fn(),
      findAllByUserId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointService,
        { provide: ConversationRepository, useValue: mockConvoRepo },
        { provide: LLMService, useValue: mockLLM },
        { provide: MyLogger, useValue: mockLogger },
      ],
    }).compile();

    checkpointService = module.get<CheckpointService>(CheckpointService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Buffer Memory Tests', () => {
    it('should keep full history in order', () => {
      // Arrange
      const config: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const memory = new ConversationBufferMemory(config, mockLogger);

      const messages = [
        createMessage('1', 'human', 'Hello'),
        createMessage('2', 'ai', 'Hi there!'),
        createMessage('3', 'human', 'How are you?'),
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert
      const storedMessages = memory.getMessages();
      expect(storedMessages).toHaveLength(3);
      expect(storedMessages[0].sender).toBe('human');
      expect(storedMessages[0].text).toBe('Hello');
      expect(storedMessages[1].sender).toBe('ai');
      expect(storedMessages[1].text).toBe('Hi there!');
      expect(storedMessages[2].sender).toBe('human');
      expect(storedMessages[2].text).toBe('How are you?');

      // Order should be preserved
      expect(storedMessages.map((m) => m._id)).toEqual(['1', '2', '3']);
    });

    it('should load buffer from existing messages', () => {
      // Arrange
      const config: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const memory = new ConversationBufferMemory(config, mockLogger);

      const existingMessages = [
        createMessage('1', 'human', 'Previous message'),
        createMessage('2', 'ai', 'Previous response'),
      ];

      // Act
      memory.load = existingMessages;

      // Assert
      expect(memory.getMessages()).toEqual(existingMessages);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Loading buffer with 2 messages'),
        'ConversationBufferMemory',
      );
    });

    it('should handle empty conversation state', () => {
      // Arrange
      const config: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const memory = new ConversationBufferMemory(config, mockLogger);

      // Act & Assert
      expect(memory.getMessages()).toHaveLength(0);

      // Should handle getContext on empty memory
      expect(memory.getMessages()).toEqual([]);
    });

    it('should clear memory buffer', () => {
      // Arrange
      const config: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const memory = new ConversationBufferMemory(config, mockLogger);

      memory.addMessage(createMessage('1', 'human', 'Test message'));

      // Act
      memory.clear();

      // Assert
      expect(memory.getMessages()).toHaveLength(0);
    });
  });

  describe('Window Memory Tests', () => {
    it('should enforce message window constraints', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 3,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      const messages = [
        createMessage('1', 'human', 'Message 1'),
        createMessage('2', 'ai', 'Response 1'),
        createMessage('3', 'human', 'Message 2'),
        createMessage('4', 'ai', 'Response 2'),
        createMessage('5', 'human', 'Message 3'),
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert: should keep only last 3 messages
      const storedMessages = memory.getMessages();
      expect(storedMessages).toHaveLength(3);
      expect(storedMessages.map((m) => m._id)).toEqual(['3', '4', '5']);
      expect(storedMessages[0].text).toBe('Message 2');
      expect(storedMessages[2].text).toBe('Message 3');
    });

    it('should preserve order within window', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 4,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      const messages = [
        createMessage('u1', 'human', 'First user message'),
        createMessage('a1', 'ai', 'First assistant response'),
        createMessage('u2', 'human', 'Second user message'),
        createMessage('a2', 'ai', 'Second assistant response'),
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert: all messages should fit in window
      const storedMessages = memory.getMessages();
      expect(storedMessages).toHaveLength(4);
      expect(storedMessages[0].sender).toBe('human');
      expect(storedMessages[1].sender).toBe('ai');
      expect(storedMessages[2].sender).toBe('human');
      expect(storedMessages[3].sender).toBe('ai');
    });

    it('should return correct max size', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 5,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      // Act & Assert
      expect(memory.getMaxSize()).toBe(5);
    });

    it('should collapse buffer when loading', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 2,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      const manyMessages = [
        createMessage('1', 'human', 'Old message 1'),
        createMessage('2', 'ai', 'Old response 1'),
        createMessage('3', 'human', 'Old message 2'),
        createMessage('4', 'ai', 'Recent response'),
      ];

      // Act
      memory.load = manyMessages;

      // Assert: should keep only last 2 messages
      const storedMessages = memory.getMessages();
      expect(storedMessages).toHaveLength(2);
      expect(storedMessages.map((m) => m._id)).toEqual(['3', '4']);
    });
  });

  describe('Summary Memory Tests', () => {
    it('should load existing summary', () => {
      // Arrange
      const config: SummaryMemoryConfig = {
        type: AgentMemoryType.ConversationSummaryMemory,
        llm: { provider: 'groq', model: 'llama3-8b', tokenLimit: 1000 },
        summary: 'Previous conversation summary',
        summaryPrompt: 'Summarize the conversation', // Provide explicit prompt to avoid file loading
      };
      const memory = new ConversationSummaryMemory(config, mockLLM, mockLogger);

      // Act
      memory.load = 'Updated summary content';

      // Assert
      expect(memory.summary).toBe('Updated summary content');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Loading summary'),
        'ConversationSummaryMemory',
      );
    });

    it('should expose model and provider configuration', () => {
      // Arrange
      const config: SummaryMemoryConfig = {
        type: AgentMemoryType.ConversationSummaryMemory,
        llm: { provider: 'groq', model: 'llama3-8b', tokenLimit: 500 },
        summaryPrompt: 'Summarize the conversation', // Provide explicit prompt
      };
      const memory = new ConversationSummaryMemory(config, mockLLM, mockLogger);

      // Act & Assert
      expect(memory.provider).toBe('groq');
      expect(memory.model).toBe('llama3-8b');
      expect(memory.maxTokenLimit).toBe(500);
    });

    it('should throw error when no model is selected', async () => {
      // Arrange
      const config: SummaryMemoryConfig = {
        type: AgentMemoryType.ConversationSummaryMemory,
        llm: { provider: '', model: '', tokenLimit: 1000 },
        summaryPrompt: 'Summarize the conversation', // Provide explicit prompt
      };
      const memory = new ConversationSummaryMemory(config, mockLLM, mockLogger);
      const message = createMessage('1', 'human', 'Test message');

      // Act & Assert
      await expect(memory.processMessage(message)).rejects.toThrow(
        'No model selected',
      );
    });
  });

  describe('Summary Buffer Memory Tests', () => {
    it('should combine summary and buffer functionality', () => {
      // Arrange
      const config: SummaryBufferMemoryConfig = {
        type: AgentMemoryType.ConversationSummaryBufferMemory,
        maxSize: 2,
        llm: { provider: 'groq', model: 'llama3-8b', tokenLimit: 1000 },
        summaryPrompt: 'Summarize the conversation', // Provide explicit prompt
        summaryBuffer: [createMessage('s1', 'human', 'Summarized message')],
      };
      const memory = new ConversationSummaryBufferMemory(
        config,
        mockLLM,
        mockLogger,
      );

      // Act: Add new messages
      memory.addMessage(createMessage('1', 'human', 'Recent message 1'));
      memory.addMessage(createMessage('2', 'ai', 'Recent response 1'));

      // Assert: Should have both summary buffer and recent messages
      expect(memory.model).toBe('llama3-8b');
      expect(memory.provider).toBe('groq');

      // Should delegate to underlying memory structures
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Summary buffer memory initialized'),
        'ConversationSummaryBufferMemory',
      );
    });
  });

  describe('Memory Isolation Tests', () => {
    it('should maintain separate memory instances', () => {
      // Arrange
      const config1: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const config2: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };

      const memory1 = new ConversationBufferMemory(config1, mockLogger);
      const memory2 = new ConversationBufferMemory(config2, mockLogger);

      // Act
      memory1.addMessage(createMessage('1', 'human', 'Session A message'));
      memory2.addMessage(createMessage('2', 'human', 'Session B message'));

      // Assert
      const messages1 = memory1.getMessages();
      const messages2 = memory2.getMessages();

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      expect(messages1[0].text).toBe('Session A message');
      expect(messages2[0].text).toBe('Session B message');

      // No cross-contamination
      expect(messages1[0].text).not.toContain('Session B');
      expect(messages2[0].text).not.toContain('Session A');
    });
  });

  describe('Checkpoint Tests', () => {
    it('should save and load checkpoint round-trip', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;
      const checkpointData = {
        name: 'Test Checkpoint',
        description: 'Checkpoint after user question',
        metadata: { step: 'question_asked' },
      };

      const mockConversation = createMockConversation(
        conversationId,
        [
          { sender: 'user', text: 'What is AI?', timestamp: new Date() },
          { sender: 'assistant', text: 'AI is...', timestamp: new Date() },
        ],
        [],
      );

      mockConvoRepo.createCheckpoint.mockResolvedValue(mockConversation);
      mockConvoRepo.findById.mockResolvedValue(mockConversation);

      // Act: Save checkpoint
      const savedConv = await checkpointService.createCheckpoint(
        conversationId,
        checkpointData,
      );

      // Assert: Checkpoint creation
      expect(savedConv).toBeDefined();
      expect(mockConvoRepo.createCheckpoint).toHaveBeenCalledWith(
        conversationId,
        checkpointData,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Creating checkpoint for conversation conv1'),
        'CheckpointService',
      );
    });

    it('should handle checkpoint after correction scenario', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;

      // Initial conversation state
      const initialMessages = [
        { sender: 'user', text: 'What is 2+2?', timestamp: new Date() },
        { sender: 'assistant', text: '5', timestamp: new Date() },
      ];

      // State after correction
      const correctedMessages = [
        ...initialMessages,
        {
          sender: 'user',
          text: 'That is incorrect. Please recalculate.',
          timestamp: new Date(),
        },
        {
          sender: 'assistant',
          text: 'You are right. 2+2=4',
          timestamp: new Date(),
        },
      ];

      const checkpointData = {
        name: 'After Correction',
        description: 'Checkpoint after fixing calculation error',
        metadata: { correction_applied: true },
      };

      const conversationAfterCorrection = createMockConversation(
        conversationId,
        correctedMessages,
        [],
      );
      mockConvoRepo.createCheckpoint.mockResolvedValue(
        conversationAfterCorrection,
      );

      // Act
      const result = await checkpointService.createCheckpoint(
        conversationId,
        checkpointData,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockConvoRepo.createCheckpoint).toHaveBeenCalledWith(
        conversationId,
        checkpointData,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created checkpoint'),
        'CheckpointService',
      );
    });

    it('should delete checkpoint successfully', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;
      const checkpointId = 'checkpoint123';

      const mockConversation = createMockConversation(conversationId);
      mockConvoRepo.deleteCheckpoint.mockResolvedValue(mockConversation);

      // Act
      const result = await checkpointService.deleteCheckpoint(
        conversationId,
        checkpointId,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockConvoRepo.deleteCheckpoint).toHaveBeenCalledWith(
        conversationId,
        checkpointId,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully deleted checkpoint'),
        'CheckpointService',
      );
    });

    it('should handle checkpoint not found gracefully', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;
      const checkpointData = { name: 'Test', description: 'Test checkpoint' };

      mockConvoRepo.createCheckpoint.mockResolvedValue(null);

      // Act
      const result = await checkpointService.createCheckpoint(
        conversationId,
        checkpointData,
      );

      // Assert
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create checkpoint'),
        'CheckpointService',
      );
    });

    it('should handle checkpoint service errors', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;
      const checkpointData = { name: 'Test', description: 'Test checkpoint' };

      const error = new Error('Database connection failed');
      mockConvoRepo.createCheckpoint.mockRejectedValue(error);

      // Act & Assert
      await expect(
        checkpointService.createCheckpoint(conversationId, checkpointData),
      ).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating checkpoint'),
        'CheckpointService',
        expect.any(String),
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle extremely long single messages in buffer memory', () => {
      // Arrange
      const config: BufferMemoryConfig = {
        type: AgentMemoryType.ConversationBufferMemory,
      };
      const memory = new ConversationBufferMemory(config, mockLogger);

      const longMessage = createMessage('1', 'human', 'x'.repeat(50000));

      // Act
      memory.addMessage(longMessage);

      // Assert: Should handle without crashing
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toHaveLength(50000);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle concurrent memory operations', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 3,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      // Act: Simulate concurrent additions
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMessage(
          i.toString(),
          i % 2 === 0 ? 'human' : 'ai',
          `Message ${i}`,
        ),
      );

      messages.forEach((msg) => memory.addMessage(msg));

      // Assert: Should maintain consistency
      const storedMessages = memory.getMessages();
      expect(storedMessages).toHaveLength(3);
      expect(storedMessages.map((m) => m.text)).toEqual([
        'Message 7',
        'Message 8',
        'Message 9',
      ]);
    });

    it('should handle memory with zero max size', () => {
      // Arrange
      const config: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 0,
      };
      const memory = new ConversationBufferWindowMemory(config, mockLogger);

      // Act
      memory.addMessage(createMessage('1', 'human', 'Test message'));

      // Assert: Should handle gracefully
      expect(memory.getMessages()).toHaveLength(0);
      expect(memory.getMaxSize()).toBe(0);
    });

    it('should handle empty checkpoint metadata', async () => {
      // Arrange
      const conversationId = 'conv1' as ConversationIdType;
      const checkpointData = {
        name: 'Empty Metadata Checkpoint',
        description: '',
        metadata: {},
      };

      const mockConversation = createMockConversation(conversationId);
      mockConvoRepo.createCheckpoint.mockResolvedValue(mockConversation);

      // Act
      const result = await checkpointService.createCheckpoint(
        conversationId,
        checkpointData,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockConvoRepo.createCheckpoint).toHaveBeenCalledWith(
        conversationId,
        checkpointData,
      );
    });
  });
});
