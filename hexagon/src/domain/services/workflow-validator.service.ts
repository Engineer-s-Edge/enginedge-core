import { Injectable } from '@nestjs/common';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType } from '../types/workflow.types';

@Injectable()
export class WorkflowValidator {
  validate(request: OrchestrationRequest): { valid: boolean; error?: string } {
    // Validate workflow type
    if (
      !request.workflow ||
      !Object.values(WorkflowType).includes(request.workflow)
    ) {
      return { valid: false, error: 'Invalid workflow type' };
    }

    // Validate data presence
    if (!request.data || typeof request.data !== 'object') {
      return { valid: false, error: 'Request data is required' };
    }

    // Validate user ID
    if (!request.userId) {
      return { valid: false, error: 'User ID is required' };
    }

    // Workflow-specific validation
    switch (request.workflow) {
      case WorkflowType.RESUME_BUILD:
        return this.validateResumeBuild(request);
      case WorkflowType.EXPERT_RESEARCH:
        return this.validateExpertResearch(request);
      case WorkflowType.CONVERSATION_CONTEXT:
        return this.validateConversationContext(request);
      default:
        return { valid: true };
    }
  }

  private validateResumeBuild(request: OrchestrationRequest): {
    valid: boolean;
    error?: string;
  } {
    const { data } = request;
    if (!data.experiences && !data.resume) {
      return {
        valid: false,
        error: 'Resume build requires experiences or resume data',
      };
    }
    return { valid: true };
  }

  private validateExpertResearch(request: OrchestrationRequest): {
    valid: boolean;
    error?: string;
  } {
    const { data } = request;
    if (!data.query && !data.research && !data.topic) {
      return {
        valid: false,
        error: 'Expert research requires query, research, or topic',
      };
    }
    return { valid: true };
  }

  private validateConversationContext(request: OrchestrationRequest): {
    valid: boolean;
    error?: string;
  } {
    const { data } = request;
    if (!data.conversationId && !data.message) {
      return {
        valid: false,
        error: 'Conversation context requires conversationId or message',
      };
    }
    return { valid: true };
  }
}
