import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KubernetesWorkerRegistryAdapter, InfraWorker } from './kubernetes-worker-registry.adapter';

@Injectable()
export class WorkerHealthMonitor implements OnModuleInit {
  private readonly logger = new Logger(WorkerHealthMonitor.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly registry: KubernetesWorkerRegistryAdapter,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    const interval = this.configService.get<number>('WORKER_HEALTH_CHECK_INTERVAL', 30000);
    this.interval = setInterval(() => this.checkAllWorkers(), interval);
    await this.checkAllWorkers(); // Initial check
  }

  private async checkAllWorkers(): Promise<void> {
    // Access internal workers map
    const registry = this.registry as any;
    const allInfraWorkers: InfraWorker[] = [];
    for (const workers of registry.workers.values()) {
      allInfraWorkers.push(...workers);
    }
    const checks = allInfraWorkers.map((worker) => this.checkWorker(worker));
    await Promise.allSettled(checks);
  }

  private async checkWorker(worker: InfraWorker): Promise<void> {
    try {
      const timeout = this.configService.get<number>('WORKER_HEALTH_CHECK_TIMEOUT', 5000);
      await axios.get(`${worker.endpoint}/health`, { timeout });
      await this.registry.updateWorkerHealth(worker.id, 'healthy');
      this.logger.debug(`Worker ${worker.id} is healthy`);
    } catch (error) {
      await this.registry.updateWorkerHealth(worker.id, 'unhealthy');
      this.logger.warn(`Worker ${worker.id} is unhealthy`, error);
    }
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}

