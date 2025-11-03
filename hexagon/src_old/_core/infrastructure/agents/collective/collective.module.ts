import { Module, DynamicModule } from '@nestjs/common';
import { CollectiveDataModule } from './modules/data.module';
import { CollectiveCommunicationModule } from './modules/communication.module';
import { CollectiveMemoryModule } from './modules/memory.module';
import { CollectiveTaskModule } from './modules/task.module';
import { CollectiveErrorModule } from './modules/error.module';
import { CollectiveRuntimeModule } from './modules/runtime.module';

/**
 * CollectiveModule - Core Infrastructure for Multi-Agent Coordination
 * 
 * This module provides the foundational infrastructure for collective agent systems,
 * including task management, message queuing, artifact sharing, and coordination logic.
 * 
 * Organized into modular sub-components following the agent infrastructure pattern:
 * - CollectiveDataModule: MongoDB entities and repositories
 * - CollectiveCommunicationModule: Message queue and inter-agent communication
 * - CollectiveMemoryModule: Shared artifacts and project board
 * - CollectiveTaskModule: Task assignment and deadlock detection
 * - CollectiveErrorModule: Error handling and recovery
 * - CollectiveRuntimeModule: Agent orchestration and PM tools
 */
@Module({})
export class CollectiveModule {
  /**
   * For root-level application configuration with custom options
   */
  static forRoot(_options: Record<string, any> = {}): DynamicModule {
    return {
      module: CollectiveModule,
      imports: [
        CollectiveDataModule,
        CollectiveCommunicationModule,
        CollectiveMemoryModule,
        CollectiveTaskModule,
        CollectiveErrorModule,
        CollectiveRuntimeModule,
      ],
      exports: [
        CollectiveDataModule,
        CollectiveCommunicationModule,
        CollectiveMemoryModule,
        CollectiveTaskModule,
        CollectiveErrorModule,
        CollectiveRuntimeModule,
      ],
    };
  }

  /**
   * For feature modules that need collective infrastructure
   */
  static forFeature(): DynamicModule {
    return {
      module: CollectiveModule,
      imports: [
        CollectiveDataModule,
        CollectiveCommunicationModule,
        CollectiveMemoryModule,
        CollectiveTaskModule,
        CollectiveErrorModule,
        CollectiveRuntimeModule,
      ],
      exports: [
        CollectiveDataModule,
        CollectiveCommunicationModule,
        CollectiveMemoryModule,
        CollectiveTaskModule,
        CollectiveErrorModule,
        CollectiveRuntimeModule,
      ],
    };
  }
}
