import { Module } from '@nestjs/common';
import { CheckpointService } from './services/checkpoint.service';
import { ConversationRepository } from './repos/conversation.repository';
import { MongooseModule } from '@nestjs/mongoose';
import ConversationModel from './entities/conversation.entity';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'conversation', schema: ConversationModel.schema },
    ]),
    CoreServicesModule,
  ],
  providers: [CheckpointService, ConversationRepository],
  exports: [CheckpointService],
})
export default class CheckpointModule {}
