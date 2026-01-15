import { WorkflowValidator } from './workflow-validator.service';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType } from '../types/workflow.types';

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;

  beforeEach(() => {
    validator = new WorkflowValidator();
  });

  it('should fail if workflow type is invalid', () => {
    const req = new OrchestrationRequest('1', 'u1', null as any, {});
    expect(validator.validate(req)).toEqual({
      valid: false,
      error: 'Invalid workflow type',
    });
  });

  it('should fail if user ID is missing', () => {
    const req = new OrchestrationRequest('1', '', WorkflowType.CUSTOM, {});
    expect(validator.validate(req)).toEqual({
      valid: false,
      error: 'User ID is required',
    });
  });

  it('should validate RESUME_BUILD logic', () => {
    const req = new OrchestrationRequest('1', 'u1', WorkflowType.RESUME_BUILD, {
      experiences: [],
    });
    expect(validator.validate(req)).toEqual({ valid: true });

    const badReq = new OrchestrationRequest(
      '1',
      'u1',
      WorkflowType.RESUME_BUILD,
      { other: 'data' },
    );
    expect(validator.validate(badReq).valid).toBe(false);
  });

  it('should validate EXPERT_RESEARCH logic', () => {
    const req = new OrchestrationRequest(
      '1',
      'u1',
      WorkflowType.EXPERT_RESEARCH,
      { query: 'q' },
    );
    expect(validator.validate(req)).toEqual({ valid: true });

    const badReq = new OrchestrationRequest(
      '1',
      'u1',
      WorkflowType.EXPERT_RESEARCH,
      {},
    );
    expect(validator.validate(badReq).valid).toBe(false);
  });

  it('should validate CONVERSATION_CONTEXT logic', () => {
    const req = new OrchestrationRequest(
      '1',
      'u1',
      WorkflowType.CONVERSATION_CONTEXT,
      { message: 'hi' },
    );
    expect(validator.validate(req)).toEqual({ valid: true });

    const badReq = new OrchestrationRequest(
      '1',
      'u1',
      WorkflowType.CONVERSATION_CONTEXT,
      {},
    );
    expect(validator.validate(badReq).valid).toBe(false);
  });
});
