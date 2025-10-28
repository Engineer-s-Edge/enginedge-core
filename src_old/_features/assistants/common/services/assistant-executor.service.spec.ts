import { Test } from '@nestjs/testing';
// Mock heavy AgentService module to prevent ESM chain loading
jest.mock(
  '../../../core/infrastructure/agents/core/agents/agent.service',
  () => ({ AgentService: class {} }),
  { virtual: true },
);
// Also mock factory.service used indirectly by AgentConfigFactory
jest.mock(
  '../../../core/infrastructure/agents/core/agents/services/factory.service',
  () => ({
    AgentType: {
      BASE: 'base',
      REACT: 'react',
      GRAPH: 'graph',
      EXPERT: 'expert',
      GENIUS: 'genius',
      COLLECTIVE: 'collective',
      MANAGER: 'manager',
    },
  }),
  { virtual: true },
);
// Mock logger to avoid winston side-effects
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
import { AssistantExecutorService } from './assistant-executor.service';
import { AgentService } from '../../../core/infrastructure/agents/core/agents/agent.service';
import { AgentConfigFactory } from './agent-config-factory.service';
import { AssistantsCrudService } from './assistants-crud.service';
import { AssistantsRepository } from '../repositories/assistants.repository';
import { AssistantStatus, AssistantType } from '../entities/assistant.entity';
import { MyLogger } from '../../../core/services/logger/logger.service';

class LoggerMock {
  info = jest.fn();
  debug = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('AssistantExecutorService', () => {
  let service: AssistantExecutorService;
  let agentService: jest.Mocked<AgentService>;
  let configFactory: jest.Mocked<AgentConfigFactory>;
  let crud: jest.Mocked<AssistantsCrudService>;
  let repo: jest.Mocked<AssistantsRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssistantExecutorService,
        {
          provide: AgentService,
          useValue: {
            createAndExecute: jest.fn(),
            getGraphAgentExecutionState: jest.fn(),
          },
        },
        {
          provide: AgentConfigFactory,
          useValue: { convertAssistantToAgentOptions: jest.fn() },
        },
        { provide: AssistantsCrudService, useValue: { findByName: jest.fn() } },
        {
          provide: AssistantsRepository,
          useValue: { updateExecutionStats: jest.fn() },
        },
        { provide: MyLogger, useClass: LoggerMock },
      ],
    }).compile();

    service = moduleRef.get(AssistantExecutorService);
    agentService = moduleRef.get(AgentService) as any;
    configFactory = moduleRef.get(AgentConfigFactory) as any;
    crud = moduleRef.get(AssistantsCrudService) as any;
    repo = moduleRef.get(AssistantsRepository) as any;
  });

  const activeAssistant = {
    name: 'A1',
    status: AssistantStatus.ACTIVE,
    type: AssistantType.REACT_AGENT,
  } as any;

  const executeDto = {
    userId: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    input: 'hello',
    options: { streaming: false, history: [] },
  } as any;

  it('executes assistant and updates stats', async () => {
    crud.findByName.mockResolvedValue(activeAssistant);
    configFactory.convertAssistantToAgentOptions.mockReturnValue({
      type: 'react',
      userId: 'u' as any,
      conversationId: 'c' as any,
      settings: {},
      config: {},
    });
    agentService.createAndExecute.mockResolvedValue('result');

    const res = await service.execute('A1', executeDto);

    expect(agentService.createAndExecute).toHaveBeenCalled();
    expect(repo.updateExecutionStats).toHaveBeenCalledWith('A1');
    expect(res.success).toBe(true);
    expect(res.result).toBe('result');
    expect(res.streaming).toBe(false);
  });

  it('throws when assistant is not active', async () => {
    crud.findByName.mockResolvedValue({
      ...activeAssistant,
      status: AssistantStatus.INACTIVE,
    });
    await expect(service.execute('A1', executeDto)).rejects.toThrow(
      /not active/i,
    );
    expect(agentService.createAndExecute).not.toHaveBeenCalled();
  });
});
