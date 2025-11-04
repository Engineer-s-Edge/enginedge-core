import { WorkflowType } from '../types/workflow.types';

export interface WorkflowStep {
  stepNumber: number;
  workerType: string;
  dependsOn?: number[];
  parallel?: boolean;
  timeout?: number;
}

export class Workflow {
  id: string;
  type: WorkflowType;
  steps: WorkflowStep[];
  currentStep: number;
  state: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, type: WorkflowType, steps: WorkflowStep[]) {
    this.id = id;
    this.type = type;
    this.steps = steps;
    this.currentStep = 0;
    this.state = {};
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  nextStep(): WorkflowStep | null {
    if (this.currentStep >= this.steps.length) {
      return null;
    }
    return this.steps[this.currentStep];
  }

  advanceStep(): void {
    this.currentStep++;
    this.updatedAt = new Date();
  }

  updateState(key: string, value: unknown): void {
    this.state[key] = value;
    this.updatedAt = new Date();
  }

  isComplete(): boolean {
    return this.currentStep >= this.steps.length;
  }

  getReadySteps(): WorkflowStep[] {
    return this.steps.filter((step) => {
      if (!step.dependsOn || step.dependsOn.length === 0) {
        return step.stepNumber === this.currentStep + 1;
      }
      // Check if all dependencies are completed
      return step.dependsOn.every((dep) => dep < this.currentStep);
    });
  }
}

