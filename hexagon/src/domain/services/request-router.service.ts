import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkerAssignment } from '../entities/worker-assignment.entity';
import { WorkflowType, WorkerType } from '../types/workflow.types';
import { v4 as uuidv4 } from 'uuid';

// Helper function to map worker type string to enum
function mapWorkerType(type: string): WorkerType {
  const mapping: Record<string, WorkerType> = {
    assistant: WorkerType.ASSISTANT,
    resume: WorkerType.RESUME,
    latex: WorkerType.LATEX,
    'agent-tool': WorkerType.AGENT_TOOL,
    'data-processing': WorkerType.DATA_PROCESSING,
    interview: WorkerType.INTERVIEW,
    scheduling: WorkerType.SCHEDULING,
    identity: WorkerType.IDENTITY,
    news: WorkerType.NEWS,
  };
  return mapping[type] || WorkerType.ASSISTANT;
}

export class RequestRouter {
  route(request: OrchestrationRequest): WorkerAssignment[] {
    const assignments: WorkerAssignment[] = [];

    switch (request.workflow) {
      case WorkflowType.RESUME_BUILD:
        // Resume → Assistant → LaTeX
        assignments.push(
          new WorkerAssignment(
            uuidv4(),
            'resume-1',
            WorkerType.RESUME,
            request.id,
          ),
          new WorkerAssignment(
            uuidv4(),
            'assistant-1',
            WorkerType.ASSISTANT,
            request.id,
          ),
          new WorkerAssignment(
            uuidv4(),
            'latex-1',
            WorkerType.LATEX,
            request.id,
          ),
        );
        break;

      case WorkflowType.EXPERT_RESEARCH:
        // Agent-tool → Data-processing → Assistant
        assignments.push(
          new WorkerAssignment(
            uuidv4(),
            'agent-tool-1',
            WorkerType.AGENT_TOOL,
            request.id,
          ),
          new WorkerAssignment(
            uuidv4(),
            'data-processing-1',
            WorkerType.DATA_PROCESSING,
            request.id,
          ),
          new WorkerAssignment(
            uuidv4(),
            'assistant-1',
            WorkerType.ASSISTANT,
            request.id,
          ),
        );
        break;

      case WorkflowType.CONVERSATION_CONTEXT:
        assignments.push(
          new WorkerAssignment(
            uuidv4(),
            'assistant-1',
            WorkerType.ASSISTANT,
            request.id,
          ),
        );
        break;

      case WorkflowType.SINGLE_WORKER:
        // Determine worker type from request data
        const workerType = this.detectSingleWorkerType(request.data);
        if (workerType) {
          assignments.push(
            new WorkerAssignment(
              uuidv4(),
              `${workerType}-1`,
              mapWorkerType(workerType),
              request.id,
            ),
          );
        }
        break;

      default:
        // Custom workflow - determine from request data
        const customWorkers = this.detectCustomWorkflow(request.data);
        customWorkers.forEach((workerTypeStr) => {
          assignments.push(
            new WorkerAssignment(
              uuidv4(),
              `${workerTypeStr}-1`,
              mapWorkerType(workerTypeStr),
              request.id,
            ),
          );
        });
    }

    return assignments;
  }

  private detectSingleWorkerType(data: Record<string, unknown>): string | null {
    if (data.workerType) {
      return data.workerType as string;
    }
    // Heuristic detection - return string, will be mapped
    if (data.prompt || data.message) {
      return 'assistant';
    }
    if (data.resume || data.experiences) {
      return 'resume';
    }
    if (data.latex || data.tex) {
      return 'latex';
    }
    return null;
  }

  private detectCustomWorkflow(data: Record<string, unknown>): string[] {
    const workers: string[] = [];
    if (data.assistant) workers.push('assistant');
    if (data.resume) workers.push('resume');
    if (data.latex) workers.push('latex');
    if (data.tools || data.search) workers.push('agent-tool');
    if (data.document || data.upload) workers.push('data-processing');
    return workers;
  }
}
