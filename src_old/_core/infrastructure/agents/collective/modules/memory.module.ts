import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollectiveDataModule } from './data.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { CollectiveArtifact, CollectiveArtifactSchema } from '../entities/collective-artifact.entity';
import { CollectiveTask, CollectiveTaskSchema } from '../entities/collective-task.entity';
import { CollectiveConversation, CollectiveConversationSchema } from '../entities/collective-conversation.entity';

// Shared Memory Services
import { ArtifactLockingService } from '../shared-memory/artifact-locking.service';
import { ArtifactVersioningService } from '../shared-memory/artifact-versioning.service';
import { ArtifactSearchService } from '../shared-memory/artifact-search.service';
import { SharedMemoryService } from '../shared-memory/shared-memory.service';

/**
 * CollectiveMemoryModule
 * 
 * Provides shared artifact management (project board/knowledge base).
 * Handles artifact versioning, locking, search, and collaborative editing.
 */
@Module({
  imports: [
    CollectiveDataModule, // For artifact repositories
    CoreServicesModule, // For logging
    MongooseModule.forFeature([
      { name: CollectiveArtifact.name, schema: CollectiveArtifactSchema },
      { name: CollectiveTask.name, schema: CollectiveTaskSchema },
      { name: CollectiveConversation.name, schema: CollectiveConversationSchema },
    ]),
  ],
  providers: [
    ArtifactLockingService,
    ArtifactVersioningService,
    ArtifactSearchService,
    SharedMemoryService,
  ],
  exports: [
    ArtifactLockingService,
    ArtifactVersioningService,
    ArtifactSearchService,
    SharedMemoryService,
  ],
})
export class CollectiveMemoryModule {}
