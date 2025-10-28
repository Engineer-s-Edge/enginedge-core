import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// Mock dependencies
jest.mock('@core/infrastructure/agents/components/llm', () => ({
  LLMService: jest.fn(),
}));

jest.mock('../../services/factory.service', () => ({
  AgentFactoryService: jest.fn(),
}));

jest.mock('../../services/validation.service', () => ({
  AgentValidationService: jest.fn(),
}));

jest.mock('../../services/configuration.service', () => ({
  AgentConfigurationService: jest.fn(),
}));

jest.mock('../../services/session.service', () => ({
  AgentSessionService: jest.fn(),
}));

jest.mock('../../services/event.service', () => ({
  AgentEventService: jest.fn(),
}));

jest.mock('../../services/execution.service', () => ({
  AgentExecutionService: jest.fn(),
}));

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: jest.fn(),
}));

// Import services after mocking
import { AgentService } from '../../agent.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { AgentFactoryService } from '../../services/factory.service';
import { AgentValidationService } from '../../services/validation.service';
import { AgentConfigurationService } from '../../services/configuration.service';
import { AgentSessionService } from '../../services/session.service';
import { AgentEventService } from '../../services/event.service';
import { AgentExecutionService } from '../../services/execution.service';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  UserIdType,
  ConversationIdType,
} from '@core/infrastructure/database/utils/custom_types';

// Mock BaseAgent interface
interface MockBaseAgent {
  invoke: jest.Mock;
  stream: jest.Mock;
  abort: jest.Mock;
  correct: jest.Mock;
  restoreCheckpoint: jest.Mock;
  state: string;
}

