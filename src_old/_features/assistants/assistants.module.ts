import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssistantsController } from './assistants.controller';
import { AssistantsService } from './assistants.service';
import { CoreServicesModule } from '@core/services/core-services.module';
import { CommonModule } from './common/common.module';
import { ReactModule } from './react/react.module';
import { GraphModule } from './graph/graph.module';
import { GeniusModule } from './genius/genius.module';
import { ExpertModule } from './expert/expert.module';
import { CollectiveFeatureModule } from './collective/collective.module';
import {
  Assistant,
  AssistantSchema,
} from './common/entities/assistant.entity';

/**
 * AssistantsModule - Main module for all assistant types
 * 
 * This module organizes assistants into specialized submodules:
 * - CommonModule: Shared infrastructure (entities, DTOs, CRUD, executor)
 * - ReactModule: ReAct (Reasoning + Acting) agents with block-based builder
 * - GraphModule: Graph-based workflow agents with DAG execution
 * - GeniusModule: Meta-learning orchestrator that commands Expert Agents
 * - ExpertModule: ICS Bear Hunter research agents (AIM/SHOOT/SKIN)
 * - CollectiveModule: Multi-agent coordination system with PM orchestration
 * 
 * The AssistantsService at this level provides a unified interface
 * to all assistant types and coordinates between submodules.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assistant.name, schema: AssistantSchema },
    ]),
    CoreServicesModule,
    CommonModule,
    ReactModule,
    GraphModule,
    GeniusModule,
    ExpertModule,
    CollectiveFeatureModule,
  ],
  controllers: [AssistantsController],
  providers: [AssistantsService],
  exports: [
    AssistantsService,
    CommonModule,
    ReactModule,
    GraphModule,
    GeniusModule,
    ExpertModule,
    CollectiveFeatureModule,
  ],
})
export class AssistantsModule {}
