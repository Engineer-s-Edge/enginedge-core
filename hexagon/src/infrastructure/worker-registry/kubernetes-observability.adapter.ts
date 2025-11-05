import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
// Metrics API may not be available in all Kubernetes client versions

type MetricsV1beta1Api = any;
import {
  IKubernetesObservabilityPort,
  PodStatus,
  PodEvent,
  PodMetrics,
  PodInfo,
  WorkerTypeHealth,
} from '@application/ports/kubernetes-observability.port';

@Injectable()
export class KubernetesObservabilityAdapter
  implements IKubernetesObservabilityPort
{
  private readonly logger = new Logger(KubernetesObservabilityAdapter.name);
  private k8sApi: CoreV1Api | null = null;
  private metricsApi: MetricsV1beta1Api | null = null;
  private readonly namespace: string;

  constructor(private readonly configService: ConfigService) {
    this.namespace = this.configService.get<string>(
      'KUBERNETES_NAMESPACE',
      'default',
    );

    const discoveryMode = this.configService.get<string>(
      'WORKER_DISCOVERY_MODE',
      'kubernetes',
    );
    if (discoveryMode === 'kubernetes') {
      try {
        const kc = new KubeConfig();
        kc.loadFromDefault();
        this.k8sApi = kc.makeApiClient(CoreV1Api);

        // Try to initialize metrics API (may not be available in all clusters or client versions)
        try {
          // Metrics API might not be exported - check if available
          const MetricsApi = (require('@kubernetes/client-node') as any)
            .MetricsV1beta1Api;
          if (MetricsApi) {
            this.metricsApi = kc.makeApiClient(MetricsApi);
          } else {
            this.logger.debug('Metrics API not available in client version');
            this.metricsApi = null;
          }
        } catch (error) {
          this.logger.debug(
            'Metrics API not available (metrics-server may not be installed or API not in client)',
          );
          this.metricsApi = null;
        }
      } catch (error) {
        this.logger.warn(
          'Kubernetes client not available for observability',
          error,
        );
        this.k8sApi = null;
      }
    }
  }

  async getPodLogs(
    podName: string,
    namespace?: string,
    container?: string,
    tailLines = 500,
  ): Promise<string> {
    if (!this.k8sApi) {
      throw new Error('Kubernetes API client not available');
    }

    const ns = namespace || this.namespace;
    try {
      const res = await this.k8sApi.readNamespacedPodLog({
        name: podName,
        namespace: ns,
        container,
        tailLines,
      } as any);

      // Some client versions return string directly, others in body
      const body: any = res as any;
      return typeof body === 'string' ? body : (body?.body ?? '');
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get logs for pod ${podName}: ${e.message}`,
        e.stack,
      );
      throw e;
    }
  }

  async getPodStatus(podName: string, namespace?: string): Promise<PodStatus> {
    if (!this.k8sApi) {
      throw new Error('Kubernetes API client not available');
    }

    const ns = namespace || this.namespace;
    try {
      const res = await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: ns,
      });

      const pod = res.body;
      const containerStatuses =
        pod.status?.containerStatuses?.map((cs) => ({
          name: cs.name,
          ready: cs.ready,
          restartCount: cs.restartCount,
          state: cs.state?.running
            ? 'running'
            : cs.state?.waiting
              ? 'waiting'
              : cs.state?.terminated
                ? 'terminated'
                : 'unknown',
        })) || [];

      // Determine if pod is ready (all containers ready)
      const ready =
        containerStatuses.length > 0 &&
        containerStatuses.every((cs) => cs.ready);

      return {
        name: pod.metadata?.name || podName,
        namespace: pod.metadata?.namespace || ns,
        phase: pod.status?.phase || 'Unknown',
        ready,
        conditions: pod.status?.conditions?.map((c) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
        })),
        containerStatuses,
        startTime: pod.status?.startTime
          ? new Date(pod.status.startTime)
          : undefined,
        nodeName: pod.spec?.nodeName,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get status for pod ${podName}: ${e.message}`,
        e.stack,
      );
      throw e;
    }
  }

  async getPodEvents(
    podName: string,
    namespace?: string,
    limit = 50,
  ): Promise<PodEvent[]> {
    if (!this.k8sApi) {
      throw new Error('Kubernetes API client not available');
    }

    const ns = namespace || this.namespace;
    try {
      const res = await this.k8sApi.listNamespacedEvent({
        namespace: ns,
        fieldSelector: `involvedObject.name=${podName}`,
        limit,
      } as any);

      const events = (res.body as any).items || [];
      return events
        .map((event: any) => ({
          type: event.type || 'Normal',
          reason: event.reason || '',
          message: event.message || '',
          firstTimestamp: event.firstTimestamp
            ? new Date(event.firstTimestamp)
            : undefined,
          lastTimestamp: event.lastTimestamp
            ? new Date(event.lastTimestamp)
            : undefined,
          count: event.count,
        }))
        .slice(0, limit);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get events for pod ${podName}: ${e.message}`,
        e.stack,
      );
      throw e;
    }
  }

  async getPodMetrics(
    podName: string,
    namespace?: string,
  ): Promise<PodMetrics | null> {
    if (!this.metricsApi) {
      this.logger.debug('Metrics API not available, returning null');
      return null;
    }

    const ns = namespace || this.namespace;
    try {
      const res = await this.metricsApi.readNamespacedPodMetrics({
        name: podName,
        namespace: ns,
      } as any);

      const metrics = res.body as any;
      const containers = metrics.containers || [];

      // Aggregate container metrics
      let totalCpuUsage = 0;
      let totalMemoryUsage = 0;

      for (const container of containers) {
        const cpu = container.usage?.cpu;
        const memory = container.usage?.memory;

        if (cpu) {
          // Parse CPU (e.g., "100m" = 0.1 cores)
          const cpuMatch = cpu.match(/(\d+)(m)?/);
          if (cpuMatch) {
            totalCpuUsage += parseInt(cpuMatch[1]) * (cpuMatch[2] ? 0.001 : 1);
          }
        }

        if (memory) {
          // Memory is already in bytes, convert to readable format later
          const memBytes = parseInt(memory) || 0;
          totalMemoryUsage += memBytes;
        }
      }

      return {
        name: metrics.metadata?.name || podName,
        namespace: metrics.metadata?.namespace || ns,
        cpu:
          containers.length > 0
            ? {
                usage: `${Math.round(totalCpuUsage * 1000)}m`,
              }
            : undefined,
        memory:
          containers.length > 0
            ? {
                usage: this.formatBytes(totalMemoryUsage),
              }
            : undefined,
        timestamp: metrics.timestamp ? new Date(metrics.timestamp) : new Date(),
      };
    } catch (error: unknown) {
      // Metrics API may not be available, return null instead of throwing
      this.logger.debug(
        `Metrics not available for pod ${podName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async getPodsByWorkerType(
    workerType: string,
    namespace?: string,
  ): Promise<PodInfo[]> {
    if (!this.k8sApi) {
      throw new Error('Kubernetes API client not available');
    }

    const ns = namespace || this.namespace;
    try {
      // List pods with label selector for worker type
      const res = await this.k8sApi.listNamespacedPod({
        namespace: ns,
        labelSelector: `app=${workerType}`,
      });

      const pods = res.body.items || [];
      return pods.map((pod) => {
        const containerStatuses = pod.status?.containerStatuses || [];
        const ready =
          containerStatuses.length > 0 &&
          containerStatuses.every((cs) => cs.ready);

        return {
          name: pod.metadata?.name || '',
          namespace: pod.metadata?.namespace || ns,
          workerType,
          phase: pod.status?.phase || 'Unknown',
          ready,
          nodeName: pod.spec?.nodeName,
          startTime: pod.status?.startTime
            ? new Date(pod.status.startTime)
            : undefined,
        };
      });
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get pods for worker type ${workerType}: ${e.message}`,
        e.stack,
      );
      throw e;
    }
  }

  async getWorkerTypeHealth(
    workerType: string,
    namespace?: string,
  ): Promise<WorkerTypeHealth> {
    const pods = await this.getPodsByWorkerType(workerType, namespace);

    const totalPods = pods.length;
    const readyPods = pods.filter((p) => p.ready).length;
    const healthyPods = pods.filter(
      (p) => p.phase === 'Running' && p.ready,
    ).length;
    const unhealthyPods = pods.filter(
      (p) => p.phase !== 'Running' || !p.ready,
    ).length;

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (totalPods === 0) {
      status = 'unhealthy';
    } else if (unhealthyPods === 0) {
      status = 'healthy';
    } else if (healthyPods > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      workerType,
      totalPods,
      readyPods,
      healthyPods,
      unhealthyPods,
      status,
      pods,
    };
  }

  /**
   * Format bytes to human-readable format (e.g., "512Mi", "1Gi")
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0';
    const k = 1024;
    const sizes = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${Math.round(value * 100) / 100}${sizes[i]}`;
  }
}
