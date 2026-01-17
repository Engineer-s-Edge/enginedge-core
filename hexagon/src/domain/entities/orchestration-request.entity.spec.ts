import { OrchestrationRequest } from './orchestration-request.entity';
import { WorkerAssignment } from './worker-assignment.entity';
import { RequestStatus, WorkflowType } from '../types/workflow.types';
import { WorkerType } from '../types/workflow.types';

describe('OrchestrationRequest', () => {
  let request: OrchestrationRequest;

  beforeEach(() => {
    request = new OrchestrationRequest('req-1', 'user-1', WorkflowType.RESUME_BUILD, {
      test: 'data',
    });
  });

  describe('updateStatus', () => {
    it('should update status and set completedAt when completed', () => {
      request.updateStatus(RequestStatus.COMPLETED, { result: 'test' });

      expect(request.status).toBe(RequestStatus.COMPLETED);
      expect(request.result).toEqual({ result: 'test' });
      expect(request.completedAt).toBeDefined();
    });

    it('should update status and set error when failed', () => {
      request.updateStatus(RequestStatus.FAILED, undefined, 'test error');

      expect(request.status).toBe(RequestStatus.FAILED);
      expect(request.error).toBe('test error');
      expect(request.completedAt).toBeDefined();
    });
  });

  describe('addWorkerAssignment', () => {
    it('should add worker assignment to workers array', () => {
      const assignment = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.ASSISTANT,
        'req-1'
      );

      request.addWorkerAssignment(assignment);

      expect(request.workers.length).toBe(1);
      expect(request.workers[0]).toBe(assignment);
    });
  });

  describe('isComplete', () => {
    it('should return true when status is completed', () => {
      request.updateStatus(RequestStatus.COMPLETED);
      expect(request.isComplete()).toBe(true);
    });

    it('should return true when status is failed', () => {
      request.updateStatus(RequestStatus.FAILED, undefined, 'error');
      expect(request.isComplete()).toBe(true);
    });

    it('should return false when status is pending', () => {
      expect(request.isComplete()).toBe(false);
    });
  });

  describe('allWorkersComplete', () => {
    it('should return true when all workers are completed', () => {
      const assignment1 = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.ASSISTANT,
        'req-1'
      );
      const assignment2 = new WorkerAssignment('assign-2', 'worker-2', WorkerType.RESUME, 'req-1');

      assignment1.complete({ result: 'test1' });
      assignment2.complete({ result: 'test2' });

      request.addWorkerAssignment(assignment1);
      request.addWorkerAssignment(assignment2);

      expect(request.allWorkersComplete()).toBe(true);
    });

    it('should return false when any worker is pending', () => {
      const assignment1 = new WorkerAssignment(
        'assign-1',
        'worker-1',
        WorkerType.ASSISTANT,
        'req-1'
      );
      const assignment2 = new WorkerAssignment('assign-2', 'worker-2', WorkerType.RESUME, 'req-1');

      assignment1.complete({ result: 'test1' });
      // assignment2 is still pending

      request.addWorkerAssignment(assignment1);
      request.addWorkerAssignment(assignment2);

      expect(request.allWorkersComplete()).toBe(false);
    });
  });
});
