import { Injectable, Inject } from '@nestjs/common';
import {
  IKubernetesObservabilityPort,
  PodStatus,
  PodEvent,
  PodMetrics,
  PodInfo,
  WorkerTypeHealth,
} from '@application/ports/kubernetes-observability.port';

/**
 * Application service for Kubernetes observability (read-only operations)
 * Provides a clean interface for retrieving logs, status, events, and metrics
 */
@Injectable()
export class KubernetesObservabilityService {
  constructor(
    @Inject('IKubernetesObservabilityPort')
    private readonly observabilityPort: IKubernetesObservabilityPort,
  ) {}

  /**
   * Get logs from a pod
   */
  async getPodLogs(
    podName: string,
    namespace?: string,
    container?: string,
    tailLines?: number,
  ): Promise<string> {
    return this.observabilityPort.getPodLogs(
      podName,
      namespace,
      container,
      tailLines,
    );
  }

  /**
   * Get pod status and health information
   */
  async getPodStatus(podName: string, namespace?: string): Promise<PodStatus> {
    return this.observabilityPort.getPodStatus(podName, namespace);
  }

  /**
   * Get recent events for a pod
   */
  async getPodEvents(
    podName: string,
    namespace?: string,
    limit?: number,
  ): Promise<PodEvent[]> {
    return this.observabilityPort.getPodEvents(podName, namespace, limit);
  }

  /**
   * Get resource metrics for a pod
   */
  async getPodMetrics(
    podName: string,
    namespace?: string,
  ): Promise<PodMetrics | null> {
    return this.observabilityPort.getPodMetrics(podName, namespace);
  }

  /**
   * Get all pods for a worker type
   */
  async getPodsByWorkerType(
    workerType: string,
    namespace?: string,
  ): Promise<PodInfo[]> {
    return this.observabilityPort.getPodsByWorkerType(workerType, namespace);
  }

  /**
   * Get aggregated health status for all pods of a worker type
   */
  async getWorkerTypeHealth(
    workerType: string,
    namespace?: string,
  ): Promise<WorkerTypeHealth> {
    return this.observabilityPort.getWorkerTypeHealth(workerType, namespace);
  }
}
