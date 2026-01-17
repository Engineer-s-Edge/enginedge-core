import { WorkflowType } from '@domain/types/workflow.types';

export interface WorkflowStepDefinition {
  stepNumber: number;
  workerType: string;
  dependsOn: number[];
  parallel?: boolean;
}

export class WorkflowDefinitionService {
  getWorkflowSteps(workflowType: WorkflowType): WorkflowStepDefinition[] {
    switch (workflowType) {
      case WorkflowType.RESUME_BUILD:
        return [
          { stepNumber: 1, workerType: 'resume', dependsOn: [] },
          { stepNumber: 2, workerType: 'assistant', dependsOn: [1] },
          { stepNumber: 3, workerType: 'latex', dependsOn: [2] },
        ];
      case WorkflowType.EXPERT_RESEARCH:
        return [
          {
            stepNumber: 1,
            workerType: 'agent-tool',
            dependsOn: [],
            parallel: true,
          },
          { stepNumber: 2, workerType: 'data-processing', dependsOn: [1] },
          { stepNumber: 3, workerType: 'assistant', dependsOn: [2] },
        ];
      default:
        return [];
    }
  }
}
