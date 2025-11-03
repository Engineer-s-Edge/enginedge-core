export class Worker {
  constructor(
    public readonly id: string,
    public readonly type: WorkerType,
    public readonly name: string,
    public readonly status: WorkerStatus,
    public readonly capabilities: WorkerCapability[],
    public readonly lastHeartbeat: Date,
    public readonly config: WorkerConfig,
  ) {}

  static create(
    type: WorkerType,
    name: string,
    capabilities: WorkerCapability[],
    config: WorkerConfig,
  ): Worker {
    return new Worker(
      crypto.randomUUID(),
      type,
      name,
      WorkerStatus.IDLE,
      capabilities,
      new Date(),
      config,
    );
  }

  isAvailable(): boolean {
    return (
      this.status === WorkerStatus.IDLE ||
      this.status === WorkerStatus.AVAILABLE
    );
  }

  isHealthy(heartbeatTimeoutMs: number = 30000): boolean {
    return Date.now() - this.lastHeartbeat.getTime() < heartbeatTimeoutMs;
  }

  updateStatus(status: WorkerStatus): Worker {
    return new Worker(
      this.id,
      this.type,
      this.name,
      status,
      this.capabilities,
      this.lastHeartbeat,
      this.config,
    );
  }

  updateHeartbeat(): Worker {
    return new Worker(
      this.id,
      this.type,
      this.name,
      this.status,
      this.capabilities,
      new Date(),
      this.config,
    );
  }

  canHandle(requestType: string): boolean {
    return this.capabilities.some((cap) =>
      cap.requestTypes.includes(requestType),
    );
  }
}

export enum WorkerType {
  LLM = 'llm',
  AGENT_TOOL = 'agent_tool',
  INTERVIEW = 'interview',
  resume = 'resume',
  LATEX = 'latex',
  DATA_PROCESSING = 'data_processing',
  SCHEDULING = 'scheduling',
}

export enum WorkerStatus {
  IDLE = 'idle',
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ERROR = 'error',
}

export interface WorkerCapability {
  name: string;
  requestTypes: string[];
  maxConcurrency: number;
  supportedFormats?: string[];
}

export interface WorkerConfig {
  host: string;
  port: number;
  protocol: 'http' | 'grpc' | 'kafka';
  timeoutMs: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  exponential: boolean;
}
