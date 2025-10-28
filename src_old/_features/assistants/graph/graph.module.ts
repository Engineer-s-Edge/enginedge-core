import { Module } from '@nestjs/common';
import { GraphController } from './controllers/graph.controller';
import { GraphBuilderController } from './controllers/graph-builder.controller';
import { GraphAgentManagerService } from './services/graph-agent-manager.service';
import { GraphBuilderService } from './services/graph-builder.service';
import { CommonModule } from '../common/common.module';
import { CoreServicesModule } from '@core/services/core-services.module';
import { AgentModule } from '@core/infrastructure/agents/core/agents/agent.module';

/**
 * GraphModule - Graph Agent specific functionality
 * 
 * Graph agents execute workflows as directed acyclic graphs (DAGs).
 * Each node represents a step, and edges define control flow.
 * 
 * This module provides:
 * - Graph execution control (pause, resume, provide input/approval)
 * - Graph builder for creating custom workflows
 * - Node templates and edge types
 * - User interaction handling
 */
@Module({
  imports: [
    CommonModule,
    CoreServicesModule,
    AgentModule.forFeature(),
  ],
  controllers: [GraphController, GraphBuilderController],
  providers: [GraphAgentManagerService, GraphBuilderService],
  exports: [GraphAgentManagerService, GraphBuilderService],
})
export class GraphModule {}
