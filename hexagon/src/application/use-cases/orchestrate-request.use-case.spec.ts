import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrateRequestUseCase } from './orchestrate-request.use-case';
import { RequestRouter } from '@domain/services/request-router.service';
import { PatternDetector } from '@domain/services/pattern-detector.service';
import { WorkflowValidator } from '@domain/services/workflow-validator.service';
import { IRequestRepository } from '../ports/request-repository.port';
import { IKafkaProducer } from '../ports/kafka-producer.port';
import { WorkflowType, WorkerType } from '@domain/types/workflow.types';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkerAssignment } from '@domain/entities/worker-assignment.entity';

describe('OrchestrateRequestUseCase', () => {
  let useCase: OrchestrateRequestUseCase;
  let mockRouter: Partial<RequestRouter>;
  let mockPatternDetector: Partial<PatternDetector>;
  let mockValidator: Partial<WorkflowValidator>;
  let mockRepo: Partial<IRequestRepository>;
  let mockProducer: Partial<IKafkaProducer>;

  beforeEach(async () => {
    mockRouter = {
      route: jest.fn().mockReturnValue([]),
    };
    mockPatternDetector = {
      detectPattern: jest.fn().mockReturnValue(WorkflowType.CUSTOM),
    };
    mockValidator = {
      validate: jest.fn().mockReturnValue({ valid: true }),
    };
    mockRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(true),
    };
    mockProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrateRequestUseCase,
        { provide: RequestRouter, useValue: mockRouter },
        { provide: PatternDetector, useValue: mockPatternDetector },
        { provide: WorkflowValidator, useValue: mockValidator },
        { provide: 'IRequestRepository', useValue: mockRepo },
        { provide: 'IKafkaProducer', useValue: mockProducer },
      ],
    }).compile();

    useCase = module.get<OrchestrateRequestUseCase>(OrchestrateRequestUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should execute successfully with explicitly provided workflow', async () => {
    const input = {
      userId: 'user1',
      workflow: WorkflowType.RESUME_BUILD,
      data: { resume: 'base64...' },
    };

    const assignment = new WorkerAssignment('1', 'worker-1', WorkerType.RESUME, 'req-id');
    (mockRouter.route as jest.Mock).mockReturnValue([assignment]);

    const result = await useCase.execute(input);

    expect(result).toBeInstanceOf(OrchestrationRequest);
    expect(result.workflow).toBe(WorkflowType.RESUME_BUILD);
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      'processing',
      undefined,
      undefined
    );
    expect(mockProducer.publish).toHaveBeenCalled();
  });

  it('should detect workflow if not provided', async () => {
    const input = {
      userId: 'user1',
      data: { query: 'hello' },
    };

    await useCase.execute(input);

    expect(mockPatternDetector.detectPattern).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('should throw error if validation fails', async () => {
    (mockValidator.validate as jest.Mock).mockReturnValue({
      valid: false,
      error: 'Invalid',
    });
    const input = { userId: 'u', data: {} };

    await expect(useCase.execute(input)).rejects.toThrow('Invalid');
  });

  it('should produce messages to correct topics based on assignments', async () => {
    const input = {
      userId: 'u',
      workflow: WorkflowType.EXPERT_RESEARCH,
      data: { q: 'hi' },
    };
    const assignment = new WorkerAssignment('1', 'worker-assist', WorkerType.ASSISTANT, 'req-id');
    (mockRouter.route as jest.Mock).mockReturnValue([assignment]);

    await useCase.execute(input);

    expect(mockProducer.publish).toHaveBeenCalledWith(
      'job.requests.assistant', // Topic
      expect.objectContaining({
        // Message
        assignmentId: '1',
        data: { q: 'hi' },
      })
    );
  });
});
