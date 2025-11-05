import { Injectable, Logger } from '@nestjs/common';
import { OrchestrateRequestUseCase } from '../use-cases/orchestrate-request.use-case';
import { ManageWorkflowStateUseCase } from '../use-cases/manage-workflow-state.use-case';
import { WorkflowType } from '@domain/types/workflow.types';
import { WorkflowDefinitionService } from '@domain/services/workflow-definition.service';

@Injectable()
export class WorkflowOrchestrationService {
  private readonly logger = new Logger(WorkflowOrchestrationService.name);

  constructor(
    private readonly orchestrateRequest: OrchestrateRequestUseCase,
    private readonly manageWorkflowState: ManageWorkflowStateUseCase,
    private readonly workflowDefinition: WorkflowDefinitionService,
  ) {}

  async orchestrateWorkflow(
    workflowType: WorkflowType,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const request = await this.orchestrateRequest.execute({
      userId,
      workflow: workflowType,
      data,
    });

    // Create workflow state
    const steps = this.workflowDefinition.getWorkflowSteps(workflowType);
    await this.manageWorkflowState.createWorkflow(
      request.id,
      workflowType,
      steps,
    );

    return request.id;
  }
}
