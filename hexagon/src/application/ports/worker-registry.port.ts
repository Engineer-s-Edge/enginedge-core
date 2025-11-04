import { Worker } from '@domain/entities/worker.entity';

export interface IWorkerRegistry {
  getWorkers(type: string): Promise<Worker[]>;
  getAllWorkers(): Promise<Worker[]>;
  updateWorkerHealth(workerId: string, status: 'healthy' | 'unhealthy'): Promise<void>;
}

