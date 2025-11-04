import { RequestStatus, WorkflowType } from '../types/workflow.types';
import { WorkerAssignment } from './worker-assignment.entity';

export class OrchestrationRequest {
  id: string;
  userId: string;
  workflow: WorkflowType;
  status: RequestStatus;
  data: Record<string, unknown>;
  workers: WorkerAssignment[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  correlationId?: string;
  idempotencyKey?: string;

  constructor(
    id: string,
    userId: string,
    workflow: WorkflowType,
    data: Record<string, unknown>
  ) {
    this.id = id;
    this.userId = userId;
    this.workflow = workflow;
    this.status = RequestStatus.PENDING;
    this.data = data;
    this.workers = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  updateStatus(status: RequestStatus | string, result?: unknown, error?: string): void {
    this.status = status as RequestStatus;
    this.updatedAt = new Date();
    if (result !== undefined) {
      this.result = result;
    }
    if (error) {
      this.error = error;
    }
    if (status === RequestStatus.COMPLETED || status === RequestStatus.FAILED || status === 'completed' || status === 'failed') {
      this.completedAt = new Date();
    }
  }

  addWorkerAssignment(assignment: WorkerAssignment): void {
    this.workers.push(assignment);
  }

  isComplete(): boolean {
    return (
      this.status === RequestStatus.COMPLETED ||
      this.status === RequestStatus.FAILED ||
      this.status === RequestStatus.CANCELLED
    );
  }

  allWorkersComplete(): boolean {
    if (this.workers.length === 0) return false;
    return this.workers.every(
      (w) => w.status === 'completed' || w.status === 'failed'
    );
  }
}

