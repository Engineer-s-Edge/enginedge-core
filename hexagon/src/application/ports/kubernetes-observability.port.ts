/**
 * Port interface for Kubernetes observability operations (read-only)
 * Following hexagonal architecture - this defines the contract for infrastructure adapters
 */
export interface IKubernetesObservabilityPort {
  /**
   * Get logs from a pod
   * @param podName Name of the pod
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @param container Container name (optional, for multi-container pods)
   * @param tailLines Number of lines to retrieve (default: 500)
   * @returns Pod logs as string
   */
  getPodLogs(
    podName: string,
    namespace?: string,
    container?: string,
    tailLines?: number,
  ): Promise<string>;

  /**
   * Get pod status and health information
   * @param podName Name of the pod
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @returns Pod status information
   */
  getPodStatus(
    podName: string,
    namespace?: string,
  ): Promise<PodStatus>;

  /**
   * Get recent events for a pod
   * @param podName Name of the pod
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @param limit Maximum number of events to retrieve (default: 50)
   * @returns Array of pod events
   */
  getPodEvents(
    podName: string,
    namespace?: string,
    limit?: number,
  ): Promise<PodEvent[]>;

  /**
   * Get resource metrics for a pod (CPU, memory usage)
   * @param podName Name of the pod
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @returns Pod metrics
   */
  getPodMetrics(
    podName: string,
    namespace?: string,
  ): Promise<PodMetrics | null>;

  /**
   * Get all pods for a worker type
   * @param workerType Type of worker (e.g., 'assistant-worker')
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @returns Array of pod information
   */
  getPodsByWorkerType(
    workerType: string,
    namespace?: string,
  ): Promise<PodInfo[]>;

  /**
   * Get aggregated health status for all pods of a worker type
   * @param workerType Type of worker
   * @param namespace Kubernetes namespace (optional, defaults to configured namespace)
   * @returns Aggregated health status
   */
  getWorkerTypeHealth(
    workerType: string,
    namespace?: string,
  ): Promise<WorkerTypeHealth>;
}

/**
 * Pod status information
 */
export interface PodStatus {
  name: string;
  namespace: string;
  phase: string; // Running, Pending, Succeeded, Failed, Unknown
  ready: boolean;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  containerStatuses?: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    state?: string;
  }>;
  startTime?: Date;
  nodeName?: string;
}

/**
 * Pod event information
 */
export interface PodEvent {
  type: string; // Normal, Warning
  reason: string;
  message: string;
  firstTimestamp?: Date;
  lastTimestamp?: Date;
  count?: number;
}

/**
 * Pod metrics (CPU, memory)
 */
export interface PodMetrics {
  name: string;
  namespace: string;
  cpu?: {
    usage: string; // e.g., "100m"
    limit?: string;
    request?: string;
  };
  memory?: {
    usage: string; // e.g., "512Mi"
    limit?: string;
    request?: string;
  };
  timestamp: Date;
}

/**
 * Basic pod information
 */
export interface PodInfo {
  name: string;
  namespace: string;
  workerType: string;
  phase: string;
  ready: boolean;
  nodeName?: string;
  startTime?: Date;
}

/**
 * Aggregated health status for a worker type
 */
export interface WorkerTypeHealth {
  workerType: string;
  totalPods: number;
  readyPods: number;
  healthyPods: number;
  unhealthyPods: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  pods: PodInfo[];
}

