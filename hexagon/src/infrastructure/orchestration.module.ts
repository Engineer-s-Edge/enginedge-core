import { Module } from '@nestjs/common';
import { OrchestrationController } from './controllers/orchestration.controller';
import { HandleRequestUseCase } from '../application/use-cases/handle-request.use-case';
import { WorkerManagementService } from '../application/services/worker-management.service';
import { RequestRouter } from '../domain/services/request-router';
import { InMemoryWorkerRepository } from './adapters/in-memory-worker.repository';
import { ConsoleMessagePublisher } from './adapters/console-message.publisher';
import { InMemoryRequestRepository } from './adapters/in-memory-request.repository';
import { InMemoryResponseRepository } from './adapters/in-memory-response.repository';

@Module({
  controllers: [OrchestrationController],
  providers: [
    // Domain Services
    RequestRouter,

    // Application Services
    {
      provide: 'IHandleRequestUseCase',
      useClass: HandleRequestUseCase,
    },
    {
      provide: 'IWorkerManagementService',
      useClass: WorkerManagementService,
    },

    // Infrastructure Adapters
    {
      provide: 'IWorkerRepository',
      useClass: InMemoryWorkerRepository,
    },
    {
      provide: 'IMessagePublisher',
      useClass: ConsoleMessagePublisher,
    },
    {
      provide: 'IRequestRepository',
      useClass: InMemoryRequestRepository,
    },
    {
      provide: 'IResponseRepository',
      useClass: InMemoryResponseRepository,
    },

    // Use Case with dependencies
    {
      provide: HandleRequestUseCase,
      useFactory: (
        workerRepo: any,
        messagePub: any,
        requestRepo: any,
        responseRepo: any,
        router: RequestRouter,
      ) =>
        new HandleRequestUseCase(
          workerRepo,
          messagePub,
          requestRepo,
          responseRepo,
          router,
        ),
      inject: [
        'IWorkerRepository',
        'IMessagePublisher',
        'IRequestRepository',
        'IResponseRepository',
        RequestRouter,
      ],
    },

    // Worker Management Service
    {
      provide: WorkerManagementService,
      useFactory: (workerRepo: any) => new WorkerManagementService(workerRepo),
      inject: ['IWorkerRepository'],
    },
  ],
  exports: ['IHandleRequestUseCase', 'IWorkerManagementService'],
})
export class OrchestrationModule {}
