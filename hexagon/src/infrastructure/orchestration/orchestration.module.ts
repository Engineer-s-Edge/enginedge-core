import { Module } from '@nestjs/common';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { OrchestrateRequestUseCase } from '@application/use-cases/orchestrate-request.use-case';
import { CoordinateMultiWorkerUseCase } from '@application/use-cases/coordinate-multi-worker.use-case';
import { ManageWorkflowStateUseCase } from '@application/use-cases/manage-workflow-state.use-case';
import { HandleWorkerResponseUseCase } from '@application/use-cases/handle-worker-response.use-case';
import { WorkflowOrchestrationService } from '@application/services/workflow-orchestration.service';
import { WorkerManagementService } from '@application/services/worker-management.service';
import { ResultAggregationService } from '@application/services/result-aggregation.service';
import { RequestRouter } from '@domain/services/request-router.service';
import { PatternDetector } from '@domain/services/pattern-detector.service';
import { WorkflowValidator } from '@domain/services/workflow-validator.service';
import { KafkaModule } from '../kafka/kafka.module';
import { DatabaseModule } from '../database/database.module';
import { WorkerRegistryModule } from '../worker-registry/worker-registry.module';

@Module({
  imports: [KafkaModule, DatabaseModule, WorkerRegistryModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
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
  ],
})
export class OrchestrationModule {}

