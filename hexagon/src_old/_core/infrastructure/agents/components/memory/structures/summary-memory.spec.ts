import { jest } from '@jest/globals';
import { ConversationSummaryMemory } from '@core/infrastructure/agents/components/memory/structures/summary';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  SummaryMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

describe('ConversationSummaryMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let memory: ConversationSummaryMemory;
  let config: SummaryMemoryConfig;

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
      // Use synchronous return to match changeModel's synchronous contract
      listModels: jest.fn().mockReturnValue(['llama3-8b', 'gpt-4']),
      countTokens: jest.fn(),
    } as any;

    // Mock LLM to return deterministic summaries
    mockLLM.invoke.mockResolvedValue({
      text: 'Summary: User asked questions, AI provided helpful responses.',
      usage: { prompt: 50, completion: 15, total: 65 },
      stopReason: 'stop',
    });

    config = {
      type: AgentMemoryType.ConversationSummaryMemory,
      llm: {
        provider: 'groq',
        model: 'llama3-8b',
        tokenLimit: 2000,
      },
      summaryPrompt: 'Please summarize the following conversation:',
      summary: '',
    };

    memory = new ConversationSummaryMemory(config, mockLLM, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      expect(memory.provider).toBe('groq');
      expect(memory.model).toBe('llama3-8b');
      expect(memory.maxTokenLimit).toBe(2000);
      expect(memory.summary).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationSummaryMemory initializing',
        'ConversationSummaryMemory',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Summary memory config: provider=groq, model=llama3-8b, maxTokens=2000',
        'ConversationSummaryMemory',
      );
    });

    it('should use default values when config is incomplete', () => {
      // Arrange
      const minimalConfig: SummaryMemoryConfig = {
        type: AgentMemoryType.ConversationSummaryMemory,
      };

      // Act
      const minimalMemory = new ConversationSummaryMemory(
        minimalConfig,
        mockLLM,
        mockLogger,
      );

      // Assert
      expect(minimalMemory.provider).toBe('');
      expect(minimalMemory.model).toBe('');
      expect(minimalMemory.maxTokenLimit).toBe(0);
    });
  });

  describe('updateSummary', () => {
    it('should generate and store summary from recent messages', async () => {
      // Arrange
      const messages = [
        createMessage('1', 'human', 'What is the weather today?'),
        createMessage('2', 'ai', 'It is sunny and warm.'),
        createMessage('3', 'human', 'Should I wear shorts?'),
        createMessage('4', 'ai', 'Yes, shorts would be comfortable.'),
      ];

      // Act
      await memory.updateSummary(messages);

      // Assert
      expect(memory.summary).toBe(
        'Summary: User asked questions, AI provided helpful responses.',
      );
      expect(mockLLM.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.stringContaining(
            'Please summarize the following conversation:',
          ),
        }),
        expect.objectContaining({
          provider: 'groq',
          model: 'llama3-8b',
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Generated summary (70 characters) from 4 messages',
        'ConversationSummaryMemory',
      );
    });

    it('should handle empty messages array', async () => {
      // Act
      await memory.updateSummary([]);

      // Assert
      expect(memory.summary).toBe(''); // Should remain empty
      expect(mockLLM.invoke).not.toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully', async () => {
      // Arrange
      const messages = [createMessage('1', 'human', 'Test message')];
      mockLLM.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      // Act & Assert
      await expect(memory.updateSummary(messages)).rejects.toThrow(
        'LLM service unavailable',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error updating summary'),
        'ConversationSummaryMemory',
      );
    });
  });

  describe('getContext', () => {
    it('should return system summary and last K messages', async () => {
      // Arrange
      const messages = [
        createMessage('1', 'human', 'First question'),
        createMessage('2', 'ai', 'First answer'),
      ];
      await memory.updateSummary(messages);

      // Act
      const context = memory.getContext(messages.slice(-1)); // Last 1 message

      // Assert
      expect(context).toHaveLength(2);
      expect(context[0].sender).toBe('system');
      expect(context[0].text).toContain(
        'Summary: User asked questions, AI provided helpful responses.',
      );
      expect(context[1]).toEqual(messages[1]); // Last message
    });

    it('should handle empty summary', () => {
      // Arrange
      const messages = [createMessage('1', 'human', 'Test')];

      // Act
      const context = memory.getContext(messages);

      // Assert
      expect(context).toEqual(messages); // Should return just the messages when no summary
    });

    it('should handle no recent messages', () => {
      // Arrange - update summary first
      memory.load = 'Existing summary from previous conversation';

      // Act
      const context = memory.getContext([]);

      // Assert
      expect(context).toHaveLength(1);
      expect(context[0].sender).toBe('system');
      expect(context[0].text).toContain(
        'Existing summary from previous conversation',
      );
    });
  });

  describe('load', () => {
    it('should load existing summary', () => {
      // Arrange
      const existingSummary = 'Previously saved conversation summary';

      // Act
      memory.load = existingSummary;

      // Assert
      expect(memory.summary).toBe(existingSummary);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loading summary (38 characters)',
        'ConversationSummaryMemory',
      );
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
      (mockLLM.listModels as any).mockReturnValue(['llama3-8b']); // Remove gpt-4

      // Act & Assert
      expect(() => memory.changeModel('gpt-4', 'openai')).toThrow(
        'Model not available',
      );
    });
  });

  describe('serialization', () => {
    it('should produce valid JSON representation', async () => {
      // Arrange
      const messages = [createMessage('1', 'human', 'Test conversation')];
      await memory.updateSummary(messages);

      // Act
      const json = memory.toJSON();

      // Assert
      expect(json).toHaveProperty(
        'type',
        AgentMemoryType.ConversationSummaryMemory,
      );
      expect(json).toHaveProperty('summary');
      expect(json.summary).toBe(
        'Summary: User asked questions, AI provided helpful responses.',
      );
    });

    it('should handle serialization with empty summary', () => {
      // Act
      const json = memory.toJSON();

      // Assert
      expect(json).toHaveProperty(
        'type',
        AgentMemoryType.ConversationSummaryMemory,
      );
      expect(json).toHaveProperty('summary');
      expect(json.summary).toBe('');
    });
  });

  describe('addMessage and processMessage', () => {
    it('should trigger summary update with new message', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'New question');

      // Act
      await memory.addMessage(message);

      // Assert
      expect(mockLLM.invoke).toHaveBeenCalled();
      expect(memory.summary).toBe(
        'Summary: User asked questions, AI provided helpful responses.',
      );
    });

    it('should handle processMessage delegation', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'Process this');
      const addMessageSpy = jest.spyOn(memory, 'addMessage');

      // Act
      await memory.processMessage(message);

      // Assert
      expect(addMessageSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('clear', () => {
    it('should clear summary and reset state', async () => {
      // Arrange
      await memory.updateSummary([createMessage('1', 'human', 'Test')]);
      expect(memory.summary).not.toBe('');

      // Act
      memory.clear();

      // Assert
      expect(memory.summary).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Clearing summary memory',
        'ConversationSummaryMemory',
      );
    });
  });
});
