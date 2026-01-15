import { Test, TestingModule } from '@nestjs/testing';
import { CoordinateMultiWorkerUseCase } from './coordinate-multi-worker.use-case';
import { ResultAggregationService } from '../services/result-aggregation.service';
import { IRequestRepository } from '../ports/request-repository.port';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkerAssignment } from '@domain/entities/worker-assignment.entity';
import { WorkerType, WorkflowType } from '@domain/types/workflow.types';

describe('CoordinateMultiWorkerUseCase', () => {
  let useCase: CoordinateMultiWorkerUseCase;
  let mockRepo: Partial<IRequestRepository>;
  let mockAggregator: Partial<ResultAggregationService>;

  beforeEach(async () => {
    mockRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(true),
    };
    mockAggregator = {
      aggregate: jest.fn().mockReturnValue({ summary: 'done' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoordinateMultiWorkerUseCase,
        { provide: 'IRequestRepository', useValue: mockRepo },
        { provide: ResultAggregationService, useValue: mockAggregator },
      ],
    }).compile();

    useCase = module.get<CoordinateMultiWorkerUseCase>(
      CoordinateMultiWorkerUseCase,
    );
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should do nothing if request not found', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);
    await expect(useCase.execute('id')).rejects.toThrow('Request id not found');
  });

  it('should return early if not all workers complete', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    const assignment = new WorkerAssignment(
      'a1',
      'w1',
      WorkerType.RESUME,
      'req1',
    );
    // assignment status is PENDING by default
    req.addWorkerAssignment(assignment);
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1');

    expect(mockAggregator.aggregate).not.toHaveBeenCalled();
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('should aggregate and complete if all workers successfully finished', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    const assignment = new WorkerAssignment(
      'a1',
      'w1',
      WorkerType.RESUME,
      'req1',
    );
    assignment.complete({ ok: true });
    req.addWorkerAssignment(assignment);
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1');

    expect(mockAggregator.aggregate).toHaveBeenCalledWith(req);
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('req1', 'completed', {
      summary: 'done',
    });
  });

  it('should set status to failed if any worker failed', async () => {
    const req = new OrchestrationRequest('req1', 'u1', WorkflowType.CUSTOM, {});
    const a1 = new WorkerAssignment('a1', 'w1', WorkerType.RESUME, 'req1');
    a1.fail('error'); // Status failed
    const a2 = new WorkerAssignment('a2', 'w2', WorkerType.RESUME, 'req1');
    a2.complete({}); // Status completed

    req.addWorkerAssignment(a1);
    req.addWorkerAssignment(a2);
    (mockRepo.findById as jest.Mock).mockResolvedValue(req);

    await useCase.execute('req1');

    // It should still aggregate? The code says:
    // const aggregatedResult = this.resultAggregationService.aggregate(request);
    // AND THEN checks if failed.
    expect(mockAggregator.aggregate).toHaveBeenCalled();
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(
      'req1',
      'failed',
      null, // result is null on failure in the implementation?
      'One or more workers failed',
    );
  });
});
