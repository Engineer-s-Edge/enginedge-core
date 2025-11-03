import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollectiveDataModule } from './data.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { Collective, CollectiveSchema } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskSchema } from '../entities/collective-task.entity';
import { CollectiveMessage, CollectiveMessageSchema } from '../entities/collective-message.entity';
import { CollectiveConversation, CollectiveConversationSchema } from '../entities/collective-conversation.entity';
import { CollectiveEvent, CollectiveEventSchema } from '../entities/collective-event.entity';

// Communication Services
import { MessageQueueService } from '../communication/message-queue.service';
import { CommunicationService } from '../communication/communication.service';

/**
 * CollectiveCommunicationModule
 * 
 * Provides message queue system and inter-agent communication services.
 * Handles priority-based message routing, conversation management, and
 * message delivery between agents in the collective.
 */
@Module({
  imports: [
    CollectiveDataModule, // For message and event repositories
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
    MessageQueueService,
    CommunicationService,
  ],
  exports: [
    MessageQueueService,
    CommunicationService,
  ],
})
export class CollectiveCommunicationModule {}
