/**
 * Collective Infrastructure - Barrel Export
 * 
 * Exports all modules for convenient importing
 */

export { CollectiveModule } from './collective.module';
export { CollectiveDataModule } from './modules/data.module';
export { CollectiveCommunicationModule } from './modules/communication.module';
export { CollectiveMemoryModule } from './modules/memory.module';
export { CollectiveTaskModule } from './modules/task.module';
export { CollectiveErrorModule } from './modules/error.module';
export { CollectiveRuntimeModule } from './modules/runtime.module';

// Export key services for direct use
export { CollectiveService } from './services/collective.service';
export { CollectiveRuntimeService } from './runtime/collective-runtime.service';
export { CommunicationService } from './communication/communication.service';
export { SharedMemoryService } from './shared-memory/shared-memory.service';
export { PMToolsService } from './services/pm-tools.service';

// Export entities and types
export * from './entities/collective.entity';
export * from './entities/collective-task.entity';
export * from './entities/collective-message.entity';
export * from './entities/collective-artifact.entity';
export * from './entities/collective-conversation.entity';
export * from './entities/collective-event.entity';
