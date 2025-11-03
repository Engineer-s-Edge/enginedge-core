import { Module } from '@nestjs/common';
import { BuilderController } from './controllers/builder.controller';
import { CommonModule } from '../common/common.module';
import { CoreServicesModule } from '@core/services/core-services.module';

/**
 * ReactModule - ReAct Agent specific functionality
 * 
 * ReAct (Reasoning + Acting) agents are the default expert agent type.
 * They use chain-of-thought reasoning with tool access.
 * 
 * This module provides:
 * - Block-based builder for creating ReAct agents
 * - Templates and presets for common use cases
 */
@Module({
  imports: [CommonModule, CoreServicesModule],
  controllers: [BuilderController],
})
export class ReactModule {}
