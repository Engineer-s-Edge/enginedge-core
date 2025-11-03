import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollectiveDataModule } from './data.module';
import { CollectiveCommunicationModule } from './communication.module';
import { CollectiveMemoryModule } from './memory.module';
import { CollectiveTaskModule } from './task.module';
import { CollectiveErrorModule } from './error.module';
import { AgentModule } from '../../core/agents/agent.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { Collective, CollectiveSchema } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskSchema } from '../entities/collective-task.entity';
import { CollectiveMessage, CollectiveMessageSchema } from '../entities/collective-message.entity';
import { CollectiveConversation, CollectiveConversationSchema } from '../entities/collective-conversation.entity';
import { CollectiveEvent, CollectiveEventSchema } from '../entities/collective-event.entity';

// Runtime Services
import { CollectiveRuntimeService } from '../runtime/collective-runtime.service';
import { AgentExecutor } from '../runtime/agent-executor.service';
import { PMToolsService } from '../services/pm-tools.service';
import { CollectiveService } from '../services/collective.service';

/**
 * CollectiveRuntimeModule
 * 
 * Provides high-level orchestration, PM tools, and agent execution.
 * This is the top-level coordination layer that ties together all
 * collective infrastructure components and manages agent lifecycle.
 */
@Module({
  imports: [
    CollectiveDataModule,
    CollectiveCommunicationModule,
    CollectiveMemoryModule,
    CollectiveTaskModule,
    CollectiveErrorModule,
    AgentModule.forFeature(), // Agent infrastructure for executing individual agents
    CoreServicesModule, // For logging
    MongooseModule.forFeature([
      { name: Collective.name, schema: CollectiveSchema },
      { name: CollectiveTask.name, schema: CollectiveTaskSchema },
      { name: CollectiveMessage.name, schema: CollectiveMessageSchema },
      { name: CollectiveConversation.name, schema: CollectiveConversationSchema },
      { name: CollectiveEvent.name, schema: CollectiveEventSchema },
    ]),
  ],
  providers: [
    CollectiveRuntimeService,
    AgentExecutor,
    PMToolsService,
    CollectiveService,
  ],
  exports: [
    CollectiveRuntimeService,
    AgentExecutor,
    PMToolsService,
    CollectiveService,
  ],
})
export class CollectiveRuntimeModule {}
