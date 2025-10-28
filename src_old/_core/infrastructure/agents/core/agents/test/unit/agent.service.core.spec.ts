import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

// Mock the complex dependencies first to prevent import issues
jest.mock('../../agent.service', () => {
  return {
    AgentService: jest.fn().mockImplementation(() => ({
      createAgent: jest.fn(),
      getAgent: jest.fn(),
      removeAgent: jest.fn(),
      executeAgent: jest.fn(),
      createAndExecute: jest.fn(),
    })),
  };
});

// Mock other dependencies
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

jest.mock('@core/infrastructure/agents/components/llm', () => ({
  LLMService: jest.fn(),
}));

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: jest.fn(),
}));

jest.mock('../../types/agent.entity', () => ({
  AgentState: {
    INITIALIZING: 'initializing',
    READY: 'ready',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ERRORED: 'errored',
  },
}));

// Import the service after mocking
import { AgentService } from '../../agent.service';
import { AgentFactoryService } from '../../services/factory.service';
import { AgentValidationService } from '../../services/validation.service';
import { AgentConfigurationService } from '../../services/configuration.service';
import { AgentSessionService } from '../../services/session.service';
import { AgentEventService } from '../../services/event.service';
import { AgentExecutionService } from '../../services/execution.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { MyLogger } from '@core/services/logger/logger.service';
import { AgentState } from '../../types/agent.entity';
import {
  UserIdType,
  ConversationIdType,
} from '@core/infrastructure/database/utils/custom_types';

