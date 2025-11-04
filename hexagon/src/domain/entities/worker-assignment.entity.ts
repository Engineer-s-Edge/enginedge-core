import { WorkerType, WorkerAssignmentStatus } from '../types/workflow.types';

export class WorkerAssignment {
  id: string;
  workerId: string;
  workerType: WorkerType;
  status: WorkerAssignmentStatus;
  requestId: string;
  response?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;

  constructor(
    id: string,
    workerId: string,
    workerType: WorkerType,
    requestId: string,
    maxRetries = 3
  ) {
    this.id = id;
    this.workerId = workerId;
    this.workerType = workerType;
    this.status = WorkerAssignmentStatus.PENDING;
    this.requestId = requestId;
    this.retryCount = 0;
    this.maxRetries = maxRetries;
  }

  start(): void {
    this.status = WorkerAssignmentStatus.PROCESSING;
    this.startedAt = new Date();
  }

  complete(response: unknown): void {
    this.status = WorkerAssignmentStatus.COMPLETED;
    this.response = response;
    this.completedAt = new Date();
  }

  fail(error: string): void {
    this.status = WorkerAssignmentStatus.FAILED;
    this.error = error;
    this.completedAt = new Date();
  }

  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  retry(): void {
    this.retryCount++;
    this.status = WorkerAssignmentStatus.PENDING;
    this.error = undefined;
    this.startedAt = undefined;
    this.completedAt = undefined;
  }
}

