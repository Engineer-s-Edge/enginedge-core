import { Test } from '@nestjs/testing';
import { KubernetesController } from './kubernetes.controller';
import { KubernetesService } from './kubernetes.service';
import { MyLogger } from '../../services/logger/logger.service';

const makeLogger = (): Partial<MyLogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
});

describe('KubernetesController', () => {
  let controller: KubernetesController;
  const svc = {
    listPods: jest.fn(),
    getPod: jest.fn(),
    createPod: jest.fn(),
    deletePod: jest.fn(),
    listDeployments: jest.fn(),
    scaleDeployment: jest.fn(),
    createService: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [KubernetesController],
      providers: [
        { provide: KubernetesService, useValue: svc },
        { provide: MyLogger, useValue: makeLogger() },
      ],
    }).compile();
    controller = module.get(KubernetesController);
    jest.clearAllMocks();
  });

  it('getAllPods returns data and handles errors', async () => {
    svc.listPods.mockResolvedValueOnce([{ name: 'p1' }]);
    await expect(controller.getAllPods()).resolves.toEqual([{ name: 'p1' }]);
    svc.listPods.mockRejectedValueOnce(new Error('fail'));
    await expect(controller.getAllPods()).rejects.toMatchObject({
      status: 500,
    });
  });

  it('getPod returns data and handles errors', async () => {
    svc.getPod.mockResolvedValueOnce({ name: 'p2' });
    await expect(controller.getPod('p2')).resolves.toEqual({ name: 'p2' });
    svc.getPod.mockRejectedValueOnce(new Error('oops'));
    await expect(controller.getPod('p2')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('createPod returns data and handles errors', async () => {
    svc.createPod.mockResolvedValueOnce({ name: 'p3' });
    await expect(controller.createPod({} as any)).resolves.toEqual({
      name: 'p3',
    });
    svc.createPod.mockRejectedValueOnce(new Error('bad'));
    await expect(controller.createPod({} as any)).rejects.toMatchObject({
      status: 500,
    });
  });

  it('deletePod returns data and handles errors', async () => {
    svc.deletePod.mockResolvedValueOnce({ ok: true });
    await expect(controller.deletePod('p4')).resolves.toEqual({ ok: true });
    svc.deletePod.mockRejectedValueOnce(new Error('bad'));
    await expect(controller.deletePod('p4')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('getAllDeployments and scaleDeployment', async () => {
    svc.listDeployments.mockResolvedValueOnce([{ name: 'd1' }]);
    await expect(controller.getAllDeployments()).resolves.toEqual([
      { name: 'd1' },
    ]);
    svc.scaleDeployment.mockResolvedValueOnce({ ok: true });
    await expect(
      controller.scaleDeployment('d1', { replicas: 2 }),
    ).resolves.toEqual({ ok: true });
  });

  it('createService returns data and handles errors', async () => {
    svc.createService.mockResolvedValueOnce({ name: 's1' });
    await expect(controller.createService({} as any)).resolves.toEqual({
      name: 's1',
    });
    svc.createService.mockRejectedValueOnce(new Error('bad'));
    await expect(controller.createService({} as any)).rejects.toMatchObject({
      status: 500,
    });
  });
});
