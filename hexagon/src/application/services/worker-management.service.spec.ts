import { Test, TestingModule } from '@nestjs/testing';
import { WorkerManagementService } from './worker-management.service';
import { WorkerLoadBalancer } from '@infrastructure/worker-registry/worker-load-balancer.service';
import { Worker } from '@domain/entities/worker.entity';
import { WorkerType, WorkerStatus } from '@domain/types/workflow.types';
import { IWorkerRegistry } from '../ports/worker-registry.port';

describe('WorkerManagementService', () => {
  let service: WorkerManagementService;
  let mockRegistry: Partial<IWorkerRegistry>;
  let mockLoadBalancer: Partial<WorkerLoadBalancer>;

  beforeEach(async () => {
    mockRegistry = {
      getWorkers: jest.fn(),
      getAllWorkers: jest.fn(),
    };
    mockLoadBalancer = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerManagementService,
        { provide: 'IWorkerRegistry', useValue: mockRegistry },
        { provide: WorkerLoadBalancer, useValue: mockLoadBalancer },
      ],
    }).compile();

    service = module.get<WorkerManagementService>(WorkerManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAvailableWorkers', () => {
    it('should return only healthy workers', async () => {
      const w1 = new Worker('1', WorkerType.RESUME, 'u1');
      w1.updateHealth(WorkerStatus.HEALTHY);
      const w2 = new Worker('2', WorkerType.RESUME, 'u2');
      w2.updateHealth(WorkerStatus.UNHEALTHY);

      (mockRegistry.getWorkers as jest.Mock).mockResolvedValue([w1, w2]);

      const result = await service.getAvailableWorkers(WorkerType.RESUME);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('checkWorkerHealth', () => {
    it('should return health status for existing worker', async () => {
      const w1 = new Worker('1', WorkerType.RESUME, 'u1');
      w1.updateHealth(WorkerStatus.HEALTHY);
      (mockRegistry.getAllWorkers as jest.Mock).mockResolvedValue([w1]);

      const result = await service.checkWorkerHealth('1');
      expect(result.healthy).toBe(true);
      expect(result.lastCheck).toBeDefined();
    });

    it('should throw error for missing worker', async () => {
      (mockRegistry.getAllWorkers as jest.Mock).mockResolvedValue([]);
      await expect(service.checkWorkerHealth('999')).rejects.toThrow(
        'Worker 999 not found',
      );
    });
  });

  describe('loadBalance', () => {
    it('should return null if no workers', async () => {
      (mockRegistry.getWorkers as jest.Mock).mockResolvedValue([]);
      const result = await service.loadBalance(WorkerType.RESUME);
      expect(result).toBeNull();
    });

    it('should return a healthy worker if available', async () => {
      const w1 = new Worker('1', WorkerType.RESUME, 'u1');
      w1.updateHealth(WorkerStatus.HEALTHY);
      (mockRegistry.getWorkers as jest.Mock).mockResolvedValue([w1]);
      const result = await service.loadBalance(WorkerType.RESUME);
      expect(result).toBe(w1);
    });

    it('should fallback to unhealthy worker if all unhealthy', async () => {
      const w1 = new Worker('1', WorkerType.RESUME, 'u1');
      w1.updateHealth(WorkerStatus.UNHEALTHY);
      (mockRegistry.getWorkers as jest.Mock).mockResolvedValue([w1]);
      const result = await service.loadBalance(WorkerType.RESUME);
      expect(result).toBe(w1);
    });
  });
});
