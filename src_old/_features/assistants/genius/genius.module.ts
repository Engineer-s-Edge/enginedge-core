/**
 * Genius Module
 * 
 * Feature module for the Genius Agent API.
 * 
 * Provides REST endpoints for:
 * - Learning control (start/stop, modes)
 * - Topic management (add, seed, query)
 * - Escalation handling (query, resolve, cancel)
 * - Statistics and monitoring
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoreServicesModule } from '@core/services/core-services.module';

// Controllers
import { GeniusController } from './controllers/genius.controller';
import { TopicsController } from './controllers/topics.controller';
import { EscalationsController } from './controllers/escalations.controller';

// Services
import { GeniusService } from './genius.service';
import { TopicsService } from './services/topics.service';
import { EscalationsService } from './services/escalations.service';

// Core infrastructure services
import { ExpertPoolManager } from '@core/infrastructure/agents/components/knowledge/services/expert-pool.service';
import { LearningModeService } from '@core/infrastructure/agents/components/knowledge/services/learning-mode.service';
import { ScheduledLearningManager } from '@core/infrastructure/agents/components/knowledge/services/scheduled-learning.service';
import { ValidationService } from '@core/infrastructure/agents/components/knowledge/services/validation.service';
import { TopicCatalogService } from '@core/infrastructure/agents/components/knowledge/services/topic-catalog.service';
import { KnowledgeGraphService } from '@core/infrastructure/agents/components/knowledge/services/knowledge-graph.service';
import { GraphComponentService } from '@core/infrastructure/agents/components/knowledge/services/graph-component.service';
import { NewsIntegrationService } from '@core/infrastructure/agents/components/knowledge/services/news-integration.service';
import { EscalationService } from '@core/infrastructure/agents/components/knowledge/services/escalation.service';
import { CategoryService } from '@core/infrastructure/agents/components/knowledge/services/category.service';

// Repositories
import { TopicCatalogRepository } from '@core/infrastructure/agents/components/knowledge/repositories/topic-catalog.repository';
import { EscalationRepository } from '@core/infrastructure/agents/components/knowledge/repositories/escalation.repository';
import { KnowledgeNodeRepository } from '@core/infrastructure/agents/components/knowledge/repositories/knowledge-node.repository';
import { KnowledgeEdgeRepository } from '@core/infrastructure/agents/components/knowledge/repositories/knowledge-edge.repository';

// Entities/Schemas
import { EscalationEntity, EscalationSchema } from '@core/infrastructure/agents/components/knowledge/entities/escalation.entity';
import KnowledgeNodeModel from '@core/infrastructure/agents/components/knowledge/entities/knowledge-node.entity';
import KnowledgeEdgeModel from '@core/infrastructure/agents/components/knowledge/entities/knowledge-edge.entity';
import TopicCatalogModel from '@core/infrastructure/agents/components/knowledge/entities/topic-catalog.entity';
import GraphComponentModel from '@core/infrastructure/agents/components/knowledge/entities/graph-component.entity';

@Module({
  imports: [
    CoreServicesModule,
    MongooseModule.forFeature([
      { name: EscalationEntity.name, schema: EscalationSchema },
      { name: 'knowledge_nodes', schema: KnowledgeNodeModel.schema },
      { name: 'knowledge_edges', schema: KnowledgeEdgeModel.schema },
      { name: 'topic_catalog', schema: TopicCatalogModel.schema },
      { name: 'graph_components', schema: GraphComponentModel.schema },
    ]),
  ],
  controllers: [GeniusController, TopicsController, EscalationsController],
  providers: [
    // Feature services
    GeniusService,
    TopicsService,
    EscalationsService,

    // Core infrastructure services
    ExpertPoolManager,
    LearningModeService,
    ScheduledLearningManager,
    ValidationService,
    TopicCatalogService,
    KnowledgeGraphService,
    GraphComponentService,
    NewsIntegrationService,
    EscalationService,
    CategoryService,

    // Repositories
    TopicCatalogRepository,
    EscalationRepository,
    KnowledgeNodeRepository,
    KnowledgeEdgeRepository,
  ],
  exports: [GeniusService, TopicsService, EscalationsService],
})
export class GeniusModule {}
