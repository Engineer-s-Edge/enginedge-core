import { Test } from '@nestjs/testing';
jest.mock('../assistants.service', () => ({ AssistantsService: class {} }), {
  virtual: true,
});
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
import { GraphBuilderService } from './graph-builder.service';
import { AssistantsService } from '../assistants.service';
import { MyLogger } from '../../../core/services/logger/logger.service';
import {
  GraphEdgeType,
  GraphNodeType,
  UserInteractionMode,
} from '../dto/graph-builder.dto';

class LoggerMock {
  info = jest.fn();
  debug = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GraphBuilderService', () => {
  let service: GraphBuilderService;
  let assistants: jest.Mocked<AssistantsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphBuilderService,
        { provide: AssistantsService, useValue: { create: jest.fn() } },
        { provide: MyLogger, useClass: LoggerMock },
      ],
    }).compile();

    service = moduleRef.get(GraphBuilderService);
    assistants = moduleRef.get(AssistantsService) as any;
  });

  const minimalGraph = {
    name: 'g',
    nodes: [
      { id: 'start', type: GraphNodeType.START, name: 'Start', config: {} },
      { id: 'end', type: GraphNodeType.END, name: 'End', config: {} },
    ],
    edges: [
      {
        id: 'e1',
        sourceNodeId: 'start',
        targetNodeId: 'end',
        type: GraphEdgeType.DIRECT,
      },
    ],
  } as any;

  it('returns node templates and can filter by category', async () => {
    const all = await service.getGraphNodeTemplates();
    expect(all.length).toBeGreaterThan(5);
    const user = await service.getGraphNodeTemplates('user_interaction');
    expect(user.every((t) => t.category === 'user_interaction')).toBe(true);
  });

  it('returns edge types', async () => {
    const types = await service.getGraphEdgeTypes();
    expect(types.map((t) => t.type)).toContain(GraphEdgeType.DIRECT);
    expect(types.map((t) => t.type)).toContain(GraphEdgeType.CONDITIONAL);
  });

  it('returns user interaction types', async () => {
    const ui = await service.getUserInteractionTypes();
    expect(
      ui.find((x) => x.type === UserInteractionMode.APPROVAL_REQUIRED),
    ).toBeTruthy();
  });

  it('validates a minimal valid graph', async () => {
    const res = await service.validateGraphConfig(minimalGraph);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('finds validation errors for missing start node and duplicate ids', async () => {
    const invalid = {
      name: 'x',
      nodes: [
        { id: 'n1', type: GraphNodeType.LLM, name: 'A', config: {} },
        { id: 'n1', type: GraphNodeType.LLM, name: 'B', config: {} },
      ],
      edges: [],
    } as any;
    const res = await service.validateGraphConfig(invalid);
    expect(res.isValid).toBe(false);
    expect(res.errors.join('\n')).toMatch(/duplicate/i);
    expect(res.errors.join('\n')).toMatch(/start node/i);
  });

  it('creates a graph agent by delegating to AssistantsService after conversion', async () => {
    assistants.create.mockResolvedValue({ _id: 'id1' } as any);
    const dto = {
      name: 'agent1',
      description: 'desc',
      userId: 'u1',
      isPublic: false,
      subjectExpertise: [],
      options: {},
      graphConfig: minimalGraph,
    } as any;
    const res = await service.createGraphAgent(dto);
    expect(assistants.create).toHaveBeenCalled();
    expect(res).toEqual({ _id: 'id1' });
  });
});
