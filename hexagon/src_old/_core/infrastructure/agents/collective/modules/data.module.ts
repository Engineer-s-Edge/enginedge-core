import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Entities
import { Collective, CollectiveSchema } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskSchema } from '../entities/collective-task.entity';
import { CollectiveMessage, CollectiveMessageSchema } from '../entities/collective-message.entity';
import { CollectiveArtifact, CollectiveArtifactSchema } from '../entities/collective-artifact.entity';
import { CollectiveConversation, CollectiveConversationSchema } from '../entities/collective-conversation.entity';
import { CollectiveEvent, CollectiveEventSchema } from '../entities/collective-event.entity';

// Repositories
import { CollectivesRepository } from '../repositories/collectives.repository';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { CollectiveArtifactsRepository } from '../repositories/collective-artifacts.repository';
import { CollectiveConversationsRepository } from '../repositories/collective-conversations.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';

/**
 * CollectiveDataModule
 * 
 * Provides MongoDB entities (schemas) and repositories for collective data access.
 * This is the data layer for the collective infrastructure.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Collective.name, schema: CollectiveSchema },
      { name: CollectiveTask.name, schema: CollectiveTaskSchema },
      { name: CollectiveMessage.name, schema: CollectiveMessageSchema },
      { name: CollectiveArtifact.name, schema: CollectiveArtifactSchema },
      { name: CollectiveConversation.name, schema: CollectiveConversationSchema },
      { name: CollectiveEvent.name, schema: CollectiveEventSchema },
    ]),
  ],
  providers: [
    CollectivesRepository,
    CollectiveTasksRepository,
    CollectiveMessagesRepository,
    CollectiveArtifactsRepository,
    CollectiveConversationsRepository,
    CollectiveEventsRepository,
  ],
  exports: [
    CollectivesRepository,
    CollectiveTasksRepository,
    CollectiveMessagesRepository,
    CollectiveArtifactsRepository,
    CollectiveConversationsRepository,
    CollectiveEventsRepository,
  ],
})
export class CollectiveDataModule {}
