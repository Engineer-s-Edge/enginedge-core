import { Injectable } from '@nestjs/common';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';

@Injectable()
export class ResultAggregationService {
  aggregate(request: OrchestrationRequest): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    // Collect all worker responses
    for (const assignment of request.workers) {
      if (assignment.status === 'completed' && assignment.response) {
        results[assignment.workerType] = assignment.response;
      } else if (assignment.status === 'failed' && assignment.error) {
        errors.push(`${assignment.workerType}: ${assignment.error}`);
        results[assignment.workerType] = { error: assignment.error };
      }
    }

    // Aggregate based on workflow type
    switch (request.workflow) {
      case 'resume-build':
        return this.aggregateResumeBuild(results);
      case 'expert-research':
        return this.aggregateExpertResearch(results);
      default:
        return { results, errors: errors.length > 0 ? errors : undefined };
    }
  }

  private aggregateResumeBuild(results: Record<string, unknown>): Record<string, unknown> {
    const resume = results['resume'] || {};
    const assistant = results['assistant'] || {};
    const latex = results['latex'] || {};

    return {
      resume: resume,
      tailored: assistant,
      pdf: latex,
      pdfUrl: (latex as any)?.pdfUrl || (latex as any)?.url,
    };
  }

  private aggregateExpertResearch(results: Record<string, unknown>): Record<string, unknown> {
    const agentTool = results['agent-tool'] || {};
    const dataProcessing = results['data-processing'] || {};
    const assistant = results['assistant'] || {};

    return {
      sources: agentTool,
      processed: dataProcessing,
      synthesis: assistant,
      report: assistant,
    };
  }
}

