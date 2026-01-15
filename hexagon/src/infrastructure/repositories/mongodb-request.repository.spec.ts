import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoDbRequestRepository } from './mongodb-request.repository';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkflowType } from '@domain/types/workflow.types';

describe('MongoDbRequestRepository', () => {
  let repository: MongoDbRequestRepository;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoDbRequestRepository,
        {
          provide: getModelToken('OrchestrationRequest'),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<MongoDbRequestRepository>(MongoDbRequestRepository);
  });

  describe('save', () => {
    it('should save request to database', async () => {
      const request = new OrchestrationRequest(
        'req-1',
        'user-1',
        WorkflowType.RESUME_BUILD,
        { test: 'data' },
      );

      mockModel.findOneAndUpdate.mockResolvedValue({});

      await repository.save(request);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 'req-1' },
        expect.objectContaining({
          id: 'req-1',
          userId: 'user-1',
          workflow: WorkflowType.RESUME_BUILD,
        }),
        { upsert: true, new: true },
      );
    });
  });

  describe('findById', () => {
    it('should find request by id', async () => {
      const mockDoc = {
        id: 'req-1',
        userId: 'user-1',
        workflow: WorkflowType.RESUME_BUILD,
        status: 'pending',
        data: { test: 'data' },
        workers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const result = await repository.findById('req-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('req-1');
      expect(mockModel.findOne).toHaveBeenCalledWith({ id: 'req-1' });
    });

    it('should return null when request not found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findById('req-999');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update request status', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue({});

      await repository.updateStatus('req-1', 'completed', { result: 'test' });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 'req-1' },
        expect.objectContaining({
          status: 'completed',
          result: { result: 'test' },
          completedAt: expect.any(Date),
        }),
      );
    });
  });
});
