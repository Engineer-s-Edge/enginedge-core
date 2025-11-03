import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoreServicesModule } from '@core/services/core-services.module';
import KnowledgeNodeModel from './entities/knowledge-node.entity';
import KnowledgeEdgeModel from './entities/knowledge-edge.entity';
import GraphComponentModel from './entities/graph-component.entity';
import { KnowledgeNodeRepository } from './repositories/knowledge-node.repository';
import { KnowledgeEdgeRepository } from './repositories/knowledge-edge.repository';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { GraphAlgorithmsService } from './services/graph-algorithms.service';
import { GraphComponentService } from './services/graph-component.service';

@Module({
  imports: [
    CoreServicesModule,
    MongooseModule.forFeature([
      { name: 'knowledge_nodes', schema: KnowledgeNodeModel.schema },
      { name: 'knowledge_edges', schema: KnowledgeEdgeModel.schema },
      { name: 'graph_components', schema: GraphComponentModel.schema },
    ]),
  ],
  providers: [
    KnowledgeNodeRepository,
    KnowledgeEdgeRepository,
    GraphComponentService,
    KnowledgeGraphService,
    GraphAlgorithmsService,
  ],
  exports: [
    GraphComponentService,
    KnowledgeGraphService,
    GraphAlgorithmsService,
    KnowledgeNodeRepository,
    KnowledgeEdgeRepository,
  ],
})
export class KnowledgeGraphModule {}
