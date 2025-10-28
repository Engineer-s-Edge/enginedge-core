import { jest } from '@jest/globals';
import { ConversationBufferMemory } from '@core/infrastructure/agents/components/memory/structures/buffer';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  BufferMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

describe('ConversationBufferMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let memory: ConversationBufferMemory;
  let config: BufferMemoryConfig;

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
      type: AgentMemoryType.ConversationBufferMemory,
    };

    memory = new ConversationBufferMemory(config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty buffer', () => {
      expect(memory.getMessages()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationBufferMemory initializing',
        'ConversationBufferMemory',
      );
    });
  });

  describe('addMessage', () => {
    it('should append messages to history in order', () => {
      // Arrange
      const message1 = createMessage('1', 'human', 'Hello');
      const message2 = createMessage('2', 'ai', 'Hi there!');
      const message3 = createMessage('3', 'human', 'How are you?');

      // Act
      memory.addMessage(message1);
      memory.addMessage(message2);
      memory.addMessage(message3);

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0]).toEqual(message1);
      expect(context[1]).toEqual(message2);
      expect(context[2]).toEqual(message3);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Adding message from human (5 characters)',
        'ConversationBufferMemory',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Buffer now contains 1 messages',
        'ConversationBufferMemory',
      );
    });

    it('should handle messages with different senders', () => {
      // Arrange
      const systemMsg = createMessage('sys', 'system', 'System initialized');
      const humanMsg = createMessage('h1', 'human', 'User query');
      const aiMsg = createMessage('ai1', 'ai', 'AI response');

      // Act
      memory.addMessage(systemMsg);
      memory.addMessage(humanMsg);
      memory.addMessage(aiMsg);

      // Assert
      const context = memory.getMessages();
      expect(context).toHaveLength(3);
      expect(context[0].sender).toBe('system');
      expect(context[1].sender).toBe('human');
      expect(context[2].sender).toBe('ai');
    });
  });

  describe('processMessage', () => {
    it('should log processing message but not call addMessage', () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');
      const addMessageSpy = jest.spyOn(memory, 'addMessage');

      // Act
      memory.processMessage(message);

      // Assert
      expect(addMessageSpy).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing message (no processing needed for buffer memory)',
        'ConversationBufferMemory',
      );
    });
  });

  describe('getContext', () => {
    it('should return all messages in chronological order', () => {
      // Arrange
      const messages = [
        createMessage('1', 'human', 'First'),
        createMessage('2', 'ai', 'Second'),
        createMessage('3', 'human', 'Third'),
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert
      const context = memory.getMessages();
      expect(context).toEqual(messages);
    });

    it('should return empty array when no messages exist', () => {
      // Act & Assert
      expect(memory.getMessages()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'Test'));
      memory.addMessage(createMessage('2', 'ai', 'Response'));
      expect(memory.getMessages()).toHaveLength(2);

      // Act
      memory.clear();

      // Assert
      expect(memory.getMessages()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Clearing buffer with 2 messages',
        'ConversationBufferMemory',
      );
    });
  });

  describe('load', () => {
    it('should load existing messages into buffer', () => {
      // Arrange
      const existingMessages = [
        createMessage('1', 'human', 'Loaded message 1'),
        createMessage('2', 'ai', 'Loaded message 2'),
      ];

      // Act
      memory.load = existingMessages;

      // Assert
      expect(memory.getMessages()).toEqual(existingMessages);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loading buffer with 2 messages',
        'ConversationBufferMemory',
      );
    });
  });
});
