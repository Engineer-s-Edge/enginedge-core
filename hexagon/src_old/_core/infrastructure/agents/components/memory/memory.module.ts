// src/memory/memory.module.ts
import { Module, Scope } from '@nestjs/common';
import VectorStoreModule from '../vectorstores/vectorstore.module';
import TextSplitterModule from '../textsplitters/textsplitter.module';
import AgentMemory from './memory.service';
import VectorStoreService from '../vectorstores/services/vectorstore.service';
import TextSplitterService from '../textsplitters/textsplitter.service';
import { LLMService, LLMModule } from '../llm';
import { CoreServicesModule } from '@core/services/core-services.module';
import { MyLogger } from '@core/services/logger/logger.service';

@Module({
  imports: [
    VectorStoreModule, // provides VectorStoreService
    TextSplitterModule, // provides TextSplitterService (request‐scoped)
    LLMModule.register(), // register LLMModule so you can inject LLM via @Inject(LLM)
    CoreServicesModule, // provides MyLogger and RequestContextService
  ],
  providers: [
    {
      provide: AgentMemory,
      useFactory: (
        vectorStoreService: VectorStoreService,
        textSplitterService: TextSplitterService,
        llmService: LLMService,
        logger: MyLogger,
      ) => {
        return new AgentMemory(
          5,
          vectorStoreService,
          textSplitterService,
          llmService,
          logger,
        );
      },
      inject: [VectorStoreService, TextSplitterService, LLMService, MyLogger],
      scope: Scope.TRANSIENT,
    },
  ],
  exports: [AgentMemory],
})
export class MemoryModule {}
