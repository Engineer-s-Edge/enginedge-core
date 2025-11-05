import { Module } from '@nestjs/common';
import { OrchestrateRequestUseCase } from './use-cases/orchestrate-request.use-case';
import { CoordinateMultiWorkerUseCase } from './use-cases/coordinate-multi-worker.use-case';
import { ManageWorkflowStateUseCase } from './use-cases/manage-workflow-state.use-case';
import { HandleWorkerResponseUseCase } from './use-cases/handle-worker-response.use-case';
import { WorkflowOrchestrationService } from './services/workflow-orchestration.service';
import { WorkerManagementService } from './services/worker-management.service';
import { ResultAggregationService } from './services/result-aggregation.service';
import { PatternDetector } from '@domain/services/pattern-detector.service';
import { WorkflowValidator } from '@domain/services/workflow-validator.service';
import { RequestRouter } from '@domain/services/request-router.service';
import { WorkflowDefinitionService } from '@domain/services/workflow-definition.service';

@Module({
  providers: [
    // Application use cases
    OrchestrateRequestUseCase,
    CoordinateMultiWorkerUseCase,
    ManageWorkflowStateUseCase,
    HandleWorkerResponseUseCase,
    // Application services
    WorkflowOrchestrationService,
    WorkerManagementService,
    ResultAggregationService,
    // Domain services (framework-agnostic classes can be provided without decorators)
    RequestRouter,
    PatternDetector,
    WorkflowValidator,
    WorkflowDefinitionService,
  ],
  exports: [
    OrchestrateRequestUseCase,
    CoordinateMultiWorkerUseCase,
    ManageWorkflowStateUseCase,
    HandleWorkerResponseUseCase,
    WorkflowOrchestrationService,
    WorkerManagementService,
    ResultAggregationService,
    RequestRouter,
    PatternDetector,
    WorkflowValidator,
    WorkflowDefinitionService,
  ],
})
export class ApplicationModule {}
