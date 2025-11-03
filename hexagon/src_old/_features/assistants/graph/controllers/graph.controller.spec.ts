import { Test } from '@nestjs/testing';
import { GraphController } from './graph.controller';
import { AssistantsService } from '../assistants.service';

// Isolate from deep ESM dependencies by mocking the service module interface
jest.mock('../assistants.service', () => ({
  AssistantsService: jest.fn().mockImplementation(() => ({
    getGraphState: jest.fn(),
    pauseGraph: jest.fn(),
    resumeGraph: jest.fn(),
    provideGraphInput: jest.fn(),
    provideGraphApproval: jest.fn(),
  })),
}));

describe('GraphController', () => {
  let ctrl: GraphController;
  const svc = {
    getGraphState: jest.fn(),
    pauseGraph: jest.fn(),
    resumeGraph: jest.fn(),
    provideGraphInput: jest.fn(),
    provideGraphApproval: jest.fn(),
  } as unknown as jest.Mocked<AssistantsService>;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [GraphController],
      providers: [{ provide: AssistantsService, useValue: svc }],
    }).compile();
    ctrl = mod.get(GraphController);
    jest.clearAllMocks();
  });

  it('getGraphState delegates to service', async () => {
    (svc.getGraphState as any).mockResolvedValue({ ok: true });
    const res = await ctrl.getGraphState('conv1', 'u1');
    expect(svc.getGraphState).toHaveBeenCalledWith('u1', 'conv1');
    expect(res).toEqual({ ok: true });
  });

  it('pause/resume return simple success responses', async () => {
    const pause = await ctrl.pauseGraph('c1', 'u1', { reason: 'manual' });
    expect(svc.pauseGraph).toHaveBeenCalledWith('u1', 'c1', {
      reason: 'manual',
    });
    expect(pause).toEqual({
      success: true,
      message: 'Graph execution paused.',
    });

    const resume = await ctrl.resumeGraph('c1', 'u1');
    expect(svc.resumeGraph).toHaveBeenCalledWith('u1', 'c1');
    expect(resume).toEqual({
      success: true,
      message: 'Graph execution resumed.',
    });
  });

  it('provideGraphInput and provideGraphApproval call service and return success', async () => {
    const res1 = await ctrl.provideGraphInput('c1', 'n1', {
      userId: 'u1',
      input: { a: 1 },
    } as any);
    expect(svc.provideGraphInput).toHaveBeenCalledWith('u1', 'c1', 'n1', {
      a: 1,
    });
    expect(res1).toEqual({
      success: true,
      message: 'Input provided to graph node.',
    });

    const res2 = await ctrl.provideGraphApproval('c1', 'n2', {
      userId: 'u1',
      approved: true,
    } as any);
    expect(svc.provideGraphApproval).toHaveBeenCalledWith(
      'u1',
      'c1',
      'n2',
      true,
    );
    expect(res2).toEqual({
      success: true,
      message: 'Approval provided to graph node.',
    });
  });
});
