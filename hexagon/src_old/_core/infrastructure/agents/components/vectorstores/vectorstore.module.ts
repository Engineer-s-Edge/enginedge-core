import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VectorStoreRepository } from './repos/store.repository';
import { ConversationRepository } from './repos/conversation.repository';
import VectorStoreService from './services/vectorstore.service';
import VectorStoreModel from './entities/store.entity';
import ConversationModel from './entities/conversation.entity';
import TextSplitterModule from '../textsplitters/textsplitter.module';
import { LLMModule } from '../llm/llm.module';
import EmbedderModule from '../embedder/embedder.module';
import { CoreServicesModule } from '@core/services/core-services.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'vector_store', schema: VectorStoreModel.schema },
      { name: 'conversation', schema: ConversationModel.schema },
    ]),
    // register LLMModule so you can inject LLM via @Inject(LLM)
    LLMModule.register(),
    TextSplitterModule,
    EmbedderModule,
    CoreServicesModule,
  ],
  providers: [
    VectorStoreRepository,
    ConversationRepository,
    VectorStoreService,
  ],
  exports: [VectorStoreRepository, ConversationRepository, VectorStoreService],
})
export default class VectorStoreModule {}
