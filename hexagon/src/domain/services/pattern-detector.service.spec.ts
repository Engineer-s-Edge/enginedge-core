import { PatternDetector } from './pattern-detector.service';
import { OrchestrationRequest } from '../entities/orchestration-request.entity';
import { WorkflowType } from '../types/workflow.types';

describe('PatternDetector', () => {
  let detector: PatternDetector;

  beforeEach(() => {
    detector = new PatternDetector();
  });

  it('should return existing workflow if set', () => {
    const req = new OrchestrationRequest('1', 'u1', WorkflowType.RESUME_BUILD, {});
    expect(detector.detectPattern(req)).toBe(WorkflowType.RESUME_BUILD);
  });

  it('should detect RESUME_BUILD pattern', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      resume: 'some-data',
      tailoring: true,
      compile: true,
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.RESUME_BUILD);
  });

  it('should detect EXPERT_RESEARCH pattern', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      research: true,
      analysis: true,
      tools: ['search'],
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.EXPERT_RESEARCH);
  });

  it('should detect CONVERSATION_CONTEXT pattern', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      history: [],
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.CONVERSATION_CONTEXT);
  });

  it('should detect SINGLE_WORKER pattern by explicit workerType', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      workerType: 'assistant',
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.SINGLE_WORKER);
  });

  it('should detect SINGLE_WORKER pattern by indicators', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      prompt: 'hello',
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.SINGLE_WORKER);
  });

  it('should default to CUSTOM key', () => {
    const req = new OrchestrationRequest('1', 'u1', undefined as any, {
      unknown: 'data',
    });
    expect(detector.detectPattern(req)).toBe(WorkflowType.CUSTOM);
  });
});
