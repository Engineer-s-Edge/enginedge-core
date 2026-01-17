import { Test, TestingModule } from '@nestjs/testing';
import { HandleWorkerResponseUseCase } from './handle-worker-response.use-case';
import { CoordinateMultiWorkerUseCase } from './coordinate-multi-worker.use-case';
import { IRequestRepository } from '../ports/request-repository.port';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkerAssignment } from '@domain/entities/worker-assignment.entity';
import { WorkerType, WorkflowType } from '@domain/types/workflow.types';

describe('HandleWorkerResponseUseCase', () => {
  let useCase: HandleWorkerResponseUseCase;
  let mockRepo: Partial<IRequestRepository>;
  let mockCoordinator: Partial<CoordinateMultiWorkerUseCase>;

  beforeEach(async () => {
    mockRepo = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockCoordinator = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandleWorkerResponseUseCase,
        { provide: 'IRequestRepository', useValue: mockRepo },
        { provide: CoordinateMultiWorkerUseCase, useValue: mockCoordinator },
      ],
    }).compile();

    useCase = module.get<HandleWorkerResponseUseCase>(HandleWorkerResponseUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should successfully update assignment status on completion', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    const assignment = new WorkerAssignment('assign1', 'w1', WorkerType.RESUME, 'req1');
    req.addWorkerAssignment(assignment);
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1', 'assign1', { result: 'ok' });

    expect(assignment.status).toBe('completed');
    expect(assignment.response).toEqual({ result: 'ok' });
    expect(mockRepo.save).toHaveBeenCalledWith(req);
    expect(mockCoordinator.execute).toHaveBeenCalledWith('req1');
  });

  it('should update assignment with error on failure', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    const assignment = new WorkerAssignment('assign1', 'w1', WorkerType.RESUME, 'req1');
    req.addWorkerAssignment(assignment);
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1', 'assign1', null, 'Failed message');

    expect(assignment.status).toBe('failed');
    expect(assignment.error).toBe('Failed message');
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('should log warning and abort if request not found', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);
    await useCase.execute('req1', 'assign1', {});
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should log warning and abort if assignment not found', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1', 'assign1', {});
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
