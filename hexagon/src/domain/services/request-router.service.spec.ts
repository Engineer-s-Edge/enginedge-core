import { RequestRouter } from './request-router.service';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType, WorkerType } from '../types/workflow.types';

describe('RequestRouter', () => {
  let router: RequestRouter;

  beforeEach(() => {
    router = new RequestRouter();
  });

  describe('route', () => {
    it('should route resume-build workflow to resume, assistant, and latex workers', () => {
      const request = new OrchestrationRequest('req-1', 'user-1', WorkflowType.RESUME_BUILD, {
        experiences: [],
        jobDescription: 'test',
      });

      const assignments = router.route(request);

      expect(assignments.length).toBe(3);
      expect(assignments[0].workerType).toBe(WorkerType.RESUME);
      expect(assignments[1].workerType).toBe(WorkerType.ASSISTANT);
      expect(assignments[2].workerType).toBe(WorkerType.LATEX);
    });

    it('should route expert-research workflow to agent-tool, data-processing, and assistant workers', () => {
      const request = new OrchestrationRequest('req-2', 'user-1', WorkflowType.EXPERT_RESEARCH, {
        query: 'test query',
      });

      const assignments = router.route(request);

      expect(assignments.length).toBe(3);
      expect(assignments[0].workerType).toBe(WorkerType.AGENT_TOOL);
      expect(assignments[1].workerType).toBe(WorkerType.DATA_PROCESSING);
      expect(assignments[2].workerType).toBe(WorkerType.ASSISTANT);
    });

    // --- Conversation Context ---
    it('should route conversation-context workflow to assistant', () => {
      const request = new OrchestrationRequest(
        'req-cc',
        'user-1',
        WorkflowType.CONVERSATION_CONTEXT,
        { history: [] }
      );
      const assignments = router.route(request);
      expect(assignments.length).toBe(1);
      expect(assignments[0].workerType).toBe(WorkerType.ASSISTANT);
    });

    // --- Single Worker Heuristics ---
    it('should route single-worker workflow to assistant when prompt is present', () => {
      const request = new OrchestrationRequest('req-3', 'user-1', WorkflowType.SINGLE_WORKER, {
        prompt: 'test prompt',
      });
      const assignments = router.route(request);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].workerType).toBe(WorkerType.ASSISTANT);
    });

    it('should route single-worker workflow to resume when resume/experiences present', () => {
      const request = new OrchestrationRequest(
        'req-sm-resume',
        'user-1',
        WorkflowType.SINGLE_WORKER,
        { experiences: [] }
      );
      const assignments = router.route(request);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].workerType).toBe(WorkerType.RESUME);
    });

    it('should route single-worker workflow to latex when tex present', () => {
      const request = new OrchestrationRequest(
        'req-sm-latex',
        'user-1',
        WorkflowType.SINGLE_WORKER,
        { latex: '\\begin...' }
      );
      const assignments = router.route(request);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].workerType).toBe(WorkerType.LATEX);
    });

    it('should route single-worker explicitly if workerType provided', () => {
      const request = new OrchestrationRequest(
        'req-explicit',
        'user-1',
        WorkflowType.SINGLE_WORKER,
        { workerType: 'interview' }
      );
      const assignments = router.route(request);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].workerType).toBe(WorkerType.INTERVIEW);
    });

    it('should return empty assigned for single worker if no match', () => {
      const request = new OrchestrationRequest('req-empty', 'user-1', WorkflowType.SINGLE_WORKER, {
        foo: 'bar',
      });
      const assignments = router.route(request);
      expect(assignments).toHaveLength(0);
    });

    // --- Custom Workflow ---
    it('should detect custom workflow steps correctly', () => {
      const request = new OrchestrationRequest('req-custom', 'user-1', WorkflowType.CUSTOM, {
        assistant: true,
        resume: true,
        latex: true,
        search: true, // triggers agent-tool
        upload: true, // triggers data-processing
      });
      const assignments = router.route(request);
      const types = assignments.map((a) => a.workerType);

      expect(types).toContain(WorkerType.ASSISTANT);
      expect(types).toContain(WorkerType.RESUME);
      expect(types).toContain(WorkerType.LATEX);
      expect(types).toContain(WorkerType.AGENT_TOOL);
      expect(types).toContain(WorkerType.DATA_PROCESSING);
    });

    // --- Utils / Mapping ---
    it('should fallback to ASSISTANT for unknown worker type strings in single worker map', () => {
      // We can force this by passing a workerType that isn't in the map
      const request = new OrchestrationRequest(
        'req-unknown',
        'user-1',
        WorkflowType.SINGLE_WORKER,
        { workerType: 'crazy-worker' }
      );
      const assignments = router.route(request);
      expect(assignments[0].workerType).toBe(WorkerType.ASSISTANT);
    });
  });
});
