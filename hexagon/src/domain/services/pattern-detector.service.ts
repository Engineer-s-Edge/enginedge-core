import { Injectable } from '@nestjs/common';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType } from '../types/workflow.types';

@Injectable()
export class PatternDetector {
  detectPattern(request: OrchestrationRequest): WorkflowType {
    // If workflow is explicitly specified, use it
    if (request.workflow) {
      return request.workflow;
    }

    // Detect from request data
    const data = request.data;

    // Resume build pattern
    if (
      (data.experiences || data.resume) &&
      (data.jobDescription || data.tailoring) &&
      (data.format === 'pdf' || data.compile)
    ) {
      return WorkflowType.RESUME_BUILD;
    }

    // Expert research pattern
    if (
      (data.research || data.sources) &&
      (data.synthesis || data.analysis) &&
      (data.sources || data.tools)
    ) {
      return WorkflowType.EXPERT_RESEARCH;
    }

    // Conversation context pattern
    if (data.conversationId || data.context || data.history) {
      return WorkflowType.CONVERSATION_CONTEXT;
    }

    // Single worker pattern
    if (data.workerType || this.isSingleWorkerRequest(data)) {
      return WorkflowType.SINGLE_WORKER;
    }

    // Default to custom
    return WorkflowType.CUSTOM;
  }

  private isSingleWorkerRequest(data: Record<string, unknown>): boolean {
    // Check if request targets a single specific worker
    const workerIndicators = [
      'prompt',
      'message',
      'resume',
      'latex',
      'document',
      'interview',
      'schedule',
    ];
    return workerIndicators.some((indicator) => data[indicator]);
  }
}
