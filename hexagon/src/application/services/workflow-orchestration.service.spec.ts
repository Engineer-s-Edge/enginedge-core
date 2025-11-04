import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowOrchestrationService } from './workflow-orchestration.service';
import { OrchestrateRequestUseCase } from '../use-cases/orchestrate-request.use-case';
import { ManageWorkflowStateUseCase } from '../use-cases/manage-workflow-state.use-case';
import { WorkflowType } from '@domain/types/workflow.types';

describe('WorkflowOrchestrationService', () => {
  let service: WorkflowOrchestrationService;
  let orchestrateUseCase: jest.Mocked<OrchestrateRequestUseCase>;
  let manageWorkflowState: jest.Mocked<ManageWorkflowStateUseCase>;

  beforeEach(async () => {
    orchestrateUseCase = {
      execute: jest.fn(),
    } as any;

    manageWorkflowState = {
      createWorkflow: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowOrchestrationService,
        {
          provide: OrchestrateRequestUseCase,
          useValue: orchestrateUseCase,
        },
        {
          provide: ManageWorkflowStateUseCase,
          useValue: manageWorkflowState,
        },
      ],
    }).compile();

    service = module.get<WorkflowOrchestrationService>(WorkflowOrchestrationService);
  });

  describe('orchestrateWorkflow', () => {
    it('should orchestrate resume-build workflow', async () => {
      const mockRequest = {
        id: 'req-1',
        workflow: WorkflowType.RESUME_BUILD,
        userId: 'user-1',
        data: {},
      } as any;

      orchestrateUseCase.execute.mockResolvedValue(mockRequest);
      manageWorkflowState.createWorkflow.mockResolvedValue({} as any);

      const requestId = await service.orchestrateWorkflow(
        WorkflowType.RESUME_BUILD,
        'user-1',
        { test: 'data' }
      );

      expect(requestId).toBe('req-1');
      expect(orchestrateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          workflow: WorkflowType.RESUME_BUILD,
          data: { test: 'data' },
        })
      );
      expect(manageWorkflowState.createWorkflow).toHaveBeenCalledWith(
        'req-1',
        WorkflowType.RESUME_BUILD,
        expect.arrayContaining([
          expect.objectContaining({ workerType: 'resume' }),
          expect.objectContaining({ workerType: 'assistant' }),
          expect.objectContaining({ workerType: 'latex' }),
        ])
      );
    });
  });
});

