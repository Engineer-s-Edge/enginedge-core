import { RequestRouter } from './request-router.service';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType } from '../types/workflow.types';

describe('RequestRouter', () => {
  let router: RequestRouter;

  beforeEach(() => {
    router = new RequestRouter();
  });

  describe('route', () => {
    it('should route resume-build workflow to resume, assistant, and latex workers', () => {
      const request = new OrchestrationRequest(
        'req-1',
        'user-1',
        WorkflowType.RESUME_BUILD,
        { experiences: [], jobDescription: 'test' },
      );

      const assignments = router.route(request);

      expect(assignments.length).toBe(3);
      expect(assignments[0].workerType).toBe('resume');
      expect(assignments[1].workerType).toBe('assistant');
      expect(assignments[2].workerType).toBe('latex');
    });

    it('should route expert-research workflow to agent-tool, data-processing, and assistant workers', () => {
      const request = new OrchestrationRequest(
        'req-2',
        'user-1',
        WorkflowType.EXPERT_RESEARCH,
        { query: 'test query' },
      );

      const assignments = router.route(request);

      expect(assignments.length).toBe(3);
      expect(assignments[0].workerType).toBe('agent-tool');
      expect(assignments[1].workerType).toBe('data-processing');
      expect(assignments[2].workerType).toBe('assistant');
    });

    it('should route single-worker workflow to assistant when prompt is present', () => {
      const request = new OrchestrationRequest(
        'req-3',
        'user-1',
        WorkflowType.SINGLE_WORKER,
        { prompt: 'test prompt' },
      );

      const assignments = router.route(request);

      expect(assignments.length).toBe(1);
      expect(assignments[0].workerType).toBe('assistant');
    });
  });
});
