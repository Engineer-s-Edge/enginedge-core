import { NodeManagementService } from './node-management.service';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../kafka/kafka.service';

const makeLogger = (): any => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
});

describe('NodeManagementService', () => {
  let service: NodeManagementService;
  const k8sSvc = {
    scaleDeployment: jest.fn(),
    createPod: jest.fn(),
    listPods: jest.fn(),
    deletePod: jest.fn(),
    execCommandInPod: jest.fn(),
    getPodLogs: jest.fn(),
    getPod: jest.fn(),
  } as any;
  const cfg = {
    get: jest.fn((k: string, d?: any) => d),
  } as any as ConfigService;
  const kafkaMock = {
    sendCommand: jest.fn(),
  };
  const kafka = kafkaMock as unknown as KafkaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NodeManagementService(k8sSvc, cfg, makeLogger(), kafka);
  });

  it('scaleWorkerDeployment success and error', async () => {
    k8sSvc.scaleDeployment.mockResolvedValueOnce(undefined);
    await expect(service.scaleWorkerDeployment(3)).resolves.toEqual({
      success: true,
    });
    k8sSvc.scaleDeployment.mockRejectedValueOnce(new Error('fail'));
    await expect(service.scaleWorkerDeployment(3)).rejects.toThrow('fail');
  });

  it('offloadTask sends command and returns taskId; errors propagate', async () => {
    kafkaMock.sendCommand.mockResolvedValueOnce(undefined);
    const res = await service.offloadTask('do', { x: 1 });
    expect(res.taskId).toBeDefined();
    kafkaMock.sendCommand.mockRejectedValueOnce(new Error('oops'));
    await expect(service.offloadTask('do', { x: 2 })).rejects.toThrow('oops');
  });

  it('startWorkerNode builds manifest and creates pod', async () => {
    k8sSvc.createPod.mockResolvedValueOnce({ name: 'pod-1' });
    const pod = await service.startWorkerNode('u1', 'problem-solver', {
      cpu: '250m',
      memory: '128Mi',
      gpu: true,
    });
    expect(pod).toEqual({ name: 'pod-1' });
    expect(k8sSvc.createPod).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Pod' }),
    );
  });

  it('getUserWorkerNodes filters pods by labels', async () => {
    k8sSvc.listPods.mockResolvedValueOnce([
      { labels: { app: 'enginedge-worker', 'enginedge/user-id': 'u1' } },
      { labels: { app: 'other' } },
    ]);
    const pods = await service.getUserWorkerNodes('u1');
    expect(pods.length).toBe(1);
  });

  it('stopWorkerNode delegates to deletePod', async () => {
    k8sSvc.deletePod.mockResolvedValueOnce({ ok: true });
    const res = await service.stopWorkerNode('p1');
    expect(res).toEqual({ ok: true });
  });

  it('sendCommandToWorkerNode builds args and calls exec', async () => {
    k8sSvc.execCommandInPod.mockResolvedValueOnce({ code: 0 });
    const res = await service.sendCommandToWorkerNode('p1', 'echo hi');
    expect(res).toEqual({ code: 0 });
    expect(k8sSvc.execCommandInPod).toHaveBeenCalledWith(
      'p1',
      'worker',
      expect.any(Array),
    );
  });

  it('getWorkerNodeLogs delegates and wraps', async () => {
    k8sSvc.getPodLogs.mockResolvedValueOnce('logs');
    const res = await service.getWorkerNodeLogs('p1');
    expect(res).toEqual({ podName: 'p1', logs: 'logs' });
  });

  it('isWorkerNodeReady checks status and container readiness', async () => {
    k8sSvc.getPod.mockResolvedValueOnce({
      status: 'Running',
      containerStatuses: [{ ready: true }],
    });
    await expect(service.isWorkerNodeReady('p1')).resolves.toBe(true);
    k8sSvc.getPod.mockResolvedValueOnce({
      status: 'Pending',
      containerStatuses: [{ ready: true }],
    });
    await expect(service.isWorkerNodeReady('p1')).resolves.toBe(false);
  });
});
