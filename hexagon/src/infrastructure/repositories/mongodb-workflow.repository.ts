import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IWorkflowRepository } from '@application/ports/workflow-repository.port';
import { Workflow, WorkflowStep } from '@domain/entities/workflow.entity';

interface WorkflowDocument {
  id: string;
  type: string;
  steps: WorkflowStep[];
  currentStep: number;
  state: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MongoDbWorkflowRepository implements IWorkflowRepository {
  constructor(
    @InjectModel('Workflow')
    private readonly workflowModel: Model<WorkflowDocument>
  ) {}

  async save(workflow: Workflow): Promise<void> {
    const doc = {
      id: workflow.id,
      type: workflow.type,
      steps: workflow.steps,
      currentStep: workflow.currentStep,
      state: workflow.state,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };

    await this.workflowModel.findOneAndUpdate({ id: workflow.id }, doc, {
      upsert: true,
      new: true,
    });
  }

  async findById(id: string): Promise<Workflow | null> {
    const doc = await this.workflowModel.findOne({ id }).exec();
    if (!doc) return null;
    return this.mapToEntity(doc);
  }

  async findByRequestId(requestId: string): Promise<Workflow | null> {
    return this.findById(requestId); // Using requestId as workflow id
  }

  async updateState(id: string, state: Record<string, unknown>): Promise<void> {
    await this.workflowModel.findOneAndUpdate({ id }, { state, updatedAt: new Date() });
  }

  private mapToEntity(doc: WorkflowDocument): Workflow {
    const workflow = new Workflow(doc.id, doc.type as any, doc.steps);
    workflow.currentStep = doc.currentStep;
    workflow.state = doc.state;
    workflow.createdAt = doc.createdAt;
    workflow.updatedAt = doc.updatedAt;
    return workflow;
  }
}
