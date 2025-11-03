// src/llm.module.ts
import { Module, Global, DynamicModule } from '@nestjs/common';
import LLMService from './llm.service';
import { CoreServicesModule } from '@core/services/core-services.module';

@Global()
@Module({})
export class LLMModule {
  static register(): DynamicModule {
    return {
      module: LLMModule,
      imports: [CoreServicesModule],
      providers: [LLMService],
      exports: [LLMService],
    };
  }
}
