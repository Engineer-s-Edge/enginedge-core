import { Injectable } from '@nestjs/common';
import {
  KubernetesWorkerRegistryAdapter,
  InfraWorker,
} from './kubernetes-worker-registry.adapter';

@Injectable()
export class WorkerLoadBalancer {
  constructor(private readonly registry: KubernetesWorkerRegistryAdapter) {}

  async selectWorker(type: string): Promise<InfraWorker | null> {
    // Access internal workers map for load balancing
    const workers = (this.registry as any).workers.get(type) || [];
    const healthyWorkers = workers.filter(
      (w: InfraWorker) => w.status === 'healthy',
    );

    if (healthyWorkers.length === 0) {
      // Fallback to any worker if no healthy ones
      return workers[0] || null;
    }

    // Simple round-robin (could be enhanced with actual load metrics)
    const randomIndex = Math.floor(Math.random() * healthyWorkers.length);
    return healthyWorkers[randomIndex];
  }
}
