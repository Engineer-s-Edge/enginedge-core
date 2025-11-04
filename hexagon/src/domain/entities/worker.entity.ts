import { WorkerType, WorkerStatus } from '../types/workflow.types';

export class Worker {
  id: string;
  type: WorkerType;
  endpoint: string;
  status: WorkerStatus;
  capabilities: string[];
  lastHealthCheck?: Date;
  metadata?: Record<string, unknown>;

  constructor(
    id: string,
    type: WorkerType,
    endpoint: string,
    capabilities: string[] = []
  ) {
    this.id = id;
    this.type = type;
    this.endpoint = endpoint;
    this.status = WorkerStatus.UNKNOWN;
    this.capabilities = capabilities;
  }

  updateHealth(status: WorkerStatus): void {
    this.status = status;
    this.lastHealthCheck = new Date();
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  isHealthy(): boolean {
    return this.status === WorkerStatus.HEALTHY;
  }
}

