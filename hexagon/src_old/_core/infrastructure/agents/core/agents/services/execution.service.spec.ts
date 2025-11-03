import { Test, TestingModule } from '@nestjs/testing';
import { MyLogger } from '@core/services/logger/logger.service';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// Mock the BaseAgent interface
interface MockBaseAgent {
  invoke: jest.Mock;
  stream: jest.Mock;
  restoreCheckpoint: jest.Mock;
}

// Mock complex dependencies
jest.mock('@langchain/core/messages', () => ({
  HumanMessage: jest.fn(),
  AIMessage: jest.fn(),
}));

// Import after mocks
import {
  AgentExecutionService,
  AgentExecuteOptions,
} from './execution.service';

describe('AgentExecutionService', () => {
  let service: AgentExecutionService;
  let mockLogger: jest.Mocked<MyLogger>;
  let mockAgent: MockBaseAgent;

  beforeEach(async () => {
    const mockLoggerImplementation = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn(),
      info: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentExecutionService,
        {
          provide: MyLogger,
          useValue: mockLoggerImplementation,
        },
      ],
    }).compile();

    service = module.get<AgentExecutionService>(AgentExecutionService);
    mockLogger = module.get(MyLogger);

    // Create a mock agent
    mockAgent = {
      invoke: jest.fn(),
      stream: jest.fn(),
      restoreCheckpoint: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize and log initialization message', () => {
    expect(mockLogger.info).toHaveBeenCalledWith(
      'AgentExecutionService initializing',
      'AgentExecutionService',
    );
  });

  describe('executeAgent', () => {
    it('should execute agent with streaming enabled', async () => {
      const mockResult = ['chunk1', 'chunk2'];
      mockAgent.stream.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        streaming: true,
        // history: [], // Remove this as it's optional and the type requires at least one message
        tokenTarget: 100,
        contentSequence: ['seq1'],
      };

      const result = await service.executeAgent(mockAgent as any, options);

      expect(result).toBe(mockResult);
      expect(mockAgent.stream).toHaveBeenCalledWith('Test input', [], 100, [
        'seq1',
      ]);
      expect(mockAgent.invoke).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing agent operation - streaming: true',
        'AgentExecutionService',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting streaming execution',
        'AgentExecutionService',
      );
    });

    it('should execute agent with streaming disabled (non-streaming)', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        streaming: false,
        // history: [], // Remove this as it's optional and the type requires at least one message
        tokenTarget: 100,
        contentSequence: ['seq1'],
      };

      const result = await service.executeAgent(mockAgent as any, options);

      expect(result).toBe(mockResult);
      expect(mockAgent.invoke).toHaveBeenCalledWith('Test input', [], 100, [
        'seq1',
      ]);
      expect(mockAgent.stream).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing agent operation - streaming: false',
        'AgentExecutionService',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting non-streaming execution',
        'AgentExecutionService',
      );
    });

    it('should default to non-streaming when streaming option is not provided', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        // streaming not specified (should default to false)
      };

      const result = await service.executeAgent(mockAgent as any, options);

      expect(result).toBe(mockResult);
      expect(mockAgent.invoke).toHaveBeenCalledWith(
        'Test input',
        [],
        undefined,
        undefined,
      );
      expect(mockAgent.stream).not.toHaveBeenCalled();
    });

    it('should handle empty history array', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        // history is optional and will default to []
      };

      const result = await service.executeAgent(mockAgent as any, options);

      expect(result).toBe(mockResult);
      expect(mockAgent.invoke).toHaveBeenCalledWith(
        'Test input',
        [],
        undefined,
        undefined,
      );
    });

    it('should log debug information about input and history', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'A very long test input that should be logged',
        history: [new HumanMessage('msg1'), new AIMessage('msg2')] as any,
      };

      await service.executeAgent(mockAgent as any, options);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Input length: ${options.input.length} characters, history length: 2`,
        'AgentExecutionService',
      );
    });

    it('should handle null or undefined history correctly', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        // history not provided, will default to []
      };

      await service.executeAgent(mockAgent as any, options);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Input length: 10 characters, history length: 0',
        'AgentExecutionService',
      );
    });
  });

  describe('invokeAgent', () => {
    it('should invoke agent with correct parameters', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const result = await service.invokeAgent(
        mockAgent as any,
        'Test input',
        [new HumanMessage('msg1')] as any,
        100,
        ['seq1'],
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.invoke).toHaveBeenCalledWith(
        'Test input',
        [new HumanMessage('msg1')],
        100,
        ['seq1'],
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Invoking agent with single request',
        'AgentExecutionService',
      );
    });

    it('should handle empty messages array', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const result = await service.invokeAgent(
        mockAgent as any,
        'Test input',
        // No additional parameters - should use defaults
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.invoke).toHaveBeenCalledWith(
        'Test input',
        [],
        undefined,
        undefined,
      );
    });

    it('should log debug information about input', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const longInput = 'A'.repeat(150); // Create a long input
      await service.invokeAgent(mockAgent as any, longInput);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Input: ${longInput.substring(0, 100)}..., messages: 0`,
        'AgentExecutionService',
      );
    });

    it('should log complete input when it is short', async () => {
      const mockResult = 'Response text';
      mockAgent.invoke.mockResolvedValue(mockResult);

      const shortInput = 'Short input';
      await service.invokeAgent(mockAgent as any, shortInput);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Input: ${shortInput}..., messages: 0`,
        'AgentExecutionService',
      );
    });
  });

  describe('streamAgent', () => {
    it('should stream agent with correct parameters', async () => {
      const mockResult = ['chunk1', 'chunk2'];
      mockAgent.stream.mockResolvedValue(mockResult);

      const result = await service.streamAgent(
        mockAgent as any,
        'Test input',
        [new HumanMessage('msg1')] as any,
        100,
        ['seq1'],
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.stream).toHaveBeenCalledWith(
        'Test input',
        [new HumanMessage('msg1')],
        100,
        ['seq1'],
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting agent streaming',
        'AgentExecutionService',
      );
    });

    it('should handle empty messages array', async () => {
      const mockResult = ['chunk1', 'chunk2'];
      mockAgent.stream.mockResolvedValue(mockResult);

      const result = await service.streamAgent(
        mockAgent as any,
        'Test input',
        // No additional parameters - should use defaults
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.stream).toHaveBeenCalledWith(
        'Test input',
        [],
        undefined,
        undefined,
      );
    });

    it('should log debug information about input and messages', async () => {
      const mockResult = ['chunk1', 'chunk2'];
      mockAgent.stream.mockResolvedValue(mockResult);

      const longInput = 'A'.repeat(150); // Create a long input
      const messages = [new HumanMessage('msg1'), new AIMessage('msg2')] as any;

      await service.streamAgent(mockAgent as any, longInput, messages);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Input: ${longInput.substring(0, 100)}..., messages: 2`,
        'AgentExecutionService',
      );
    });
  });

  describe('restoreAgentCheckpoint', () => {
    it('should restore checkpoint with id search', async () => {
      const mockResult = { success: true, data: { id: 'checkpoint123' } };
      mockAgent.restoreCheckpoint.mockResolvedValue(mockResult);

      const searchOptions = { id: 'checkpoint123' };
      const result = await service.restoreAgentCheckpoint(
        mockAgent as any,
        searchOptions,
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalledWith(searchOptions);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Restoring agent checkpoint',
        'AgentExecutionService',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Checkpoint restoration succeeded',
        'AgentExecutionService',
      );
    });

    it('should restore checkpoint with name search', async () => {
      const mockResult = { success: true, data: { name: 'checkpoint-name' } };
      mockAgent.restoreCheckpoint.mockResolvedValue(mockResult);

      const searchOptions = { name: 'checkpoint-name' };
      const result = await service.restoreAgentCheckpoint(
        mockAgent as any,
        searchOptions,
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalledWith(searchOptions);
    });

    it('should restore checkpoint with description search', async () => {
      const mockResult = {
        success: true,
        data: { description: 'checkpoint-desc' },
      };
      mockAgent.restoreCheckpoint.mockResolvedValue(mockResult);

      const searchOptions = { description: 'checkpoint-desc' };
      const result = await service.restoreAgentCheckpoint(
        mockAgent as any,
        searchOptions,
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalledWith(searchOptions);
    });

    it('should handle failed checkpoint restoration', async () => {
      const mockResult = { success: false, data: undefined };
      mockAgent.restoreCheckpoint.mockResolvedValue(mockResult);

      const searchOptions = { id: 'nonexistent' };
      const result = await service.restoreAgentCheckpoint(
        mockAgent as any,
        searchOptions,
      );

      expect(result).toBe(mockResult);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('should handle multiple search criteria', async () => {
      const mockResult = {
        success: true,
        data: { id: 'checkpoint123', name: 'test' },
      };
      mockAgent.restoreCheckpoint.mockResolvedValue(mockResult);

      const searchOptions = {
        id: 'checkpoint123',
        name: 'test',
        description: 'test checkpoint',
      };
      const result = await service.restoreAgentCheckpoint(
        mockAgent as any,
        searchOptions,
      );

      expect(result).toBe(mockResult);
      expect(mockAgent.restoreCheckpoint).toHaveBeenCalledWith(searchOptions);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Search options: {"id":"checkpoint123","name":"test","description":"test checkpoint"}',
        'AgentExecutionService',
      );
    });
  });

  describe('error handling', () => {
    it('should handle agent invoke errors', async () => {
      const error = new Error('Agent invoke failed');
      mockAgent.invoke.mockRejectedValue(error);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        streaming: false,
      };

      await expect(
        service.executeAgent(mockAgent as any, options),
      ).rejects.toThrow('Agent invoke failed');
    });

    it('should handle agent stream errors', async () => {
      const error = new Error('Agent stream failed');
      mockAgent.stream.mockRejectedValue(error);

      const options: AgentExecuteOptions = {
        input: 'Test input',
        streaming: true,
      };

      await expect(
        service.executeAgent(mockAgent as any, options),
      ).rejects.toThrow('Agent stream failed');
    });

    it('should handle checkpoint restoration errors', async () => {
      const error = new Error('Checkpoint restoration failed');
      mockAgent.restoreCheckpoint.mockRejectedValue(error);

      const searchOptions = { id: 'checkpoint123' };

      await expect(
        service.restoreAgentCheckpoint(mockAgent as any, searchOptions),
      ).rejects.toThrow('Checkpoint restoration failed');
    });
  });
});
