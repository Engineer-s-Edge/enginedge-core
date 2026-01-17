import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IWorkerRegistry } from '../ports/worker-registry.port';
import { Worker } from '@domain/entities/worker.entity';
import { WorkerType } from '@domain/types/workflow.types';
import { WorkerLoadBalancer } from '@infrastructure/worker-registry/worker-load-balancer.service';

@Injectable()
export class WorkerManagementService {
  private readonly logger = new Logger(WorkerManagementService.name);

  constructor(
    @Inject('IWorkerRegistry')
    private readonly workerRegistry: IWorkerRegistry,
    private readonly loadBalancer: WorkerLoadBalancer
  ) {}

  async getAvailableWorkers(workerType: WorkerType): Promise<Worker[]> {
    const workers = await this.workerRegistry.getWorkers(workerType);
    return workers.filter((w) => w.isHealthy());
  }

  async checkWorkerHealth(workerId: string): Promise<{ healthy: boolean; lastCheck?: Date }> {
    const allWorkers = await this.workerRegistry.getAllWorkers();
    const worker = allWorkers.find((w) => w.id === workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    return {
      healthy: worker.isHealthy(),
      lastCheck: worker.lastHealthCheck,
    };
  }

  async loadBalance(workerType: WorkerType): Promise<Worker | null> {
    const workers = await this.workerRegistry.getWorkers(workerType);
    if (workers.length === 0) return null;

    // Simple round-robin selection from healthy workers
    const healthyWorkers = workers.filter((w) => w.isHealthy());
    if (healthyWorkers.length === 0) {
      return workers[0] || null;
    }
    const randomIndex = Math.floor(Math.random() * healthyWorkers.length);
    return healthyWorkers[randomIndex];
  }
}
