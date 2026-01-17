import { Worker } from './worker.entity';
import { WorkerType, WorkerStatus } from '../types/workflow.types';

describe('Worker Entity', () => {
  const workerId = 'test-worker-id';
  const workerType = WorkerType.RESUME;
  const endpoint = 'http://localhost:3000';
  const capabilities = ['ocr', 'parsing'];

  let worker: Worker;

  beforeEach(() => {
    worker = new Worker(workerId, workerType, endpoint, capabilities);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('should initialize with correct values', () => {
    expect(worker.id).toBe(workerId);
    expect(worker.type).toBe(workerType);
    expect(worker.endpoint).toBe(endpoint);
    expect(worker.capabilities).toEqual(capabilities);
    expect(worker.status).toBe(WorkerStatus.UNKNOWN);
  });

  it('should default capabilities to empty array if not provided', () => {
    const simpleWorker = new Worker('id', workerType, 'endpoint');
    expect(simpleWorker.capabilities).toEqual([]);
  });

  it('should update health status and timestamp', () => {
    const before = new Date();
    worker.updateHealth(WorkerStatus.HEALTHY);
    const after = new Date();

    expect(worker.status).toBe(WorkerStatus.HEALTHY);
    expect(worker.lastHealthCheck).toBeDefined();
    // Allow for small time difference
    const timeDiff = worker.lastHealthCheck!.getTime() - before.getTime();
    expect(timeDiff).toBeGreaterThanOrEqual(0);
    expect(worker.lastHealthCheck!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should check for capabilities correctly', () => {
    expect(worker.hasCapability('ocr')).toBe(true);
    expect(worker.hasCapability('parsing')).toBe(true);
    expect(worker.hasCapability('non-existent')).toBe(false);
  });

  it('should report healthy correctly', () => {
    worker.status = WorkerStatus.HEALTHY;
    expect(worker.isHealthy()).toBe(true);

    worker.status = WorkerStatus.UNHEALTHY;
    expect(worker.isHealthy()).toBe(false);

    worker.status = WorkerStatus.UNKNOWN;
    expect(worker.isHealthy()).toBe(false);
  });
});
