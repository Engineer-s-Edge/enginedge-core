import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KubernetesWorkerRegistryAdapter } from './kubernetes-worker-registry.adapter';
import { WorkerHealthMonitor } from './worker-health-monitor.service';
import { WorkerLoadBalancer } from './worker-load-balancer.service';
import { IWorkerRegistry } from '@application/ports/worker-registry.port';
import { KubernetesObservabilityAdapter } from './kubernetes-observability.adapter';
import { KubernetesObservabilityService } from '@application/services/kubernetes-observability.service';
import { KubernetesObservabilityController } from './kubernetes-observability.controller';
import { IKubernetesObservabilityPort } from '@application/ports/kubernetes-observability.port';
import { KubernetesObservabilityMetricsService } from './kubernetes-observability-metrics.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [ConfigModule, MetricsModule],
  controllers: [KubernetesObservabilityController],
  providers: [
    {
      provide: 'IWorkerRegistry',
      useClass: KubernetesWorkerRegistryAdapter,
    },
    {
      provide: 'IKubernetesObservabilityPort',
      useClass: KubernetesObservabilityAdapter,
    },
    KubernetesWorkerRegistryAdapter,
    KubernetesObservabilityAdapter,
    KubernetesObservabilityService,
    KubernetesObservabilityMetricsService,
    WorkerHealthMonitor,
    WorkerLoadBalancer,
  ],
  exports: [
    'IWorkerRegistry',
    'IKubernetesObservabilityPort',
    KubernetesWorkerRegistryAdapter,
    KubernetesObservabilityAdapter,
    KubernetesObservabilityService,
    KubernetesObservabilityMetricsService,
    WorkerHealthMonitor,
    WorkerLoadBalancer,
  ],
})
export class WorkerRegistryModule {}

