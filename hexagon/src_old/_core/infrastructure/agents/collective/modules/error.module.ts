import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollectiveDataModule } from './data.module';
import { CollectiveCommunicationModule } from './communication.module';
import { CollectiveTaskModule } from './task.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { CollectiveTask, CollectiveTaskSchema } from '../entities/collective-task.entity';
import { Collective, CollectiveSchema } from '../entities/collective.entity';
import { CollectiveEvent, CollectiveEventSchema } from '../entities/collective-event.entity';
import { CollectiveMessage, CollectiveMessageSchema } from '../entities/collective-message.entity';
import { CollectiveArtifact, CollectiveArtifactSchema } from '../entities/collective-artifact.entity';
import { CollectiveConversation, CollectiveConversationSchema } from '../entities/collective-conversation.entity';

// Error Handling Services
import { DeadlockResolverService } from '../error-handling/deadlock-resolver.service';
import { ErrorHandlerService } from '../error-handling/error-handler.service';
import { RetryStrategyService } from '../error-handling/retry-strategy.service';
import { HumanEscalationService } from '../error-handling/human-escalation.service';

/**
 * CollectiveErrorModule
 * 
 * Provides error handling, recovery strategies, and human escalation.
 * Handles task failures, deadlock resolution, retry logic, and
 * escalation to human oversight when needed.
 */
@Module({
  imports: [
    CollectiveDataModule, // For accessing task/message/event data
    CollectiveCommunicationModule, // For sending escalation messages
    CollectiveTaskModule, // For deadlock detection service
    forwardRef(() => require('./runtime.module').CollectiveRuntimeModule), // For PM tools (circular dependency)
    CoreServicesModule, // For logging
    MongooseModule.forFeature([
      { name: CollectiveTask.name, schema: CollectiveTaskSchema },
      { name: Collective.name, schema: CollectiveSchema },
      { name: CollectiveEvent.name, schema: CollectiveEventSchema },
      { name: CollectiveMessage.name, schema: CollectiveMessageSchema },
      { name: CollectiveArtifact.name, schema: CollectiveArtifactSchema },
      { name: CollectiveConversation.name, schema: CollectiveConversationSchema },
    ]),
  ],
  providers: [
    DeadlockResolverService,
    ErrorHandlerService,
    RetryStrategyService,
    HumanEscalationService,
  ],
  exports: [
    DeadlockResolverService,
    ErrorHandlerService,
    RetryStrategyService,
    HumanEscalationService,
  ],
})
export class CollectiveErrorModule {}
