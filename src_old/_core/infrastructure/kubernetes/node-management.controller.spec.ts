import { Test } from '@nestjs/testing';
import { NodeManagementController } from './node-management.controller';
import { NodeManagementService } from './node-management.service';
import { MyLogger } from '../../services/logger/logger.service';

const makeLogger = (): any => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
});

describe('NodeManagementController', () => {
  let controller: NodeManagementController;
  const svc = {
    startWorkerNode: jest.fn(),
    getUserWorkerNodes: jest.fn(),
    stopWorkerNode: jest.fn(),
    sendCommandToWorkerNode: jest.fn(),
    getWorkerNodeLogs: jest.fn(),
    isWorkerNodeReady: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [NodeManagementController],
      providers: [
        { provide: NodeManagementService, useValue: svc },
        { provide: MyLogger, useValue: makeLogger() },
      ],
    }).compile();
    controller = module.get(NodeManagementController);
    jest.clearAllMocks();
  });

  it('startWorkerNode and error path', async () => {
    svc.startWorkerNode.mockResolvedValueOnce({ name: 'pod1' });
    await expect(
      controller.startWorkerNode({
        userId: 'u',
        nodeType: 'problem-solver',
      } as any),
    ).resolves.toEqual({ name: 'pod1' });
    svc.startWorkerNode.mockRejectedValueOnce(new Error('fail'));
    await expect(
      controller.startWorkerNode({
        userId: 'u',
        nodeType: 'problem-solver',
      } as any),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('getUserWorkerNodes and error path', async () => {
    svc.getUserWorkerNodes.mockResolvedValueOnce([{ name: 'p1' }]);
    await expect(controller.getUserWorkerNodes('u1')).resolves.toEqual([
      { name: 'p1' },
    ]);
    svc.getUserWorkerNodes.mockRejectedValueOnce(new Error('oops'));
    await expect(controller.getUserWorkerNodes('u1')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('stopWorkerNode and error path', async () => {
    svc.stopWorkerNode.mockResolvedValueOnce({ ok: true });
    await expect(controller.stopWorkerNode('pod1')).resolves.toEqual({
      ok: true,
    });
    svc.stopWorkerNode.mockRejectedValueOnce(new Error('bad'));
    await expect(controller.stopWorkerNode('pod1')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('sendCommandToWorkerNode and error path', async () => {
    svc.sendCommandToWorkerNode.mockResolvedValueOnce({ code: 0 });
    await expect(
      controller.sendCommandToWorkerNode('pod1', 'echo hi'),
    ).resolves.toEqual({ code: 0 });
    svc.sendCommandToWorkerNode.mockRejectedValueOnce(new Error('bad'));
    await expect(
      controller.sendCommandToWorkerNode('pod1', 'echo hi'),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('getWorkerNodeLogs and status', async () => {
    svc.getWorkerNodeLogs.mockResolvedValueOnce('logs');
    await expect(controller.getWorkerNodeLogs('pod1')).resolves.toEqual('logs');
    svc.isWorkerNodeReady.mockResolvedValueOnce(true);
    await expect(controller.getWorkerNodeStatus('pod1')).resolves.toEqual({
      isReady: true,
    });
  });

  it('workerConnected just returns success', async () => {
    await expect(controller.workerConnected({ foo: 'bar' })).resolves.toEqual({
      success: true,
    });
  });
});
