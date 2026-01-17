import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IWorkflowRepository } from '../ports/workflow-repository.port';
import { Workflow } from '@domain/entities/workflow.entity';

@Injectable()
export class ManageWorkflowStateUseCase {
  private readonly logger = new Logger(ManageWorkflowStateUseCase.name);

  constructor(
    @Inject('IWorkflowRepository')
    private readonly workflowRepository: IWorkflowRepository,
  ) {}

  async createWorkflow(
    requestId: string,
    workflowType: string,
    steps: any[],
  ): Promise<Workflow> {
    const workflow = new Workflow(requestId, workflowType as any, steps);
    await this.workflowRepository.save(workflow);
    this.logger.log(`Workflow created for request ${requestId}`);
    return workflow;
  }

  async updateWorkflowState(
    workflowId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.updateState(key, value);
    await this.workflowRepository.updateState(workflowId, workflow.state);
    this.logger.debug(`Workflow ${workflowId} state updated: ${key}`);
  }

  async advanceWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.advanceStep();
    await this.workflowRepository.save(workflow);
    this.logger.debug(
      `Workflow ${workflowId} advanced to step ${workflow.currentStep}`,
    );
  }
}
