/**
 * Worker Task: Represents a unit of work to execute in a worker thread.
 */
export interface WorkerTask<TInput = unknown, _TOutput = unknown> {
  id: string;
  agentId: string; // AgentId (branded string type)
  type: 'execution' | 'validation' | 'streaming';
  input: TInput;
  priority: 'low' | 'normal' | 'high';
  timeout: number; // milliseconds
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Worker Task Result: Output from a worker thread task.
 */
export interface WorkerTaskResult<TOutput = unknown> {
  taskId: string;
  success: boolean;
  output?: TOutput;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  executionTime: number; // milliseconds
  completedAt: Date;
  workerThreadId: number;
}

/**
 * Worker Health Status: Metrics about worker thread health.
 */
export interface WorkerHealthStatus {
  threadId: number;
  isHealthy: boolean;
  tasksCompleted: number;
  tasksFailures: number;
  averageExecutionTime: number;
  lastTaskTime: Date;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
  };
}

/**
 * Pool Status: Metrics about the worker thread pool.
 */
export interface PoolStatus {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  uptime: number; // milliseconds
  workers: WorkerHealthStatus[];
  averageQueueWaitTime: number; // milliseconds
}

/**
 * IWorkerThreadPool: Port for worker thread management.
 *
 * Manages a pool of OS threads for CPU-intensive operations.
 * Supports task queuing, load balancing, and graceful shutdown.
 *
 * Design patterns:
 * - Thread Pool: Pre-allocated threads reduce creation overhead
 * - Task Queue: PQueue-based prioritized task distribution
 * - Load Balancer: Round-robin with awareness of worker load
 * - Circuit Breaker: Mark unhealthy workers for recovery
 * - Vertical Scaling: Pool size = OS.cpus().length for optimal utilization
 */
export interface IWorkerThreadPool {
  /**
   * Initialize the worker pool.
   * @param workerCount Number of threads (default: OS.cpus().length)
   * @returns Promise<void>
   * @throws WorkerPoolException if initialization fails
   */
  initialize(workerCount?: number): Promise<void>;

  /**
   * Submit a task to the worker pool.
   * @param task The WorkerTask to execute
   * @returns Promise that resolves with WorkerTaskResult
   * @throws WorkerPoolExhaustedException if no workers available
   * @throws WorkerThreadException if execution fails
   */
  execute<TInput, TOutput>(
    task: WorkerTask<TInput, TOutput>,
  ): Promise<WorkerTaskResult<TOutput>>;

  /**
   * Submit multiple tasks (batch execution).
   * @param tasks Array of WorkerTasks
   * @returns Promise that resolves with array of WorkerTaskResults
   * @throws WorkerPoolExhaustedException if insufficient workers
   * @throws WorkerThreadException if any task fails
   */
  executeBatch<TInput, TOutput>(
    tasks: WorkerTask<TInput, TOutput>[],
  ): Promise<WorkerTaskResult<TOutput>[]>;

  /**
   * Get current pool status/metrics.
   * @returns PoolStatus with worker health and queue state
   */
  getStatus(): PoolStatus;

  /**
   * Get health status of specific worker thread.
   * @param threadId OS thread ID
   * @returns WorkerHealthStatus or null if thread not found
   */
  getWorkerStatus(threadId: number): WorkerHealthStatus | null;

  /**
   * Check if pool is accepting tasks.
   * @returns boolean - true if pool can accept new tasks
   */
  isHealthy(): boolean;

  /**
   * Gracefully shutdown the worker pool.
   * Waits for pending tasks to complete.
   * @param timeoutMs Timeout for shutdown (default: 30000)
   * @returns Promise<void>
   * @throws WorkerThreadException if shutdown timeout exceeded
   */
  shutdown(timeoutMs?: number): Promise<void>;

  /**
   * Force immediate shutdown (kills threads).
   * @returns Promise<void>
   */
  forceShutdown(): Promise<void>;

  /**
   * Drain the task queue (wait for all pending tasks).
   * @returns Promise<void>
   */
  drain(): Promise<void>;

  /**
   * Get number of tasks waiting in queue.
   * @returns number
   */
  getQueueSize(): number;

  /**
   * Get average task execution time.
   * @returns number in milliseconds
   */
  getAverageExecutionTime(): number;

  /**
   * Reset pool statistics (for testing).
   * @returns void
   */
  resetStatistics(): void;
}

export const IWorkerThreadPool = Symbol('IWorkerThreadPool');