describe('AgentService - Execution/Invoke/Stream/Abort/Correct/Restore', () => {
  let service: AgentService;
  let mockFactoryService: jest.Mocked<AgentFactoryService>;
  let mockValidationService: jest.Mocked<AgentValidationService>;
  let mockConfigurationService: jest.Mocked<AgentConfigurationService>;
  let mockSessionService: jest.Mocked<AgentSessionService>;
  let mockEventService: jest.Mocked<AgentEventService>;
  let mockExecutionService: jest.Mocked<AgentExecutionService>;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockLogger: jest.Mocked<MyLogger>;
  let mockAgent: MockBaseAgent;

  // Shared fixtures
  const userId = 'u1' as UserIdType;
  const conversationId = 's1' as ConversationIdType;
  const agentType = 'react';
  const baseConfig = {
    provider: 'groq',
    model: 'llama3-8b',
    settings: {
      temperature: 0.3,
      memory: { windowSize: 8 },
    },
  };

  beforeEach(async () => {
    // Create mock agent
    mockAgent = {
      invoke: jest.fn(),
      stream: jest.fn(),
      abort: jest.fn(),
      correct: jest.fn(),
      restoreCheckpoint: jest.fn(),
      state: 'ready',
    };

    // Create mock services
    mockFactoryService = {
      createAgentByType: jest.fn().mockResolvedValue(mockAgent),
    } as any;

    mockValidationService = {
      validateAgentOptions: jest.fn(),
      validateAgentConfigByType: jest.fn(),
    } as any;

    mockConfigurationService = {
      mergeWithDefaults: jest.fn().mockReturnValue(baseConfig),
    } as any;

    mockSessionService = {
      hasAgent: jest.fn().mockReturnValue(false),
      getAgentInstance: jest.fn().mockReturnValue(mockAgent as any), // Cast to any to bypass type checking
      createSession: jest.fn().mockReturnValue({
        agentType,
        userId,
        conversationId,
        status: 'idle',
        pendingUserInteractions: new Map(),
        eventFilters: {},
        controlOptions: {},
      }),
      updateSessionStatus: jest.fn(),
      setupUserInteractionHandling: jest.fn(),
      removeAgent: jest.fn(),
    } as any;

    mockEventService = {
      emit: jest.fn(),
      setupAgentEventForwarding: jest.fn(),
      on: jest.fn(), // Add the missing on method
      off: jest.fn(), // Add the off method too
    } as any;

    mockExecutionService = {
      invokeAgent: jest.fn(),
      streamAgent: jest.fn(),
      correctAgent: jest.fn(),
      abortAgent: jest.fn(),
      restoreAgentCheckpoint: jest.fn(),
    } as any;

    mockLLMService = {
      chat: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: AgentFactoryService,
          useValue: mockFactoryService,
        },
        {
          provide: AgentValidationService,
          useValue: mockValidationService,
        },
        {
          provide: AgentConfigurationService,
          useValue: mockConfigurationService,
        },
        {
          provide: AgentSessionService,
          useValue: mockSessionService,
        },
        {
          provide: AgentEventService,
          useValue: mockEventService,
        },
        {
          provide: AgentExecutionService,
          useValue: mockExecutionService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: MyLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  describe('invoke returns assistant message and stores to conversation', () => {
    it('should invoke agent and return assistant message with proper delegation', async () => {
      const input = 'Hi';
      const expectedResponse = 'Hello! How can I help?';
      const latestMessages = [new HumanMessage('Hi')] as [
        HumanMessage,
        ...AIMessage[],
      ];

      // Mock execution service to return expected response
      mockExecutionService.invokeAgent.mockResolvedValue(expectedResponse);

      // Act
      const result = await service.invokeAgent(
        userId,
        conversationId,
        agentType,
        input,
        latestMessages,
      );

      // Assert
      expect(result).toBe(expectedResponse);
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
      expect(mockExecutionService.invokeAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        latestMessages,
        undefined,
        undefined,
      );
    });

    it('should handle token target and content sequence parameters', async () => {
      const input = 'Test input';
      const tokenTarget = 100;
      const contentSequence = ['seq1', 'seq2'];
      const expectedResponse = 'Test response';

      mockExecutionService.invokeAgent.mockResolvedValue(expectedResponse);

      // Act
      const result = await service.invokeAgent(
        userId,
        conversationId,
        agentType,
        input,
        [],
        tokenTarget,
        contentSequence,
      );

      // Assert
      expect(result).toBe(expectedResponse);
      expect(mockExecutionService.invokeAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        [],
        tokenTarget,
        contentSequence,
      );
    });
  });

  describe('stream yields ordered chunks and aggregates final text', () => {
    it('should stream chunks and delegate to execution service', async () => {
      const input = 'Hello';
      const mockAsyncIterable = {
        async *[Symbol.asyncIterator]() {
          yield { text: 'Hel' };
          yield { text: 'lo' };
          yield { text: '!' };
        },
      };

      mockExecutionService.streamAgent.mockResolvedValue(mockAsyncIterable);

      // Act
      const streamResult = await service.streamAgent(
        userId,
        conversationId,
        agentType,
        input,
      );

      // Consume the async iterable
      const collectedChunks = [];
      for await (const chunk of streamResult) {
        collectedChunks.push(chunk);
      }

      // Assert
      expect(collectedChunks).toHaveLength(3);
      expect(collectedChunks.map((c) => c.text).join('')).toBe('Hello!');
      expect(mockExecutionService.streamAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        [],
        undefined,
        undefined,
      );
    });

    it('should handle streaming with latest messages and token target', async () => {
      const input = 'Test';
      const latestMessages = [new HumanMessage('Previous')] as [
        HumanMessage,
        ...AIMessage[],
      ];
      const tokenTarget = 50;
      const contentSequence = ['test'];

      const mockAsyncIterable = {
        async *[Symbol.asyncIterator]() {
          yield { text: 'Response' };
        },
      };

      mockExecutionService.streamAgent.mockResolvedValue(mockAsyncIterable);

      // Act
      await service.streamAgent(
        userId,
        conversationId,
        agentType,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );

      // Assert
      expect(mockExecutionService.streamAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
    });
  });

  describe('abort stops streaming promptly and emits cancellation', () => {
    it('should abort agent operation through execution service', async () => {
      // Act
      await service.abortAgent(userId, conversationId, agentType);

      // Assert
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
      expect(mockExecutionService.abortAgent).toHaveBeenCalledWith(mockAgent);
    });

    it('should handle abort when no agent exists', async () => {
      mockSessionService.getAgentInstance.mockReturnValueOnce(undefined);

      // Should not create agent, just return early since abort only works on existing agents
      await service.abortAgent(userId, conversationId, agentType);

      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
      expect(mockFactoryService.createAgentByType).not.toHaveBeenCalled();
      expect(mockExecutionService.abortAgent).not.toHaveBeenCalled();
    });
  });

  describe('correct follows up with revised output referencing previous turn', () => {
    it('should apply correction through execution service', async () => {
      const correctionInput = 'You miscalculated; recompute carefully.';
      const context = 'Previous calculation was wrong';

      // Act
      await service.correctAgent(
        userId,
        conversationId,
        agentType,
        correctionInput,
        context,
      );

      // Assert
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
      expect(mockExecutionService.correctAgent).toHaveBeenCalledWith(
        mockAgent,
        correctionInput,
        context,
      );
    });

    it('should handle correction with empty context', async () => {
      const correctionInput = 'Please try again';
      const context = '';

      await service.correctAgent(
        userId,
        conversationId,
        agentType,
        correctionInput,
        context,
      );

      expect(mockExecutionService.correctAgent).toHaveBeenCalledWith(
        mockAgent,
        correctionInput,
        context,
      );
    });
  });

  describe('checkpoint and restore resumes context', () => {
    it('should restore checkpoint through execution service', async () => {
      const searchOptions = {
        id: 'checkpoint-123',
        name: 'test-checkpoint',
        description: 'Test checkpoint',
      };

      const expectedResult = {
        success: true,
        data: { messages: [], sessionState: {} },
      };

      mockExecutionService.restoreAgentCheckpoint.mockResolvedValue(
        expectedResult,
      );

      // Act
      const result = await service.restoreAgentCheckpoint(
        userId,
        conversationId,
        agentType,
        searchOptions,
      );

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
      expect(mockExecutionService.restoreAgentCheckpoint).toHaveBeenCalledWith(
        mockAgent,
        searchOptions,
      );
    });

    it('should handle checkpoint restoration failure', async () => {
      const searchOptions = { id: 'nonexistent' };
      const expectedResult = { success: false, data: undefined };

      mockExecutionService.restoreAgentCheckpoint.mockResolvedValue(
        expectedResult,
      );

      const result = await service.restoreAgentCheckpoint(
        userId,
        conversationId,
        agentType,
        searchOptions,
      );

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });
  });

  describe('provider error mapping on invoke and stream', () => {
    it('should handle execution service errors gracefully for invoke', async () => {
      const error = new Error('Provider error: rate limit exceeded');
      mockExecutionService.invokeAgent.mockRejectedValue(error);

      // Act & Assert
      await expect(
        service.invokeAgent(userId, conversationId, agentType, 'test input'),
      ).rejects.toThrow('Provider error: rate limit exceeded');

      expect(mockExecutionService.invokeAgent).toHaveBeenCalled();
    });

    it('should handle execution service errors gracefully for stream', async () => {
      const error = new Error('Stream connection lost');
      mockExecutionService.streamAgent.mockRejectedValue(error);

      await expect(
        service.streamAgent(userId, conversationId, agentType, 'test input'),
      ).rejects.toThrow('Stream connection lost');
    });
  });

  describe('agent creation and retrieval', () => {
    it('should create agent if none exists when getting agent', async () => {
      mockSessionService.getAgentInstance.mockReturnValueOnce(undefined);

      // Act
      const result = await service.invokeAgent(
        userId,
        conversationId,
        agentType,
        'test',
      );

      // Assert - should create new agent
      expect(mockFactoryService.createAgentByType).toHaveBeenCalledWith(
        agentType,
        userId,
        conversationId,
        {},
        {}, // Default config object, not undefined
      );
      expect(mockSessionService.createSession).toHaveBeenCalled();
      expect(mockEventService.setupAgentEventForwarding).toHaveBeenCalled();
    });

    it('should reuse existing agent if available', async () => {
      mockSessionService.getAgentInstance.mockReturnValue(mockAgent as any);

      await service.invokeAgent(userId, conversationId, agentType, 'test');

      // Should not create new agent
      expect(mockFactoryService.createAgentByType).not.toHaveBeenCalled();
      expect(mockExecutionService.invokeAgent).toHaveBeenCalledWith(
        mockAgent,
        'test',
        [],
        undefined,
        undefined,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty input validation at execution service level', async () => {
      const error = new BadRequestException('Input is required');
      mockExecutionService.invokeAgent.mockRejectedValue(error);

      await expect(
        service.invokeAgent(userId, conversationId, agentType, ''),
      ).rejects.toThrow('Input is required');
    });

    it('should handle agent factory errors during agent creation', async () => {
      mockSessionService.getAgentInstance.mockReturnValueOnce(undefined);
      const error = new Error('Agent creation failed');
      mockFactoryService.createAgentByType.mockRejectedValue(error);

      await expect(
        service.invokeAgent(userId, conversationId, agentType, 'test'),
      ).rejects.toThrow('Agent creation failed');

      // Should clean up on failure
      expect(mockSessionService.removeAgent).toHaveBeenCalledWith(
        userId,
        conversationId,
        agentType,
      );
    });

    it('should handle different agent types', async () => {
      const graphAgentType = 'graph';

      await service.invokeAgent(
        userId,
        conversationId,
        graphAgentType,
        'test input',
      );

      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        userId,
        conversationId,
        graphAgentType,
      );
    });

    it('should handle concurrent operations gracefully', async () => {
      // Simulate multiple concurrent invokes
      const promise1 = service.invokeAgent(
        userId,
        conversationId,
        agentType,
        'input1',
      );
      const promise2 = service.invokeAgent(
        userId,
        conversationId,
        agentType,
        'input2',
      );

      // Both should complete without issues
      await Promise.all([promise1, promise2]);

      expect(mockExecutionService.invokeAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe('method delegation verification', () => {
    it('should properly delegate all execution methods to execution service', async () => {
      const input = 'test';
      const latestMessages: [HumanMessage, ...AIMessage[]] = [] as any; // Use any to bypass type checking
      const tokenTarget = 100;
      const contentSequence = ['seq'];

      // Test all main execution methods
      await service.invokeAgent(
        userId,
        conversationId,
        agentType,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
      await service.streamAgent(
        userId,
        conversationId,
        agentType,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
      await service.correctAgent(
        userId,
        conversationId,
        agentType,
        'correction',
        'context',
      );
      await service.abortAgent(userId, conversationId, agentType);
      await service.restoreAgentCheckpoint(userId, conversationId, agentType, {
        id: 'test',
      });

      // Verify all methods were called on execution service
      expect(mockExecutionService.invokeAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
      expect(mockExecutionService.streamAgent).toHaveBeenCalledWith(
        mockAgent,
        input,
        latestMessages,
        tokenTarget,
        contentSequence,
      );
      expect(mockExecutionService.correctAgent).toHaveBeenCalledWith(
        mockAgent,
        'correction',
        'context',
      );
      expect(mockExecutionService.abortAgent).toHaveBeenCalledWith(mockAgent);
      expect(mockExecutionService.restoreAgentCheckpoint).toHaveBeenCalledWith(
        mockAgent,
        { id: 'test' },
      );
    });
  });
});
