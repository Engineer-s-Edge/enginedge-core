import { jest } from '@jest/globals';
import { ConversationBufferWindowMemory } from '@core/infrastructure/agents/components/memory/structures/buffer_window';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  BufferWindowMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

describe('ConversationBufferWindowMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let memory: ConversationBufferWindowMemory;
  let config: BufferWindowMemoryConfig;

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

    config = {
      type: AgentMemoryType.ConversationBufferWindowMemory,
      maxSize: 3, // Keep last 3 messages
    };

    memory = new ConversationBufferWindowMemory(config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configured window size', () => {
      expect(memory.getMaxSize()).toBe(3);
      expect(memory.getMessages()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationBufferWindowMemory initializing with maxSize: 3',
        'ConversationBufferWindowMemory',
      );
    });

    it('should handle zero window size', () => {
      // Arrange
      const zeroConfig: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 0,
      };

      // Act
      const zeroMemory = new ConversationBufferWindowMemory(
        zeroConfig,
        mockLogger,
      );

      // Assert
      expect(zeroMemory.getMaxSize()).toBe(0);
      expect(zeroMemory.getMessages()).toEqual([]);
    });
  });

  describe('addMessage with window behavior', () => {
    it('should retain last N messages within window size', () => {
      // Arrange
      const messages = [
        createMessage('1', 'human', 'Message 1'),
        createMessage('2', 'ai', 'Response 1'),
        createMessage('3', 'human', 'Message 2'),
        createMessage('4', 'ai', 'Response 2'),
        createMessage('5', 'human', 'Message 3'),
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0]).toEqual(messages[2]); // Message 2
      expect(context[1]).toEqual(messages[3]); // Response 2
      expect(context[2]).toEqual(messages[4]); // Message 3
    });

    it('should trim oldest messages when exceeding window size', () => {
      // Arrange - Add exactly window size messages first
      memory.addMessage(createMessage('1', 'human', 'Keep 1'));
      memory.addMessage(createMessage('2', 'ai', 'Keep 2'));
      memory.addMessage(createMessage('3', 'human', 'Keep 3'));
      expect(memory.getMessages()).toHaveLength(3);

      // Act - Add one more to trigger trimming
      memory.addMessage(createMessage('4', 'ai', 'New message'));

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0].text).toBe('Keep 2'); // First message dropped
      expect(context[1].text).toBe('Keep 3');
      expect(context[2].text).toBe('New message');
    });

    it('should handle multiple additions beyond window size', () => {
      // Arrange & Act - Add 7 messages to a window of 3
      for (let i = 1; i <= 7; i++) {
        memory.addMessage(
          createMessage(
            i.toString(),
            i % 2 === 1 ? 'human' : 'ai',
            `Message ${i}`,
          ),
        );
      }

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0].text).toBe('Message 5');
      expect(context[1].text).toBe('Message 6');
      expect(context[2].text).toBe('Message 7');
    });
  });

  describe('getContext respects window after multiple adds', () => {
    it('should maintain chronological order within window', () => {
      // Arrange
      const testMessages = Array.from({ length: 10 }, (_, i) =>
        createMessage(
          (i + 1).toString(),
          i % 2 === 0 ? 'human' : 'ai',
          `Content ${i + 1}`,
        ),
      );

      // Act
      testMessages.forEach((msg) => memory.addMessage(msg));

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      // Should have the last 3 messages
      expect(context[0].text).toBe('Content 8');
      expect(context[1].text).toBe('Content 9');
      expect(context[2].text).toBe('Content 10');
    });
  });

  describe('load with window trimming', () => {
    it('should load messages and apply window size constraint', () => {
      // Arrange
      const loadMessages = [
        createMessage('1', 'human', 'Loaded 1'),
        createMessage('2', 'ai', 'Loaded 2'),
        createMessage('3', 'human', 'Loaded 3'),
        createMessage('4', 'ai', 'Loaded 4'),
        createMessage('5', 'human', 'Loaded 5'),
      ];

      // Act
      memory.load = loadMessages;

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0].text).toBe('Loaded 3');
      expect(context[1].text).toBe('Loaded 4');
      expect(context[2].text).toBe('Loaded 5');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loading buffer window with 5 messages',
        'ConversationBufferWindowMemory',
      );
    });

    it('should load fewer messages than window size without issues', () => {
      // Arrange
      const loadMessages = [createMessage('1', 'human', 'Only one')];

      // Act
      memory.load = loadMessages;

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(1);
      expect(context[0].text).toBe('Only one');
    });
  });

  describe('edge cases', () => {
    it('should handle zero window size correctly', () => {
      // Arrange
      const zeroConfig: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 0,
      };
      const zeroMemory = new ConversationBufferWindowMemory(
        zeroConfig,
        mockLogger,
      );

      // Act
      zeroMemory.addMessage(createMessage('1', 'human', 'Should not be kept'));

      // Assert
      expect(zeroMemory.getMessages()).toEqual([]);
    });

    it('should handle window size of 1', () => {
      // Arrange
      const singleConfig: BufferWindowMemoryConfig = {
        type: AgentMemoryType.ConversationBufferWindowMemory,
        maxSize: 1,
      };
      const singleMemory = new ConversationBufferWindowMemory(
        singleConfig,
        mockLogger,
      );

      // Act
      singleMemory.addMessage(createMessage('1', 'human', 'First'));
      singleMemory.addMessage(createMessage('2', 'ai', 'Second'));

      // Assert
      const context = singleMemory.getMessages();
      expect(context).toHaveLength(1);
      expect(context[0].text).toBe('Second');
    });
  });

  describe('clear functionality', () => {
    it('should clear all messages regardless of window size', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'Test 1'));
      memory.addMessage(createMessage('2', 'ai', 'Test 2'));
      expect(memory.getMessages()).toHaveLength(2);

      // Act
      memory.clear();

      // Assert
      expect(memory.getMessages()).toEqual([]);
    });
  });

  describe('getMaxSize', () => {
    it('should return the configured maximum size', () => {
      expect(memory.getMaxSize()).toBe(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Getting max size: 3',
        'ConversationBufferWindowMemory',
      );
    });
  });
});