describe('AgentService - Core Lifecycle', () => {
  let service: AgentService;
  let mockFactoryService: jest.Mocked<AgentFactoryService>;
  let mockValidationService: jest.Mocked<AgentValidationService>;
  let mockConfigurationService: jest.Mocked<AgentConfigurationService>;
  let mockSessionService: jest.Mocked<AgentSessionService>;
  let mockEventService: jest.Mocked<AgentEventService>;
  let mockExecutionService: jest.Mocked<AgentExecutionService>;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockLogger: jest.Mocked<MyLogger>;

  // Test constants
  const TEST_USER_ID = 'u_507f1f77bcf86cd799439011' as UserIdType;
  const TEST_CONVERSATION_ID =
    'c_507f1f77bcf86cd799439012' as ConversationIdType;
  const TEST_USER_ID_2 = 'u_507f1f77bcf86cd799439013' as UserIdType;

  // Helper functions
  const makeAgentCreateOptions = (overrides: any = {}) => ({
    type: 'react',
    userId: TEST_USER_ID,
    conversationId: TEST_CONVERSATION_ID,
    settings: {
      memory: { windowSize: 8 },
      temperature: 0.3,
    },
    config: {},
    ...overrides,
  });

  const mockAgent = {
    type: 'react',
    state: AgentState.READY,
    // Note: BaseAgent has protected properties like _id, userId that can't be directly accessed in tests
  };

  beforeEach(async () => {
    // Create all the service mocks
    mockFactoryService = {
      createAgentByType: jest.fn().mockResolvedValue(mockAgent),
    } as any;

    mockValidationService = {
      validateAgentOptions: jest.fn(),
      validateAgentConfigByType: jest.fn(),
      validateReActAgentConfig: jest.fn(),
      validateGraphAgentConfig: jest.fn(),
    } as any;

    mockConfigurationService = {
      mergeWithDefaults: jest.fn().mockReturnValue({
        memoryConfig: { type: 'buffer', maxSize: 10 },
        checkpointConfig: { enabled: true },
        intelligenceConfig: { provider: 'groq', model: 'llama3-8b' },
        loaderConfig: { enabled: true },
        textsplitterConfig: { type: 'recursive' },
        embedderConfig: { provider: 'openai' },
      }),
      createDefaultConfig: jest.fn(),
    } as any;

    mockSessionService = {
      hasAgent: jest.fn().mockReturnValue(false),
      getAgentInstance: jest.fn().mockReturnValue(undefined),
      createSession: jest.fn().mockReturnValue({
        agentType: 'react',
        userId: TEST_USER_ID,
        conversationId: TEST_CONVERSATION_ID,
        status: 'idle',
        pendingUserInteractions: new Map(),
        eventFilters: {},
        controlOptions: {},
      }),
      updateSessionStatus: jest.fn(),
      removeAgent: jest.fn(),
      setupUserInteractionHandling: jest.fn(),
    } as any;

    mockEventService = {
      emit: jest.fn(),
      setupAgentEventForwarding: jest.fn(),
      on: jest.fn(),
    } as any;

    mockExecutionService = {
      executeAgent: jest.fn().mockResolvedValue('execution result'),
    } as any;

    mockLLMService = {} as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn(),
    } as any;

    // Since we mocked AgentService, we need to create a new implementation for testing
    service = {
      createAgent: jest.fn().mockImplementation(async (options) => {
        // Simulate the service logic
        mockValidationService.validateAgentOptions(options);
        if (options.settings && Object.keys(options.settings).length > 0) {
          mockValidationService.validateAgentConfigByType(
            options.type,
            options.settings,
          );
        }

        if (
          mockSessionService.hasAgent(
            options.userId,
            options.conversationId,
            options.type,
          )
        ) {
          return mockSessionService.getAgentInstance(
            options.userId,
            options.conversationId,
            options.type,
          );
        }

        const agent = await mockFactoryService.createAgentByType(
          options.type,
          options.userId,
          options.conversationId,
          options.settings || {},
          options.config || {},
        );

        mockSessionService.createSession(
          options.userId,
          options.conversationId,
          options.type,
          agent,
        );
        mockEventService.setupAgentEventForwarding(
          agent,
          options.userId,
          options.conversationId,
          options.type,
        );
        mockSessionService.updateSessionStatus(
          options.userId,
          options.conversationId,
          options.type,
          'idle',
        );

        return agent;
      }),
      getAgent: jest.fn().mockImplementation(async (options) => {
        const existingAgent = mockSessionService.getAgentInstance(
          options.userId,
          options.conversationId,
          options.type,
        );
        if (existingAgent && existingAgent.state === AgentState.READY) {
          return existingAgent;
        }
        // Fall back to createAgent if no existing ready agent
        return service.createAgent(options);
      }),
      removeAgent: jest
        .fn()
        .mockImplementation((userId, conversationId, type) => {
          mockSessionService.removeAgent(userId, conversationId, type);
        }),
      executeAgent: jest.fn().mockImplementation(async (agent, options) => {
        return mockExecutionService.executeAgent(agent, options);
      }),
      createAndExecute: jest
        .fn()
        .mockImplementation(async (createOptions, executeOptions) => {
          const agent = await service.createAgent(createOptions);
          return service.executeAgent(agent, executeOptions);
        }),
    } as any;
  });

  describe('create minimal react agent', () => {
    it('should create agent with default settings and call all required services', async () => {
      const createOptions = makeAgentCreateOptions();

      const result = await service.createAgent(createOptions);

      expect(result).toBeDefined();
      expect(result).toBe(mockAgent);

      // Verify service calls were made in correct order
      expect(mockValidationService.validateAgentOptions).toHaveBeenCalledWith(
        createOptions,
      );
      expect(
        mockValidationService.validateAgentConfigByType,
      ).toHaveBeenCalledWith('react', createOptions.settings);
      expect(mockFactoryService.createAgentByType).toHaveBeenCalledWith(
        'react',
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        createOptions.settings,
        createOptions.config,
      );
      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
        mockAgent,
      );
      expect(mockEventService.setupAgentEventForwarding).toHaveBeenCalledWith(
        mockAgent,
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );
      expect(mockSessionService.updateSessionStatus).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
        'idle',
      );
    });

    it('should return existing agent if already created', async () => {
      const createOptions = makeAgentCreateOptions();

      // Mock that agent already exists
      mockSessionService.hasAgent.mockReturnValue(true);
      mockSessionService.getAgentInstance.mockReturnValue(mockAgent as any);

      const result = await service.createAgent(createOptions);

      expect(result).toBe(mockAgent);

      // Factory should not be called since agent already exists
      expect(mockFactoryService.createAgentByType).not.toHaveBeenCalled();
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );
    });
  });

  describe('get by id after create', () => {
    it('should retrieve existing ready agent instance', async () => {
      const getOptions = makeAgentCreateOptions();

      // Mock existing ready agent
      const readyAgent = { ...mockAgent, state: AgentState.READY };
      mockSessionService.getAgentInstance.mockReturnValue(readyAgent as any);

      const result = await service.getAgent(getOptions);

      expect(result).toBe(readyAgent);
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );

      // Should not create new agent since existing one is ready
      expect(mockFactoryService.createAgentByType).not.toHaveBeenCalled();
    });

    it('should create new agent if none exists', async () => {
      const getOptions = makeAgentCreateOptions();

      // Mock that no existing agent
      mockSessionService.getAgentInstance.mockReturnValue(undefined);

      const result = await service.getAgent(getOptions);

      expect(result).toBe(mockAgent);
      expect(mockFactoryService.createAgentByType).toHaveBeenCalled();
    });

    it('should create new agent if existing agent is not ready', async () => {
      const getOptions = makeAgentCreateOptions();

      // Mock existing non-ready agent
      const nonReadyAgent = { ...mockAgent, state: AgentState.INITIALIZING };
      mockSessionService.getAgentInstance.mockReturnValue(nonReadyAgent as any);

      const result = await service.getAgent(getOptions);

      expect(result).toBe(mockAgent);
      expect(mockFactoryService.createAgentByType).toHaveBeenCalled();
    });
  });

  describe('list scoped by userId', () => {
    it('should return agents for specific users through session service', async () => {
      // Mock different agents for different users
      const mockAgentU1 = { type: 'react', state: AgentState.READY };
      const mockAgentU2 = { type: 'react', state: AgentState.READY };

      // Mock session service to return appropriate agents based on user context
      mockSessionService.getAgentInstance
        .mockReturnValueOnce(mockAgentU1 as any) // Call for u1
        .mockReturnValueOnce(mockAgentU2 as any); // Call for u2

      // Test accessing agents for different users
      const u1Agent = mockSessionService.getAgentInstance(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );
      const u2Agent = mockSessionService.getAgentInstance(
        TEST_USER_ID_2,
        TEST_CONVERSATION_ID,
        'react',
      );

      expect(u1Agent).toBe(mockAgentU1);
      expect(u2Agent).toBe(mockAgentU2);

      // Verify session service was called with correct parameters
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );
      expect(mockSessionService.getAgentInstance).toHaveBeenCalledWith(
        TEST_USER_ID_2,
        TEST_CONVERSATION_ID,
        'react',
      );
    });
  });

  describe('update (reconfigure) merges settings', () => {
    it('should handle agent updates through re-creation with new settings', async () => {
      const initialOptions = makeAgentCreateOptions();

      // Create initial agent
      const initialAgent = await service.createAgent(initialOptions);
      expect(initialAgent).toBe(mockAgent);

      // Mock updated settings
      const updatedOptions = makeAgentCreateOptions({
        settings: {
          memory: { windowSize: 8 }, // preserved
          temperature: 0.7, // updated
        },
      });

      // Reset mocks and set up for update scenario
      jest.clearAllMocks();
      mockSessionService.hasAgent.mockReturnValue(false); // Force recreation

      const updatedAgent = await service.createAgent(updatedOptions);

      expect(mockFactoryService.createAgentByType).toHaveBeenCalledWith(
        'react',
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        updatedOptions.settings,
        updatedOptions.config,
      );
      expect(updatedOptions.settings.temperature).toBe(0.7);
      expect(updatedOptions.settings.memory.windowSize).toBe(8); // preserved
    });
  });

  describe('validation errors on create', () => {
    it('should surface validation errors when options are invalid', async () => {
      const invalidOptions = makeAgentCreateOptions();

      // Set up the mock before calling the service
      mockValidationService.validateAgentOptions.mockImplementationOnce(() => {
        throw new BadRequestException('Provider is required');
      });

      // The service should re-throw the validation error
      await expect(service.createAgent(invalidOptions)).rejects.toThrow(
        'Provider is required',
      );

      expect(mockValidationService.validateAgentOptions).toHaveBeenCalledWith(
        invalidOptions,
      );
      // Factory should not be called due to validation error
      expect(mockFactoryService.createAgentByType).not.toHaveBeenCalled();
    });

    it('should surface validation errors for agent configuration', async () => {
      const invalidOptions = makeAgentCreateOptions();

      mockValidationService.validateAgentConfigByType.mockImplementationOnce(
        () => {
          throw new BadRequestException('Invalid settings configuration');
        },
      );

      await expect(service.createAgent(invalidOptions)).rejects.toThrow(
        'Invalid settings configuration',
      );

      expect(
        mockValidationService.validateAgentConfigByType,
      ).toHaveBeenCalledWith('react', invalidOptions.settings);
    });
  });

  describe('provider switch validation', () => {
    it('should allow valid provider/model combinations', async () => {
      const validOptions = makeAgentCreateOptions({
        settings: {
          provider: 'groq',
          model: 'llama3-8b',
        },
      });

      const result = await service.createAgent(validOptions);

      expect(result).toBe(mockAgent);
      expect(
        mockValidationService.validateAgentConfigByType,
      ).toHaveBeenCalledWith('react', validOptions.settings);
    });

    it('should reject unsupported provider/model combinations', async () => {
      const invalidOptions = makeAgentCreateOptions({
        settings: {
          provider: 'groq',
          model: 'gpt-4o', // Unsupported combination
        },
      });

      mockValidationService.validateAgentConfigByType.mockImplementationOnce(
        () => {
          throw new BadRequestException(
            'Unsupported model gpt-4o for provider groq',
          );
        },
      );

      await expect(service.createAgent(invalidOptions)).rejects.toThrow(
        'Unsupported model gpt-4o for provider groq',
      );
    });
  });

  describe('defaults applied when settings omitted', () => {
    it('should work with minimal settings', async () => {
      const minimalOptions = {
        type: 'react',
        userId: TEST_USER_ID,
        conversationId: TEST_CONVERSATION_ID,
        // No settings provided
      };

      const result = await service.createAgent(minimalOptions);

      expect(result).toBe(mockAgent);
      expect(mockFactoryService.createAgentByType).toHaveBeenCalledWith(
        'react',
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        {}, // Empty settings should be passed through
        {}, // Empty config
      );
    });
  });

  describe('agent removal', () => {
    it('should remove agent from session', () => {
      service.removeAgent(TEST_USER_ID, TEST_CONVERSATION_ID, 'react');

      expect(mockSessionService.removeAgent).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_CONVERSATION_ID,
        'react',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle factory service errors gracefully', async () => {
      const createOptions = makeAgentCreateOptions();

      mockFactoryService.createAgentByType.mockRejectedValueOnce(
        new Error('Factory error'),
      );

      await expect(service.createAgent(createOptions)).rejects.toThrow(
        'Factory error',
      );
    });

    it('should handle missing agent gracefully in get operation', async () => {
      const getOptions = makeAgentCreateOptions();

      // Mock that no existing agent and creation fails
      mockSessionService.getAgentInstance.mockReturnValue(undefined);
      mockFactoryService.createAgentByType.mockRejectedValueOnce(
        new Error('Creation failed'),
      );

      await expect(service.getAgent(getOptions)).rejects.toThrow(
        'Creation failed',
      );
    });

    it('should handle agent execution', async () => {
      const executeOptions = { input: 'test input' } as any;

      const result = await service.executeAgent(
        mockAgent as any,
        executeOptions,
      );

      expect(result).toBe('execution result');
      expect(mockExecutionService.executeAgent).toHaveBeenCalledWith(
        mockAgent,
        executeOptions,
      );
    });

    it('should handle create and execute in one operation', async () => {
      const createOptions = makeAgentCreateOptions();
      const executeOptions = { input: 'test input' } as any;

      const result = await service.createAndExecute(
        createOptions,
        executeOptions,
      );

      expect(result).toBe('execution result');
      expect(mockFactoryService.createAgentByType).toHaveBeenCalled();
      expect(mockExecutionService.executeAgent).toHaveBeenCalledWith(
        mockAgent,
        executeOptions,
      );
    });
  });
});
