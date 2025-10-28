import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import VectorStoreModule from '../../core/infrastructure/agents/components/vectorstores/vectorstore.module';
import { CoreServicesModule } from '../../core/services/core-services.module';

@Module({
  imports: [VectorStoreModule, CoreServicesModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
