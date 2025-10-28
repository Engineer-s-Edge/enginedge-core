import { Module } from '@nestjs/common';
import { ExpertController } from './controllers/expert.controller';
import { ExpertService } from './services/expert.service';
import { KnowledgeGraphModule } from '../../../core/infrastructure/agents/components/knowledge/knowledge-graph.module';
import EmbedderModule from '../../../core/infrastructure/agents/components/embedder/embedder.module';

/**
 * Expert Agent Module
 *
 * Provides Expert Agent functionality using ICS Bear Hunter research methodology:
 * - AIM: Structural analysis and question generation
 * - SHOOT: Multi-source research with confidence scoring
 * - SKIN: Comprehensive synthesis with citations
 *
 * Endpoints:
 * - POST /assistants/expert/research
 * - GET /assistants/expert/research/stream (SSE)
 * - GET /assistants/expert/history
 * - GET /assistants/expert/knowledge-graph
 */
@Module({
  imports: [KnowledgeGraphModule, EmbedderModule],
  controllers: [ExpertController],
  providers: [ExpertService],
  exports: [ExpertService],
})
export class ExpertModule {}
