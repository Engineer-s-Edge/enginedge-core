import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import GraphComponentModel, {
  GraphComponent,
} from '../entities/graph-component.entity';
import KnowledgeNodeModel from '../entities/knowledge-node.entity';
import { KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * Graph Component Service
 *
 * Manages disjoint graph detection and component merging for the Genius Agent.
 * Implements union-find logic to efficiently track and merge disconnected subgraphs.
 */
@Injectable()
export class GraphComponentService {
  constructor(private readonly logger: MyLogger) {}

  /**
   * Create a new graph component
   */
  async createComponent(
    initialNodeId: KnowledgeNodeIdType,
    category?: string,
  ): Promise<string> {
    const componentId = uuidv4();

    this.logger.info(
      `Creating new graph component ${componentId}`,
      GraphComponentService.name,
    );

    await GraphComponentModel.create({
      _id: componentId,
      nodeCount: 1,
      edgeCount: 0,
      categories: category ? [category] : [],
      representativeNodes: [initialNodeId],
      isActive: true,
    });

    // Update the node with its component ID
    await KnowledgeNodeModel.findByIdAndUpdate(initialNodeId, {
      graphComponentId: componentId,
    });

    return componentId;
  }

  /**
   * Get the component ID for a specific node
   * Fast lookup without traversing the graph
   */
  async getComponentId(
    nodeId: KnowledgeNodeIdType,
  ): Promise<string | null> {
    const node = await KnowledgeNodeModel.findById(nodeId).select(
      'graphComponentId',
    );
    return node?.graphComponentId || null;
  }

  /**
   * Merge two components when an edge connects them
   * Implements union-find merge logic
   */
  async mergeComponents(
    componentId1: string,
    componentId2: string,
  ): Promise<void> {
    if (componentId1 === componentId2) {
      this.logger.warn(
        `Attempted to merge component ${componentId1} with itself`,
        GraphComponentService.name,
      );
      return;
    }

    this.logger.info(
      `Merging graph components ${componentId2} into ${componentId1}`,
      GraphComponentService.name,
    );

    // Get both components
    const [comp1, comp2] = await Promise.all([
      GraphComponentModel.findById(componentId1),
      GraphComponentModel.findById(componentId2),
    ]);

    if (!comp1 || !comp2) {
      this.logger.error(
        `Cannot merge components: ${componentId1} or ${componentId2} not found`,
        GraphComponentService.name,
      );
      return;
    }

    // Determine which is larger (merge smaller into larger for efficiency)
    const [largerComp, smallerComp, largerCompId, smallerCompId] =
      comp1.nodeCount >= comp2.nodeCount
        ? [comp1, comp2, componentId1, componentId2]
        : [comp2, comp1, componentId2, componentId1];

    // Update all nodes in smaller component to point to larger component
    await KnowledgeNodeModel.updateMany(
      { graphComponentId: smallerCompId },
      { $set: { graphComponentId: largerCompId } },
    );

    // Merge metadata
    const mergedCategories = Array.from(
      new Set([...largerComp.categories, ...smallerComp.categories]),
    );

    const mergedRepNodes = Array.from(
      new Set([
        ...largerComp.representativeNodes,
        ...smallerComp.representativeNodes,
      ]),
    ).slice(0, 10); // Keep max 10 representative nodes

    // Update larger component
    await GraphComponentModel.findByIdAndUpdate(largerCompId, {
      $set: {
        nodeCount: largerComp.nodeCount + smallerComp.nodeCount,
        edgeCount: largerComp.edgeCount + smallerComp.edgeCount + 1, // +1 for the connecting edge
        categories: mergedCategories,
        representativeNodes: mergedRepNodes,
      },
    });

    // Mark smaller component as merged
    await GraphComponentModel.findByIdAndUpdate(smallerCompId, {
      $set: {
        isActive: false,
        mergedInto: largerCompId,
        lastMerged: new Date(),
      },
    });

    this.logger.info(
      `Successfully merged component ${smallerCompId} into ${largerCompId}`,
      GraphComponentService.name,
    );

    this.emit('component-merged', {
      fromComponent: smallerCompId,
      toComponent: largerCompId,
      newNodeCount: largerComp.nodeCount + smallerComp.nodeCount,
      timestamp: new Date(),
    });
  }

  /**
   * Get all active (non-merged) components
   */
  async getDisjointComponents(): Promise<GraphComponent[]> {
    return await GraphComponentModel.find({ isActive: true }).sort({
      nodeCount: -1,
    });
  }

  /**
   * Get components count (number of disconnected subgraphs)
   */
  async getComponentCount(): Promise<number> {
    return await GraphComponentModel.countDocuments({ isActive: true });
  }

  /**
   * Find potential bridge topics that could connect two components
   * Based on category overlap
   */
  async findBridgeCandidates(
    comp1Id: string,
    comp2Id: string,
  ): Promise<string[]> {
    const [comp1, comp2] = await Promise.all([
      GraphComponentModel.findById(comp1Id),
      GraphComponentModel.findById(comp2Id),
    ]);

    if (!comp1 || !comp2) {
      return [];
    }

    // Find overlapping or adjacent categories
    const overlapping = comp1.categories.filter((cat) =>
      comp2.categories.includes(cat),
    );

    // If no direct overlap, return categories from both
    if (overlapping.length === 0) {
      return [...comp1.categories, ...comp2.categories];
    }

    return overlapping;
  }

  /**
   * Update component statistics when nodes/edges change
   */
  async updateComponentStats(componentId: string): Promise<void> {
    const nodeCount = await KnowledgeNodeModel.countDocuments({
      graphComponentId: componentId,
    });

    // Calculate average confidence
    const nodes = await KnowledgeNodeModel.find({
      graphComponentId: componentId,
    }).select('confidence');

    const avgConfidence =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + (n.confidence || 0.5), 0) /
          nodes.length
        : 0.5;

    // Calculate research progress (% of nodes researched)
    const researchedCount = nodes.filter(
      (n) => n.researchStatus === 'researched',
    ).length;
    const researchProgress =
      nodes.length > 0 ? researchedCount / nodes.length : 0;

    await GraphComponentModel.findByIdAndUpdate(componentId, {
      $set: {
        nodeCount,
        'metadata.avgConfidence': avgConfidence,
        'metadata.researchProgress': researchProgress,
      },
    });
  }

  /**
   * Increment edge count for a component
   */
  async incrementEdgeCount(componentId: string): Promise<void> {
    await GraphComponentModel.findByIdAndUpdate(componentId, {
      $inc: { edgeCount: 1 },
    });
  }

  /**
   * Add a category to a component if not present
   */
  async addCategory(componentId: string, category: string): Promise<void> {
    await GraphComponentModel.findByIdAndUpdate(
      componentId,
      {
        $addToSet: { categories: category },
      },
      { new: true },
    );
  }

  /**
   * Get component by ID
   */
  async getComponent(componentId: string): Promise<GraphComponent | null> {
    return await GraphComponentModel.findById(componentId);
  }

  /**
   * Get components by category
   */
  async getComponentsByCategory(
    category: string,
  ): Promise<GraphComponent[]> {
    return await GraphComponentModel.find({
      isActive: true,
      categories: category,
    });
  }

  /**
   * Event emitter placeholder (to be implemented with actual event system)
   */
  private emit(_event: string, _data: any): void {
    // TODO: Integrate with actual event emitter when available
    this.logger.debug(
      `Event emitted: ${_event}`,
      GraphComponentService.name,
    );
  }
}
