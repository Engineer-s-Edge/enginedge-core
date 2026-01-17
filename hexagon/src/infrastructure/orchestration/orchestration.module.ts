import { Module } from '@nestjs/common';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { ApplicationModule } from '@application/application.module';
import { KafkaModule } from '../kafka/kafka.module';
import { DatabaseModule } from '../database/database.module';
import { WorkerRegistryModule } from '../worker-registry/worker-registry.module';

@Module({
  imports: [ApplicationModule, KafkaModule, DatabaseModule, WorkerRegistryModule],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
})
export class OrchestrationModule {}
