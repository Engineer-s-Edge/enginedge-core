import { Test, TestingModule } from '@nestjs/testing';
import { MyLogger } from '@core/services/logger/logger.service';

// Mock the complex dependencies
jest.mock(
  '@core/infrastructure/agents/core/agents/services/factory.service',
  () => ({
    AgentType: {
      BASE: 'base',
      REACT: 'react',
      GRAPH: 'graph',
    },
    ReActAgentTypeManager: {
      getBaseType: jest.fn((type) =>
        type.startsWith('react_') ? 'react' : type,
      ),
      isReActType: jest.fn(
        (type) => type === 'react' || type.startsWith('react_'),
      ),
    },
  }),
);

// Mock BaseAgent interface
interface MockBaseAgent {
  abort: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  getState: jest.Mock;
  state: string;
}

import {
  AgentSessionService,
  AgentSessionState,
  UserInteractionContext,
  AgentControlOptions,
} from './session.service';

describe('AgentSessionService', () => {
  let service: AgentSessionService;
  let mockLogger: jest.Mocked<MyLogger>;
  let mockAgent: MockBaseAgent;

  const testUserId = 'u_507f1f77bcf86cd799439011' as any;
  const testConversationId = 'c_507f1f77bcf86cd799439012' as any;
  const testType = 'react';

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
        AgentSessionService,
        {
          provide: MyLogger,
          useValue: mockLoggerImplementation,
        },
      ],
    }).compile();

    service = module.get<AgentSessionService>(AgentSessionService);
    mockLogger = module.get(MyLogger);

    // Create a mock agent
    mockAgent = {
      abort: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getState: jest.fn().mockReturnValue('ready'),
      state: 'ready',
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
      'AgentSessionService initializing',
      'AgentSessionService',
    );
  });

  describe('createSession', () => {
    it('should create a new agent session with default settings', () => {
      const sessionState = service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      expect(sessionState).toEqual({
        agentType: testType,
        userId: testUserId,
        conversationId: testConversationId,
        status: 'idle',
        pendingUserInteractions: expect.any(Map),
        eventFilters: {},
        controlOptions: {
          pauseOnUserInteraction: true,
          userInteractionTimeout: 5 * 60 * 1000, // 5 minutes
          autoResumeOnTimeout: false,
          maxConcurrentInteractions: 3,
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Creating session for agent type ${testType}`),
        'AgentSessionService',
      );
    });

    it('should store the agent instance and session state', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      const retrievedAgent = service.getAgentInstance(
        testUserId,
        testConversationId,
        testType,
      );
      const sessionState = service.getSessionState(
        testUserId,
        testConversationId,
        testType,
      );

      expect(retrievedAgent).toBe(mockAgent);
      expect(sessionState).toBeDefined();
      expect(sessionState!.status).toBe('idle');
    });
  });

  describe('getAgentInstance', () => {
    it('should return agent instance when it exists', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      const retrievedAgent = service.getAgentInstance(
        testUserId,
        testConversationId,
        testType,
      );

      expect(retrievedAgent).toBe(mockAgent);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Getting agent instance'),
        'AgentSessionService',
      );
    });

    it('should return undefined when agent instance does not exist', () => {
      const retrievedAgent = service.getAgentInstance(
        testUserId,
        testConversationId,
        testType,
      );

      expect(retrievedAgent).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
        'AgentSessionService',
      );
    });
  });

  describe('hasAgent', () => {
    it('should return true when agent exists', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      const hasAgent = service.hasAgent(
        testUserId,
        testConversationId,
        testType,
      );

      expect(hasAgent).toBe(true);
    });

    it('should return false when agent does not exist', () => {
      const hasAgent = service.hasAgent(
        testUserId,
        testConversationId,
        testType,
      );

      expect(hasAgent).toBe(false);
    });
  });

  describe('removeAgent', () => {
    it('should remove agent instance and session state', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      expect(service.hasAgent(testUserId, testConversationId, testType)).toBe(
        true,
      );

      service.removeAgent(testUserId, testConversationId, testType);

      expect(service.hasAgent(testUserId, testConversationId, testType)).toBe(
        false,
      );
      expect(
        service.getAgentInstance(testUserId, testConversationId, testType),
      ).toBeUndefined();
      expect(
        service.getSessionState(testUserId, testConversationId, testType),
      ).toBeUndefined();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removing agent'),
        'AgentSessionService',
      );
    });
  });

  describe('clearAllAgents', () => {
    it('should remove all agent instances and session states', () => {
      service.createSession(
        testUserId,
        testConversationId,
        'react',
        mockAgent as any,
      );
      service.createSession(
        testUserId,
        'c_507f1f77bcf86cd799439013' as any,
        'graph',
        mockAgent as any,
      );

      expect(service.hasAgent(testUserId, testConversationId, 'react')).toBe(
        true,
      );
      expect(
        service.hasAgent(
          testUserId,
          'c_507f1f77bcf86cd799439013' as any,
          'graph',
        ),
      ).toBe(true);

      service.clearAllAgents();

      expect(service.hasAgent(testUserId, testConversationId, 'react')).toBe(
        false,
      );
      expect(
        service.hasAgent(
          testUserId,
          'c_507f1f77bcf86cd799439013' as any,
          'graph',
        ),
      ).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Clearing all agent instances and sessions',
        'AgentSessionService',
      );
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status when session exists', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      service.updateSessionStatus(
        testUserId,
        testConversationId,
        testType,
        'running',
      );

      const sessionState = service.getSessionState(
        testUserId,
        testConversationId,
        testType,
      );
      expect(sessionState!.status).toBe('running');
    });

    it('should handle status update for non-existent session', () => {
      expect(() => {
        service.updateSessionStatus(
          testUserId,
          testConversationId,
          testType,
          'running',
        );
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Session state not found'),
        'AgentSessionService',
      );
    });
  });

  describe('setCurrentExecution', () => {
    it('should set current execution for existing session', () => {
      service.createSession(
        testUserId,
        testConversationId,
        testType,
        mockAgent as any,
      );

      const executionInfo = {
        startTime: new Date(),
        input: 'test input',
        executionId: 'exec_123',
      };

      service.setCurrentExecution(
        testUserId,
        testConversationId,
        testType,
        executionInfo,
      );

      const sessionState = service.getSessionState(
        testUserId,
        testConversationId,
        testType,
      );
      expect(sessionState!.currentExecution).toEqual(executionInfo);
    });

    it('should handle setting execution for non-existent session', () => {
      const executionInfo = {
        startTime: new Date(),
        input: 'test input',
        executionId: 'exec_123',
      };

      expect(() => {
        service.setCurrentExecution(
          testUserId,
          testConversationId,
          testType,
          executionInfo,
        );
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Session state not found'),
        'AgentSessionService',
      );
    });
  });

  describe('getAgentStats', () => {
    it('should return correct statistics', () => {
      const conversationId2 = 'c_507f1f77bcf86cd799439013' as any;

      service.createSession(
        testUserId,
        testConversationId,
        'react',
        mockAgent as any,
      );
      service.createSession(
        testUserId,
        conversationId2,
        'graph',
        mockAgent as any,
      );

      service.updateSessionStatus(
        testUserId,
        testConversationId,
        'react',
        'running',
      );

      const stats = service.getAgentStats();

      expect(stats.totalInstances).toBe(2);
      expect(stats.instancesByType.react).toBe(1);
      expect(stats.instancesByType.graph).toBe(1);
      expect(stats.sessionsByStatus.idle).toBe(1);
      expect(stats.sessionsByStatus.running).toBe(1);
    });

    it('should return zero statistics when no agents exist', () => {
      const stats = service.getAgentStats();

      expect(stats.totalInstances).toBe(0);
      expect(stats.instancesByType).toEqual({});
      expect(stats.instancesByState).toEqual({});
      expect(stats.sessionsByStatus).toEqual({});
    });
  });
});
