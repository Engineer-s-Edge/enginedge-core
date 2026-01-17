import { Workflow } from '@domain/entities/workflow.entity';

export interface IWorkflowRepository {
  save(workflow: Workflow): Promise<void>;
  findById(id: string): Promise<Workflow | null>;
  findByRequestId(requestId: string): Promise<Workflow | null>;
  updateState(id: string, state: Record<string, unknown>): Promise<void>;
}
