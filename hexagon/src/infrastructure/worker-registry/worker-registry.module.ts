import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KubernetesWorkerRegistryAdapter } from './kubernetes-worker-registry.adapter';
import { WorkerHealthMonitor } from './worker-health-monitor.service';
import { WorkerLoadBalancer } from './worker-load-balancer.service';
import { IWorkerRegistry } from '@application/ports/worker-registry.port';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IWorkerRegistry',
      useClass: KubernetesWorkerRegistryAdapter,
    },
    KubernetesWorkerRegistryAdapter,
    WorkerHealthMonitor,
    WorkerLoadBalancer,
  ],
  exports: ['IWorkerRegistry', KubernetesWorkerRegistryAdapter, WorkerHealthMonitor, WorkerLoadBalancer],
})
export class WorkerRegistryModule {}

