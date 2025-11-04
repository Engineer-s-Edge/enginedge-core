import { Injectable, Logger } from '@nestjs/common';
import { OrchestrateRequestUseCase } from '../use-cases/orchestrate-request.use-case';
import { ManageWorkflowStateUseCase } from '../use-cases/manage-workflow-state.use-case';
import { WorkflowType } from '@domain/types/workflow.types';

@Injectable()
export class WorkflowOrchestrationService {
  private readonly logger = new Logger(WorkflowOrchestrationService.name);

  constructor(
    private readonly orchestrateRequest: OrchestrateRequestUseCase,
    private readonly manageWorkflowState: ManageWorkflowStateUseCase
  ) {}

  async orchestrateWorkflow(
    workflowType: WorkflowType,
    userId: string,
    data: Record<string, unknown>
  ): Promise<string> {
    const request = await this.orchestrateRequest.execute({
      userId,
      workflow: workflowType,
      data,
    });

    // Create workflow state
    const steps = this.getWorkflowSteps(workflowType);
    await this.manageWorkflowState.createWorkflow(request.id, workflowType, steps);

    return request.id;
  }

  private getWorkflowSteps(workflowType: WorkflowType): Array<{ stepNumber: number; workerType: string; dependsOn: number[]; parallel?: boolean }> {
    switch (workflowType) {
      case WorkflowType.RESUME_BUILD:
        return [
          { stepNumber: 1, workerType: 'resume', dependsOn: [] },
          { stepNumber: 2, workerType: 'assistant', dependsOn: [1] },
          { stepNumber: 3, workerType: 'latex', dependsOn: [2] },
        ];
      case WorkflowType.EXPERT_RESEARCH:
        return [
          { stepNumber: 1, workerType: 'agent-tool', dependsOn: [], parallel: true },
          { stepNumber: 2, workerType: 'data-processing', dependsOn: [1] },
          { stepNumber: 3, workerType: 'assistant', dependsOn: [2] },
        ];
      default:
        return [];
    }
  }
}

