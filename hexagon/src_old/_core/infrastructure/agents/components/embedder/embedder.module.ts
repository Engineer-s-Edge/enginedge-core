import { Module } from '@nestjs/common';
import { LLMModule } from '../llm';
import EmbeddingHandler from './embedder.service';
import { LLMService } from '../llm';
import { EmbedSize } from '../vectorstores/entities/store.entity';
import { CoreServicesModule } from '@core/services/core-services.module';
import { MyLogger } from '@core/services/logger/logger.service';

@Module({
  imports: [LLMModule.register(), CoreServicesModule],
  providers: [
    {
      provide: EmbeddingHandler,
      useFactory: (llmService: LLMService, logger: MyLogger) => {
        return new EmbeddingHandler(EmbedSize, llmService, logger);
      },
      inject: [LLMService, MyLogger],
    },
  ],
  exports: [EmbeddingHandler],
})
export default class EmbedderModule {}
