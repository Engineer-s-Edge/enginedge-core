import { Request, RequestType } from '../entities/request';
import { Worker, WorkerType } from '../entities/worker';

export class RequestRouter {
  route(request: Request, availableWorkers: Worker[]): Worker | null {
    const candidates = this.findCandidates(request, availableWorkers);

    if (candidates.length === 0) {
      return null;
    }

    // Simple routing strategy: pick the first available worker
    // In a real implementation, this could consider load balancing,
    // worker capabilities, priority, etc.
    return this.selectBestCandidate(candidates, request);
  }

  private findCandidates(request: Request, workers: Worker[]): Worker[] {
    return workers.filter(
      (worker) =>
        worker.isAvailable() &&
        worker.isHealthy() &&
        worker.canHandle(request.type),
    );
  }

  private selectBestCandidate(candidates: Worker[], request: Request): Worker {
    // For now, simple selection: prefer workers with lower load
    // This could be enhanced with more sophisticated algorithms
    return candidates[0];
  }

  getWorkerTypeForRequestType(requestType: RequestType): WorkerType {
    switch (requestType) {
      case RequestType.LLM_INFERENCE:
        return WorkerType.LLM;
      case RequestType.AGENT_TOOL_EXECUTION:
        return WorkerType.AGENT_TOOL;
      case RequestType.INTERVIEW_PROCESSING:
        return WorkerType.INTERVIEW;
      case RequestType.RESUME_ANALYSIS:
        return WorkerType.resume;
      case RequestType.LATEX_COMPILATION:
        return WorkerType.LATEX;
      case RequestType.DATA_PROCESSING:
        return WorkerType.DATA_PROCESSING;
      case RequestType.SCHEDULING:
        return WorkerType.SCHEDULING;
      default:
        throw new Error(`Unknown request type: ${requestType}`);
    }
  }
}
