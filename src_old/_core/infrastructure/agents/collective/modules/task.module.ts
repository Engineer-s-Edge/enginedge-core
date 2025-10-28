import { Module } from '@nestjs/common';
import { CollectiveDataModule } from './data.module';
import { CoreServicesModule } from '@core/services/core-services.module';

// Task Management Services
import { TaskAssignmentService } from '../services/task-assignment.service';
import { DeadlockDetectionService } from '../services/deadlock-detection.service';

/**
 * CollectiveTaskModule
 * 
 * Provides task assignment algorithms and deadlock detection.
 * Handles intelligent task distribution based on agent capabilities
 * and detects circular dependencies in task trees.
 */
@Module({
  imports: [
    CollectiveDataModule, // For task and collective repositories
    CoreServicesModule, // For logging
  ],
  providers: [
    TaskAssignmentService,
    DeadlockDetectionService,
  ],
  exports: [
    TaskAssignmentService,
    DeadlockDetectionService,
  ],
})
export class CollectiveTaskModule {}
