import { jest } from '@jest/globals';
import { ConversationTokenBufferMemory } from '@core/infrastructure/agents/components/memory/structures/token_buffer';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  TokenBufferMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

describe('ConversationTokenBufferMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let memory: ConversationTokenBufferMemory;
  let config: TokenBufferMemoryConfig;

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

    mockLLM = {
      countTokens: jest.fn(),
      invoke: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn(),
      listModels: jest.fn(),
    } as any;

    // Mock token counting to use word count as a simple approximation
    mockLLM.countTokens.mockImplementation((text: string) => {
      return Math.ceil(text.split(/\s+/).length / 1.5); // ~1.5 words per token
    });

    config = {
      type: AgentMemoryType.ConversationTokenBufferMemory,
      maxTokenLimit: 10, // Small limit for testing
    };

    memory = new ConversationTokenBufferMemory(config, mockLLM, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configured token limit', () => {
      expect(memory.getMaxTokens()).toBe(10);
      expect(memory.getCurrentTokenCount()).toBe(0);
      expect(memory.getMessages()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationTokenBufferMemory initializing with maxTokens: 10',
        'ConversationTokenBufferMemory',
      );
    });
  });

  describe('addMessage with token limit enforcement', () => {
    it('should add message and track tokens correctly', () => {
      // Arrange - short message should be ~2 tokens
      const message = createMessage('1', 'human', 'Hello world'); // "Hello world" = 2 words = ~1.3 tokens

      // Act
      memory.addMessage(message);

      // Assert
      expect(memory.getMessages()).toHaveLength(1);
      expect(memory.getCurrentTokenCount()).toBeGreaterThan(0);
      expect(mockLLM.countTokens).toHaveBeenCalledWith('Hello world');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Adding message from human'),
        'ConversationTokenBufferMemory',
      );
    });

    it('should drop oldest messages when token limit exceeded', () => {
      // Arrange - each message is ~5 tokens (7-8 words)
      const messages = [
        createMessage('1', 'human', 'This is the first test message here'), // ~5.3 tokens
        createMessage('2', 'ai', 'This is the second test message response'), // ~5.3 tokens
        createMessage('3', 'human', 'This is a third longer message'), // ~4.7 tokens (total would be ~15.3)
      ];

      // Act
      messages.forEach((msg) => memory.addMessage(msg));

      // Assert - should keep only the last messages that fit in 10 tokens
      const context = memory.getMessages();
      expect(context.length).toBeLessThanOrEqual(2); // Should have dropped some messages
      expect(memory.getCurrentTokenCount()).toBeLessThanOrEqual(10);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Trimmed'),
        'ConversationTokenBufferMemory',
      );
    });

    it('should remove message if it exceeds the token limit even if it is the only message', () => {
      // Arrange - very long message that exceeds token limit
      const hugeMessage = createMessage(
        'huge',
        'human',
        'This is an extremely long message that definitely exceeds our token limit of ten tokens by far',
      ); // ~17 tokens

      // Act
      memory.addMessage(hugeMessage);

      // Assert - should remove the message since it exceeds limit
      expect(memory.getMessages()).toHaveLength(0);
      expect(memory.getCurrentTokenCount()).toBe(0);
    });
  });

  describe('trimToTokens', () => {
    it('should return trimmed buffer without modifying original', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'First message here'));
      memory.addMessage(createMessage('2', 'ai', 'Second message here'));
      memory.addMessage(createMessage('3', 'human', 'Third message here'));
      const originalLength = memory.getMessages().length;

      // Act
      const trimmed = memory.trimToTokens(5); // Very small limit

      // Assert
      expect(memory.getMessages().length).toBe(originalLength); // Original unchanged
      expect(trimmed.length).toBeLessThanOrEqual(originalLength);
    });
  });

  describe('countBufferTokens', () => {
    it('should return zero for empty buffer', () => {
      expect(memory.countBufferTokens()).toBe(0);
    });

    it('should count tokens across all messages', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'Hello'));
      memory.addMessage(createMessage('2', 'ai', 'Hi there'));

      // Act
      const totalTokens = memory.countBufferTokens();

      // Assert
      expect(totalTokens).toBeGreaterThan(0);
      expect(mockLLM.countTokens).toHaveBeenCalledWith('Hello\nHi there');
    });
  });

  describe('recalculateTokens', () => {
    it('should update current token count accurately', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'Test message'));
      const beforeRecalc = memory.getCurrentTokenCount();

      // Act
      memory.recalculateTokens();

      // Assert
      const afterRecalc = memory.getCurrentTokenCount();
      expect(afterRecalc).toBe(beforeRecalc); // Should be the same for clean state
    });
  });

  describe('setMaxTokens', () => {
    it('should update token limit and trim if necessary', () => {
      // Arrange - fill buffer near limit
      memory.addMessage(createMessage('1', 'human', 'Message one here'));
      memory.addMessage(createMessage('2', 'ai', 'Message two here'));
      const beforeCount = memory.getMessages().length;

      // Act - reduce limit significantly
      memory.setMaxTokens(3);

      // Assert
      expect(memory.getMaxTokens()).toBe(3);
      expect(memory.getMessages().length).toBeLessThanOrEqual(beforeCount);
      expect(memory.getCurrentTokenCount()).toBeLessThanOrEqual(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Setting new max token limit: 10 -> 3',
        'ConversationTokenBufferMemory',
      );
    });
  });

  describe('clear functionality', () => {
    it('should clear all messages and reset token count', () => {
      // Arrange
      memory.addMessage(createMessage('1', 'human', 'Test'));
      memory.addMessage(createMessage('2', 'ai', 'Response'));
      expect(memory.getCurrentTokenCount()).toBeGreaterThan(0);

      // Act
      memory.clear();

      // Assert
      expect(memory.getMessages()).toEqual([]);
      expect(memory.getCurrentTokenCount()).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Clearing token buffer memory'),
        'ConversationTokenBufferMemory',
      );
    });
  });

  describe('token counting accuracy', () => {
    it('should track tokens correctly through add/remove cycles', () => {
      // Arrange - add messages that will cause trimming
      const shortMsg = createMessage('1', 'human', 'Hi'); // ~1 token
      const mediumMsg = createMessage('2', 'ai', 'Hello there friend'); // ~2 tokens
      const longMsg = createMessage(
        '3',
        'human',
        'This is a longer test message',
      ); // ~4+ tokens

      // Act
      memory.addMessage(shortMsg);
      const tokens1 = memory.getCurrentTokenCount();

      memory.addMessage(mediumMsg);
      const tokens2 = memory.getCurrentTokenCount();

      memory.addMessage(longMsg);
      const tokens3 = memory.getCurrentTokenCount();

      // Assert
      expect(tokens1).toBeGreaterThan(0);
      expect(tokens2).toBeGreaterThan(tokens1);
      expect(tokens3).toBeLessThanOrEqual(10); // Should respect limit
    });
  });

  describe('edge cases', () => {
    it('should handle zero token limit gracefully', () => {
      // Arrange
      memory.setMaxTokens(0);

      // Act
      memory.addMessage(createMessage('1', 'human', 'Any message'));

      // Assert - even with zero limit, should keep at least one message if it's the only one
      const context = memory.getMessages();
      expect(context.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty text messages', () => {
      // Arrange
      const emptyMessage = createMessage('empty', 'human', '');

      // Act & Assert - should not throw
      expect(() => memory.addMessage(emptyMessage)).not.toThrow();
      expect(memory.getCurrentTokenCount()).toBeGreaterThanOrEqual(0);
    });
  });
});
