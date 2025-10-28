import { Module } from '@nestjs/common';
import { CollectiveModule as CollectiveInfrastructureModule } from '@core/infrastructure/agents/collective';
import { CoreServicesModule } from '@core/services/core-services.module';

// Controllers (feature layer)
import { CollectiveController } from './controllers/collective.controller';

/**
 * Collective Feature Module
 * 
 * This is the FEATURE LAYER for collective agents. It provides:
 * - REST API endpoints (controllers)
 * - Feature-level services (if any)
 * - Integration with core collective infrastructure
 * 
 * The actual collective agent infrastructure lives in:
 * @core/infrastructure/agents/collective
 * 
 * This module should ONLY contain user-facing API concerns.
 */
@Module({
  imports: [
    CollectiveInfrastructureModule.forFeature(), // Import collective infrastructure
    CoreServicesModule, // For logging and utilities
  ],
  controllers: [
    CollectiveController, // REST API for collective CRUD and execution
  ],
  providers: [
    // Feature-level services only (if needed)
    // All infrastructure services come from CollectiveInfrastructureModule
  ],
  exports: [
    CollectiveInfrastructureModule, // Re-export for other feature modules
  ],
})
export class CollectiveFeatureModule {}

