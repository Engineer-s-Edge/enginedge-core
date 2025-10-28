import { Test } from '@nestjs/testing';
// Mock heavy modules to avoid ESM transitive imports
jest.mock(
  '../../../core/infrastructure/agents/core/agents/agent.service',
  () => ({ AgentService: class {} }),
  { virtual: true },
);
jest.mock(
  '../../../core/services/logger/logger.service',
  () => ({
    MyLogger: class {
      info() {}
      debug() {}
      warn() {}
      error() {}
    },
  }),
  { virtual: true },
);
import { GraphAgentManagerService } from './graph-agent-manager.service';
import { AgentService } from '../../../core/infrastructure/agents/core/agents/agent.service';
import { MyLogger } from '../../../core/services/logger/logger.service';

class LoggerMock {
  info = jest.fn();
  debug = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GraphAgentManagerService', () => {
  let service: GraphAgentManagerService;
  let agent: jest.Mocked<AgentService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphAgentManagerService,
        {
          provide: AgentService,
          useValue: {
            getGraphAgentExecutionState: jest.fn(),
            pauseGraphAgent: jest.fn(),
            resumeGraphAgent: jest.fn(),
            provideGraphAgentUserInput: jest.fn(),
            provideGraphAgentUserApproval: jest.fn(),
          },
        },
        { provide: MyLogger, useClass: LoggerMock },
      ],
    }).compile();

    service = moduleRef.get(GraphAgentManagerService);
    agent = moduleRef.get(AgentService) as any;
  });

  const userId = '507f1f77bcf86cd799439011';
  const convId = '507f1f77bcf86cd799439012';
  const nodeId = '507f1f77bcf86cd799439013';

  it('gets graph state', async () => {
    const state = {
      isPaused: false,
      currentNodes: ['n1'],
      pausedBranches: [] as any,
      executionHistory: [],
    };
    agent.getGraphAgentExecutionState.mockResolvedValue(state as any);
    const res = await service.getGraphState(userId, convId);
    expect(res).toEqual(state);
    expect(agent.getGraphAgentExecutionState).toHaveBeenCalled();
  });

  it('pauses and resumes graph', async () => {
    await service.pauseGraph(userId, convId, { reason: 'user' });
    expect(agent.pauseGraphAgent).toHaveBeenCalled();

    await service.resumeGraph(userId, convId);
    expect(agent.resumeGraphAgent).toHaveBeenCalled();
  });

  it('provides input and approval', async () => {
    await service.provideGraphInput(userId, convId, nodeId, 'hello');
    expect(agent.provideGraphAgentUserInput).toHaveBeenCalled();

    await service.provideGraphApproval(userId, convId, nodeId, true);
    expect(agent.provideGraphAgentUserApproval).toHaveBeenCalled();
  });
});
