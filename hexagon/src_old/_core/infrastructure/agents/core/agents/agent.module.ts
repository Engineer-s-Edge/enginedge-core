import { Module, DynamicModule } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ToolkitModule } from '../../tools/toolkit.module';
import { MemoryModule } from '../../components/memory/memory.module';
import { LLMModule } from '../../components/llm/llm.module';
import CheckpointModule from '../../components/vectorstores/checkpoint.module';
import VectorStoreModule from '../../components/vectorstores/vectorstore.module';
import { DocumentLoadersModule } from '../../components/loaders/loaders.module';

// Import the new modular services
import { AgentFactoryService } from './services/factory.service';
import { AgentValidationService } from './services/validation.service';
import { AgentConfigurationService } from './services/configuration.service';
import { AgentEventService } from './services/event.service';
import { AgentSessionService } from './services/session.service';
import { AgentExecutionService } from './services/execution.service';
import { CoreServicesModule } from '@core/services/core-services.module';

export interface AgentModuleOptions {
  toolkit?: {
    onUserApproval?: any;
  };
  llm?: {
    defaultProvider?: string;
    fallbackProviders?: string[];
    maxRetries?: number;
    debug?: boolean;
  };
}

@Module({})
export class AgentModule {
  static forRoot(options: AgentModuleOptions = {}): DynamicModule {
    return {
      module: AgentModule,
      imports: [
        // Core LLM infrastructure
        LLMModule.register(),

        // Toolkit for agent tools
        ToolkitModule.register({
          onUserApproval: options.toolkit?.onUserApproval || null,
        }),

        // Memory management
        MemoryModule,

        // Vector store and checkpointing
        VectorStoreModule,
        CheckpointModule,

        // Document loading capabilities
        DocumentLoadersModule,

        // Core services for logging
        CoreServicesModule,
      ],
      providers: [
        // Core agent service
        AgentService,

        // Modular services
        AgentFactoryService,
        AgentValidationService,
        AgentConfigurationService,
        AgentEventService,
        AgentSessionService,
        AgentExecutionService,
      ],
      exports: [
        // Main service
        AgentService,

        // Individual services for direct access
        AgentFactoryService,
        AgentValidationService,
        AgentConfigurationService,
        AgentEventService,
        AgentSessionService,
        AgentExecutionService,
        // Re-export key services for direct use
        LLMModule,
        ToolkitModule,
        MemoryModule,
        VectorStoreModule,
        CheckpointModule,
        DocumentLoadersModule,
      ],
    };
  } /**
   * For feature modules that need to use agents without configuring the infrastructure
   */
  static forFeature(): DynamicModule {
    return {
      module: AgentModule,
      imports: [
        // Core LLM infrastructure
        LLMModule.register(),

        // Toolkit for agent tools
        ToolkitModule.register({
          onUserApproval: null,
        }),

        // Memory management
        MemoryModule,

        // Vector store and checkpointing
        VectorStoreModule,
        CheckpointModule,

        // Document loading capabilities
        DocumentLoadersModule,

        // Core services for logging
        CoreServicesModule,
      ],
      providers: [
        AgentService,
        AgentFactoryService,
        AgentValidationService,
        AgentConfigurationService,
        AgentEventService,
        AgentSessionService,
        AgentExecutionService,
      ],
      exports: [
        AgentService,
        AgentFactoryService,
        AgentValidationService,
        AgentConfigurationService,
        AgentEventService,
        AgentSessionService,
        AgentExecutionService,
        // Export imported modules to make them available to consumers
        LLMModule,
        ToolkitModule,
        MemoryModule,
        VectorStoreModule,
        CheckpointModule,
        DocumentLoadersModule,
      ],
    };
  }
}
