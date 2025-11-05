import { ResultAggregationService } from './result-aggregation.service';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkerAssignment } from '@domain/entities/worker-assignment.entity';
import { WorkflowType } from '@domain/types/workflow.types';
import { WorkerType } from '@domain/types/workflow.types';

describe('ResultAggregationService', () => {
  let service: ResultAggregationService;

  beforeEach(() => {
    service = new ResultAggregationService();
  });

  describe('aggregate', () => {
    it('should aggregate resume-build workflow results', () => {
      const request = new OrchestrationRequest(
        'req-1',
        'user-1',
        WorkflowType.RESUME_BUILD,
        {},
      );

      const resumeAssignment = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.RESUME,
        'req-1',
      );
      resumeAssignment.complete({ resume: 'resume data' });

      const assistantAssignment = new WorkerAssignment(
        'assign-2',
        'worker-2',
        WorkerType.ASSISTANT,
        'req-1',
      );
      assistantAssignment.complete({ tailored: 'tailored content' });

      const latexAssignment = new WorkerAssignment(
        'assign-3',
        'worker-3',
        WorkerType.LATEX,
        'req-1',
      );
      latexAssignment.complete({ pdfUrl: 'https://example.com/resume.pdf' });

      request.addWorkerAssignment(resumeAssignment);
      request.addWorkerAssignment(assistantAssignment);
      request.addWorkerAssignment(latexAssignment);

      const result = service.aggregate(request);

      expect(result.resume).toBeDefined();
      expect(result.tailored).toBeDefined();
      expect(result.pdf).toBeDefined();
      expect(result.pdfUrl).toBe('https://example.com/resume.pdf');
    });

    it('should aggregate expert-research workflow results', () => {
      const request = new OrchestrationRequest(
        'req-2',
        'user-1',
        WorkflowType.EXPERT_RESEARCH,
        {},
      );

      const agentToolAssignment = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.AGENT_TOOL,
        'req-2',
      );
      agentToolAssignment.complete({ sources: ['source1', 'source2'] });

      const dataProcessingAssignment = new WorkerAssignment(
        'assign-2',
        'worker-2',
        WorkerType.DATA_PROCESSING,
        'req-2',
      );
      dataProcessingAssignment.complete({ processed: 'processed data' });

      const assistantAssignment = new WorkerAssignment(
        'assign-3',
        'worker-3',
        WorkerType.ASSISTANT,
        'req-2',
      );
      assistantAssignment.complete({ synthesis: 'synthesized report' });

      request.addWorkerAssignment(agentToolAssignment);
      request.addWorkerAssignment(dataProcessingAssignment);
      request.addWorkerAssignment(assistantAssignment);

      const result = service.aggregate(request);

      expect(result.sources).toBeDefined();
      expect(result.processed).toBeDefined();
      expect(result.synthesis).toBeDefined();
      expect(result.report).toBeDefined();
    });

    it('should include errors in result when workers fail', () => {
      const request = new OrchestrationRequest(
        'req-3',
        'user-1',
        WorkflowType.RESUME_BUILD,
        {},
      );

      const assignment = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.RESUME,
        'req-3',
      );
      assignment.fail('Worker error');

      request.addWorkerAssignment(assignment);

      const result = service.aggregate(request);

      expect(result.resume).toBeDefined();
      expect(result.resume.error).toBe('Worker error');
      expect(result.errors).toBeUndefined(); // No errors array when only one fails
    });
  });
});
