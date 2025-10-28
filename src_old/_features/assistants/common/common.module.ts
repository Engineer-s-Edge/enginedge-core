import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Assistant, AssistantSchema } from './entities/assistant.entity';
import { AssistantsRepository } from './repositories/assistants.repository';
import { AgentConfigFactory } from './services/agent-config-factory.service';
import { AssistantsCrudService } from './services/assistants-crud.service';
import { AssistantExecutorService } from './services/assistant-executor.service';
import { ModelInformationService } from './services/model-information.service';
import { AgentModule } from '@core/infrastructure/agents/core/agents/agent.module';
import { LLMModule } from '@core/infrastructure/agents/components/llm/llm.module';
import { CoreServicesModule } from '@core/services/core-services.module';

/**
 * CommonModule - Shared infrastructure for all assistant types
 * 
 * This module provides:
 * - MongoDB entity and repository for assistants
 * - CRUD service for assistant management
 * - Agent configuration factory
 * - Assistant executor service
 * - Model information service
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assistant.name, schema: AssistantSchema },
    ]),
    AgentModule.forFeature(),
    LLMModule.register(),
    CoreServicesModule,
  ],
  providers: [
    AssistantsRepository,
    AgentConfigFactory,
    AssistantsCrudService,
    AssistantExecutorService,
    ModelInformationService,
  ],
  exports: [
    AssistantsRepository,
    AgentConfigFactory,
    AssistantsCrudService,
    AssistantExecutorService,
    ModelInformationService,
  ],
})
export class CommonModule {}
