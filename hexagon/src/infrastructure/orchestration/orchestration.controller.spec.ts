import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrateRequestUseCase } from '@application/use-cases/orchestrate-request.use-case';
import { IRequestRepository } from '@application/ports/request-repository.port';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkflowType } from '@domain/types/workflow.types';
import { JwtService } from '../auth/jwt.service';

describe('OrchestrationController', () => {
  let controller: OrchestrationController;
  let orchestrateUseCase: jest.Mocked<OrchestrateRequestUseCase>;
  let requestRepository: jest.Mocked<IRequestRepository>;

  beforeEach(async () => {
    orchestrateUseCase = {
      execute: jest.fn(),
    } as any;

    requestRepository = {
      findById: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestrationController],
      providers: [
        {
          provide: OrchestrateRequestUseCase,
          useValue: orchestrateUseCase,
        },
        {
          provide: 'IRequestRepository',
          useValue: requestRepository,
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrchestrationController>(OrchestrationController);
  });

  describe('orchestrate', () => {
    it('should create orchestration request', async () => {
      const mockRequest = new OrchestrationRequest('req-1', 'user-1', WorkflowType.RESUME_BUILD, {
        test: 'data',
      });
      mockRequest.correlationId = 'corr-1';

      orchestrateUseCase.execute.mockResolvedValue(mockRequest);

      const req = {
        user: { sub: 'user-1' },
        headers: {},
      } as any;

      const result = await controller.orchestrate(
        {
          workflow: 'resume-build',
          data: { test: 'data' },
        },
        req
      );

      expect(result).toHaveProperty('requestId', 'req-1');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('statusUrl');
      expect(orchestrateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          workflow: 'resume-build',
          data: { test: 'data' },
        })
      );
    });
  });

  describe('getStatus', () => {
    it('should return request status', async () => {
      const mockRequest = new OrchestrationRequest('req-1', 'user-1', WorkflowType.RESUME_BUILD, {
        test: 'data',
      });

      requestRepository.findById.mockResolvedValue(mockRequest);

      const result = await controller.getStatus('req-1');

      expect(result).toHaveProperty('requestId', 'req-1');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('workflow');
      expect(requestRepository.findById).toHaveBeenCalledWith('req-1');
    });

    it('should throw error when request not found', async () => {
      requestRepository.findById.mockResolvedValue(null);

      await expect(controller.getStatus('req-999')).rejects.toThrow();
    });
  });
});
