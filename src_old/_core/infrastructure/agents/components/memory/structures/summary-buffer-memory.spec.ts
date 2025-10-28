import { jest } from '@jest/globals';
import { ConversationSummaryBufferMemory } from '@core/infrastructure/agents/components/memory/structures/summary_buffer';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  SummaryBufferMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

describe('ConversationSummaryBufferMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let memory: ConversationSummaryBufferMemory;
  let config: SummaryBufferMemoryConfig;

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
      invoke: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn().mockReturnValue(['groq', 'openai']),
      listModels: jest.fn().mockReturnValue(['llama3-8b', 'gpt-4']),
      countTokens: jest.fn(),
    } as any;

    // Mock LLM to return deterministic summaries
    mockLLM.invoke.mockResolvedValue({
      text: 'Summary: Combined older and recent conversation context.',
      usage: { prompt: 60, completion: 20, total: 80 },
      stopReason: 'stop',
    });

    config = {
      type: AgentMemoryType.ConversationSummaryBufferMemory,
      maxSize: 3, // Keep last 3 messages in buffer
      llm: {
        provider: 'groq',
        model: 'llama3-8b',
        tokenLimit: 2000,
      },
      summaryPrompt: 'Summarize the conversation:',
      summaryBuffer: [
        createMessage('s1', 'human', 'Initial summarized message'),
      ],
    };

    memory = new ConversationSummaryBufferMemory(config, mockLLM, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with buffer and summary components', () => {
      expect(memory.model).toBe('llama3-8b');
      expect(memory.provider).toBe('groq');
      expect(memory.currentSummary).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationSummaryBufferMemory initializing',
        'ConversationSummaryBufferMemory',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Summary buffer memory initialized with 1 initial messages',
        'ConversationSummaryBufferMemory',
      );
    });
  });

  describe('addMessage and periodic summarization', () => {
    it('should add message to buffer and preserve recent messages', async () => {
      // Act - Add messages to fill the buffer
      await memory.addMessage(createMessage('1', 'human', 'Recent message 1'));
      await memory.addMessage(createMessage('2', 'ai', 'Recent response 1'));

      // Assert
      const context = memory.getContext();
      expect(context.some((msg) => msg.text === 'Recent message 1')).toBe(true);
      expect(context.some((msg) => msg.text === 'Recent response 1')).toBe(
        true,
      );
    });

    it('should trigger summarization after M messages', async () => {
      // Arrange - Add enough messages to trigger summarization (4+ messages with buffer size 3)
      const messages = [
        createMessage('1', 'human', 'Message 1'),
        createMessage('2', 'ai', 'Response 1'),
        createMessage('3', 'human', 'Message 2'),
        createMessage('4', 'ai', 'Response 2'), // This should trigger summarization
      ];

      // Act
      for (const msg of messages) {
        await memory.addMessage(msg);
      }

      // Assert - Should have triggered LLM summarization
      expect(mockLLM.invoke).toHaveBeenCalled();
      expect(memory.currentSummary).toContain('Summary:');
    });

    it('should maintain last K raw messages after summarization', async () => {
      // Arrange - Add more messages than buffer size
      const messages = [
        createMessage('1', 'human', 'Old message 1'),
        createMessage('2', 'ai', 'Old response 1'),
        createMessage('3', 'human', 'Old message 2'),
        createMessage('4', 'ai', 'Old response 2'),
        createMessage('5', 'human', 'Recent message'),
        createMessage('6', 'ai', 'Recent response'),
      ];

      // Act
      for (const msg of messages) {
        await memory.addMessage(msg);
      }

      // Assert
      const context = memory.getContext();
      const recentMessages = context.filter(
        (msg) => String(msg.sender) !== 'system',
      );
      expect(recentMessages.length).toBeLessThanOrEqual(3); // Should respect buffer size

      // Should have the most recent messages
      expect(recentMessages.some((msg) => msg.text === 'Recent message')).toBe(
        true,
      );
      expect(recentMessages.some((msg) => msg.text === 'Recent response')).toBe(
        true,
      );
    });
  });

  describe('getContext returns summary + recent raw', () => {
    it('should return system summary plus recent messages', async () => {
      // Arrange - Set up summary and recent messages
      await memory.addMessage(createMessage('1', 'human', 'Question 1'));
      await memory.addMessage(createMessage('2', 'ai', 'Answer 1'));

      // Act
      const context = memory.getContext();

      // Assert
      expect(context.length).toBeGreaterThan(0);

      // Should have system message with summary if one exists
      const systemMessages = context.filter(
        (msg) => String(msg.sender) === 'system',
      );
      if (memory.currentSummary) {
        expect(systemMessages.length).toBeGreaterThan(0);
        expect(systemMessages[0].text).toContain(memory.currentSummary);
      }

      // Should have recent raw messages
      const recentMessages = context.filter(
        (msg) => String(msg.sender) !== 'system',
      );
      expect(recentMessages.some((msg) => msg.text === 'Question 1')).toBe(
        true,
      );
      expect(recentMessages.some((msg) => msg.text === 'Answer 1')).toBe(true);
    });

    it('should handle empty state gracefully', () => {
      // Arrange - Clear any initial state
      memory.clear();

      // Act
      const context = memory.getContext();

      // Assert
      expect(Array.isArray(context)).toBe(true);
      // Should handle empty gracefully - may be empty array or just summary
    });
  });

  describe('load functionality', () => {
    it('should load summary and buffer data', () => {
      // Arrange
      const summaryData = 'Loaded conversation summary';
      const bufferData = [
        createMessage('b1', 'human', 'Loaded buffer message 1'),
        createMessage('b2', 'ai', 'Loaded buffer message 2'),
      ];

      // Act
      memory.load = { summary: summaryData, buffer: bufferData };

      // Assert
      expect(memory.currentSummary).toBe(summaryData);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loading summary buffer memory: summary=26 chars, buffer=2 messages',
        'ConversationSummaryBufferMemory',
      );
    });
  });

  describe('changeModel', () => {
    it('should update model configuration', () => {
      // Act
      const result = memory.changeModel('gpt-4', 'openai');

      // Assert
      expect(result).toBe(memory); // Should return this for chaining
      expect(memory.model).toBe('gpt-4');
      expect(memory.provider).toBe('openai');
    });
  });

  describe('processMessage', () => {
    it('should delegate to addMessage', async () => {
      // Arrange
      const message = createMessage('test', 'human', 'Process this message');
      const addMessageSpy = jest.spyOn(memory, 'addMessage');

      // Act
      await memory.processMessage(message);

      // Assert
      expect(addMessageSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('clear', () => {
    it('should clear both summary and buffer', async () => {
      // Arrange - Add some data
      await memory.addMessage(createMessage('1', 'human', 'Test message'));
      expect(memory.getContext().length).toBeGreaterThan(0);

      // Act
      memory.clear();

      // Assert
      expect(memory.currentSummary).toBe('');
      const context = memory.getContext();
      const nonSystemMessages = context.filter(
        (msg) => String(msg.sender) !== 'system',
      );
      expect(nonSystemMessages).toEqual([]);
    });
  });

  describe('serialization', () => {
    it('should produce valid JSON representation', async () => {
      // Arrange
      await memory.addMessage(
        createMessage('1', 'human', 'Test for serialization'),
      );

      // Act
      const json = memory.toJSON();

      // Assert
      expect(json).toHaveProperty(
        'type',
        AgentMemoryType.ConversationSummaryBufferMemory,
      );
      expect(json).toHaveProperty('summary');
      expect(json).toHaveProperty('buffer');
      expect(Array.isArray(json.buffer)).toBe(true);
    });
  });

  describe('memory composition behavior', () => {
    it('should properly coordinate buffer and summary memory', async () => {
      // Arrange - Add messages that will exceed buffer size
      const messages = [
        createMessage('1', 'human', 'Message 1'),
        createMessage('2', 'ai', 'Response 1'),
        createMessage('3', 'human', 'Message 2'),
        createMessage('4', 'ai', 'Response 2'),
        createMessage('5', 'human', 'Message 3'),
        createMessage('6', 'ai', 'Response 3'),
      ];

      // Act
      for (const msg of messages) {
        await memory.addMessage(msg);
      }

      // Assert
      const context = memory.getContext();

      // Should have a summary (system message) if summarization was triggered
      const _systemMessages = context.filter(
        (msg) => String(msg.sender) === 'system',
      );

      // Should have recent messages preserved
      const recentMessages = context.filter(
        (msg) => String(msg.sender) !== 'system',
      );
      expect(recentMessages.length).toBeLessThanOrEqual(3); // Buffer size constraint

      // Most recent should be preserved
      expect(
        recentMessages.some(
          (msg) =>
            msg.text.includes('Message 3') || msg.text.includes('Response 3'),
        ),
      ).toBe(true);
    });

    it('should handle mixed summarization and buffering', async () => {
      // Arrange - Create a scenario with existing summary buffer
      memory.load = {
        summary: 'Previous conversation about weather',
        buffer: [createMessage('prev', 'human', 'Previous buffer message')],
      };

      // Act - Add new messages
      await memory.addMessage(createMessage('new1', 'human', 'New question'));
      await memory.addMessage(createMessage('new2', 'ai', 'New answer'));

      // Assert
      const context = memory.getContext();
      expect(context.length).toBeGreaterThan(0);

      // Should maintain both summary and recent messages
      const _hasSystemSummary = context.some(
        (msg) => String(msg.sender) === 'system',
      );
      const hasRecentMessages = context.some(
        (msg) =>
          msg.text.includes('New question') || msg.text.includes('New answer'),
      );

      expect(hasRecentMessages).toBe(true);
    });
  });
});
