import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { KubernetesObservabilityService } from '@application/services/kubernetes-observability.service';
import { ConfigService } from '@nestjs/config';

/**
 * Prometheus metrics service for Kubernetes observability
 * Tracks pod health, status, and worker type metrics
 */
@Injectable()
export class KubernetesObservabilityMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly registry: Registry;

  // Metrics for pod health
  private readonly podHealthStatus: Gauge<string>;
  private readonly podPhaseStatus: Gauge<string>;
  private readonly podReadyStatus: Gauge<string>;

  // Metrics for worker type aggregation
  private readonly workerTypeTotalPods: Gauge<string>;
  private readonly workerTypeReadyPods: Gauge<string>;
  private readonly workerTypeHealthyPods: Gauge<string>;
  private readonly workerTypeUnhealthyPods: Gauge<string>;
  private readonly workerTypeHealthStatus: Gauge<string>;

  // Metrics for observability operations
  private readonly observabilityOperationsTotal: Counter<string>;
  private readonly observabilityOperationsDuration: Histogram<string>;
  private readonly observabilityOperationsErrors: Counter<string>;

  // Worker types to monitor
  private readonly workerTypes = [
    'assistant-worker',
    'agent-tool-worker',
    'data-processing-worker',
    'resume-worker',
    'latex-worker',
    'interview-worker',
    'scheduling-worker',
    'identity-worker',
    'news-worker',
  ];

  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly observabilityService: KubernetesObservabilityService,
    private readonly configService: ConfigService,
    @Inject('PrometheusRegistry')
    registry: Registry
  ) {
    this.registry = registry;

    // Pod-level metrics
    this.podHealthStatus = new Gauge({
      name: 'kubernetes_pod_health_status',
      help: 'Pod health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['pod_name', 'namespace', 'worker_type'],
      registers: [this.registry],
    });

    this.podPhaseStatus = new Gauge({
      name: 'kubernetes_pod_phase',
      help: 'Pod phase status (1 = Running, 0 = other)',
      labelNames: ['pod_name', 'namespace', 'worker_type', 'phase'],
      registers: [this.registry],
    });

    this.podReadyStatus = new Gauge({
      name: 'kubernetes_pod_ready',
      help: 'Pod ready status (1 = ready, 0 = not ready)',
      labelNames: ['pod_name', 'namespace', 'worker_type'],
      registers: [this.registry],
    });

    // Worker type aggregated metrics
    this.workerTypeTotalPods = new Gauge({
      name: 'kubernetes_worker_type_pods_total',
      help: 'Total number of pods for a worker type',
      labelNames: ['worker_type', 'namespace'],
      registers: [this.registry],
    });

    this.workerTypeReadyPods = new Gauge({
      name: 'kubernetes_worker_type_pods_ready',
      help: 'Number of ready pods for a worker type',
      labelNames: ['worker_type', 'namespace'],
      registers: [this.registry],
    });

    this.workerTypeHealthyPods = new Gauge({
      name: 'kubernetes_worker_type_pods_healthy',
      help: 'Number of healthy pods for a worker type',
      labelNames: ['worker_type', 'namespace'],
      registers: [this.registry],
    });

    this.workerTypeUnhealthyPods = new Gauge({
      name: 'kubernetes_worker_type_pods_unhealthy',
      help: 'Number of unhealthy pods for a worker type',
      labelNames: ['worker_type', 'namespace'],
      registers: [this.registry],
    });

    this.workerTypeHealthStatus = new Gauge({
      name: 'kubernetes_worker_type_health_status',
      help: 'Worker type health status (1 = healthy, 0.5 = degraded, 0 = unhealthy)',
      labelNames: ['worker_type', 'namespace', 'status'],
      registers: [this.registry],
    });

    // Observability operation metrics
    this.observabilityOperationsTotal = new Counter({
      name: 'kubernetes_observability_operations_total',
      help: 'Total number of observability operations',
      labelNames: ['operation', 'worker_type', 'status'],
      registers: [this.registry],
    });

    this.observabilityOperationsDuration = new Histogram({
      name: 'kubernetes_observability_operations_duration_seconds',
      help: 'Duration of observability operations in seconds',
      labelNames: ['operation', 'worker_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.observabilityOperationsErrors = new Counter({
      name: 'kubernetes_observability_operations_errors_total',
      help: 'Total number of observability operation errors',
      labelNames: ['operation', 'worker_type'],
      registers: [this.registry],
    });
  }

  async onModuleInit() {
    // Start periodic metric updates
    const interval = this.configService.get<number>(
      'KUBERNETES_OBSERVABILITY_METRICS_INTERVAL',
      30000 // Default: 30 seconds
    );

    // Initial update
    await this.updateMetrics();

    // Schedule periodic updates
    this.updateInterval = setInterval(() => {
      this.updateMetrics().catch((error) => {
        console.error('Failed to update Kubernetes observability metrics:', error);
      });
    }, interval);
  }

  /**
   * Update all metrics by querying Kubernetes API
   */
  private async updateMetrics(): Promise<void> {
    const namespace = this.configService.get<string>('KUBERNETES_NAMESPACE', 'default');

    for (const workerType of this.workerTypes) {
      try {
        const health = await this.observabilityService.getWorkerTypeHealth(workerType, namespace);

        // Update worker type aggregated metrics
        this.workerTypeTotalPods.set({ worker_type: workerType, namespace }, health.totalPods);
        this.workerTypeReadyPods.set({ worker_type: workerType, namespace }, health.readyPods);
        this.workerTypeHealthyPods.set({ worker_type: workerType, namespace }, health.healthyPods);
        this.workerTypeUnhealthyPods.set(
          { worker_type: workerType, namespace },
          health.unhealthyPods
        );

        // Update worker type health status (1 = healthy, 0.5 = degraded, 0 = unhealthy)
        const statusValue =
          health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0;
        this.workerTypeHealthStatus.set(
          { worker_type: workerType, namespace, status: health.status },
          statusValue
        );

        // Update pod-level metrics
        for (const pod of health.pods) {
          const isHealthy = pod.phase === 'Running' && pod.ready ? 1 : 0;
          const isReady = pod.ready ? 1 : 0;

          this.podHealthStatus.set(
            {
              pod_name: pod.name,
              namespace: pod.namespace,
              worker_type: workerType,
            },
            isHealthy
          );

          this.podReadyStatus.set(
            {
              pod_name: pod.name,
              namespace: pod.namespace,
              worker_type: workerType,
            },
            isReady
          );

          // Set phase metric (1 for current phase, 0 for others)
          const phases = ['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown'];
          for (const phase of phases) {
            this.podPhaseStatus.set(
              {
                pod_name: pod.name,
                namespace: pod.namespace,
                worker_type: workerType,
                phase,
              },
              phase === pod.phase ? 1 : 0
            );
          }
        }
      } catch (error) {
        // Record error but don't fail the update
        this.observabilityOperationsErrors.inc({
          operation: 'getWorkerTypeHealth',
          worker_type: workerType,
        });
        console.error(`Failed to update metrics for ${workerType}:`, error);
      }
    }
  }

  /**
   * Record an observability operation
   */
  recordOperation(operation: string, workerType: string, duration: number, success: boolean): void {
    this.observabilityOperationsTotal.inc({
      operation,
      worker_type: workerType,
      status: success ? 'success' : 'error',
    });

    this.observabilityOperationsDuration.observe(
      { operation, worker_type: workerType },
      duration / 1000 // Convert to seconds
    );

    if (!success) {
      this.observabilityOperationsErrors.inc({
        operation,
        worker_type: workerType,
      });
    }
  }

  onModuleDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}
