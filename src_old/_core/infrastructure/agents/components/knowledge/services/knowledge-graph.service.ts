import { Injectable, Inject } from '@nestjs/common';
import { KnowledgeNodeRepository } from '../repositories/knowledge-node.repository';
import { KnowledgeEdgeRepository } from '../repositories/knowledge-edge.repository';
import { GraphComponentService } from './graph-component.service';
import {
  KnowledgeNode,
  ICSLayer,
  ResearchStatus,
} from '../entities/knowledge-node.entity';
import {
  KnowledgeEdge,
  EdgeType,
} from '../entities/knowledge-edge.entity';
import {
  KnowledgeNodeIdType,
  KnowledgeEdgeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface CreateNodeOptions {
  type: string;
  label: string;
  layer: ICSLayer;
  properties?: Record<string, any>;
  researchStatus?: ResearchStatus;
  confidence?: number;
}

export interface CreateEdgeOptions {
  sourceId: KnowledgeNodeIdType;
  targetId: KnowledgeNodeIdType;
  type: EdgeType;
  weight?: number;
  confidence?: number;
  equation?: string;
  rationale?: string;
}

export interface ResearchSource {
  url: string;
  title: string;
  retrievedAt: Date;
  sourceType: 'web' | 'academic' | 'document' | 'user' | 'llm';
}

export interface AddResearchDataOptions {
  nodeId: KnowledgeNodeIdType;
  summary?: string;
  keyPoints?: string[];
  examples?: string[];
  relatedConcepts?: string[];
  equations?: string[];
  sources: ResearchSource[];
  confidence: number;
}

@Injectable()
export class KnowledgeGraphService {
  constructor(
    @Inject(KnowledgeNodeRepository)
    private readonly nodeRepository: KnowledgeNodeRepository,
    @Inject(KnowledgeEdgeRepository)
    private readonly edgeRepository: KnowledgeEdgeRepository,
    @Inject(GraphComponentService)
    private readonly componentService: GraphComponentService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'KnowledgeGraphService initializing',
      KnowledgeGraphService.name,
    );
  }

  // ============================
  // Node Operations
  // ============================

  /**
   * Create a new knowledge node
   */
  async createNode(options: CreateNodeOptions): Promise<KnowledgeNode> {
    try {
      const node = await this.nodeRepository.create({
        type: options.type,
        label: options.label,
        layer: options.layer,
        properties: options.properties || {},
        researchStatus: options.researchStatus || ResearchStatus.UNRESEARCHED,
        confidence: options.confidence || 0.5,
        validationCount: 0,
        validatedBy: [],
        sources: [],
        sourceType: 'system', // Default source type
        lastUpdated: new Date(),
      });

      // Create a new graph component for this node
      const category = options.properties?.category || options.type;
      await this.componentService.createComponent(node._id, category);

      this.logger.info(
        `Created knowledge node: ${node._id} (${node.label})`,
        KnowledgeGraphService.name,
      );
      return node;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating node: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get a node by ID
   */
  async getNode(id: KnowledgeNodeIdType): Promise<KnowledgeNode | null> {
    return this.nodeRepository.findById(id);
  }

  /**
   * Get all nodes
   */
  async getAllNodes(): Promise<KnowledgeNode[]> {
    return this.nodeRepository.findAll();
  }

  /**
   * Get nodes by type
   */
  async getNodesByType(type: string): Promise<KnowledgeNode[]> {
    return this.nodeRepository.findByType(type);
  }

  /**
   * Get nodes by layer
   */
  async getNodesByLayer(layer: ICSLayer): Promise<KnowledgeNode[]> {
    return this.nodeRepository.findByLayer(layer);
  }

  /**
   * Search nodes by label
   */
  async searchNodes(searchTerm: string): Promise<KnowledgeNode[]> {
    return this.nodeRepository.searchByLabel(searchTerm);
  }

  /**
   * Update a node
   */
  async updateNode(
    id: KnowledgeNodeIdType,
    updates: Partial<KnowledgeNode>,
  ): Promise<KnowledgeNode | null> {
    try {
      const node = await this.nodeRepository.update(id, updates);
      if (node) {
        this.logger.info(`Updated node ${id}`, KnowledgeGraphService.name);
      }
      return node;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating node: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a node and all connected edges
   */
  async deleteNode(id: KnowledgeNodeIdType): Promise<boolean> {
    try {
      // First delete all connected edges
      await this.edgeRepository.deleteConnectedEdges(id);
      
      // Then delete the node
      const deleted = await this.nodeRepository.delete(id);
      if (deleted) {
        this.logger.info(`Deleted node ${id}`, KnowledgeGraphService.name);
      }
      return deleted;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting node: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  // ============================
  // Edge Operations
  // ============================

  /**
   * Create a new knowledge edge
   */
  async createEdge(options: CreateEdgeOptions): Promise<KnowledgeEdge> {
    try {
      // Check if nodes are in different components
      const [sourceComponentId, targetComponentId] = await Promise.all([
        this.componentService.getComponentId(options.sourceId),
        this.componentService.getComponentId(options.targetId),
      ]);

      const edge = await this.edgeRepository.create({
        sourceId: options.sourceId,
        targetId: options.targetId,
        type: options.type,
        weight: options.weight || 1.0,
        confidence: options.confidence || 0.7,
        equation: options.equation,
        rationale: options.rationale,
      });

      this.logger.info(
        `Created edge ${edge._id} (${edge.sourceId} -> ${edge.targetId})`,
        KnowledgeGraphService.name,
      );

      // If nodes are in different components, merge them
      if (
        sourceComponentId &&
        targetComponentId &&
        sourceComponentId !== targetComponentId
      ) {
        this.logger.info(
          `Merging components: edge connects different subgraphs`,
          KnowledgeGraphService.name,
        );
        await this.componentService.mergeComponents(
          sourceComponentId,
          targetComponentId,
        );
      } else if (sourceComponentId) {
        // Just increment edge count for the component
        await this.componentService.incrementEdgeCount(sourceComponentId);
      }

      return edge;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating edge: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get an edge by ID
   */
  async getEdge(id: KnowledgeEdgeIdType): Promise<KnowledgeEdge | null> {
    return this.edgeRepository.findById(id);
  }

  /**
   * Get all edges
   */
  async getAllEdges(): Promise<KnowledgeEdge[]> {
    return this.edgeRepository.findAll();
  }

  /**
   * Get edges connected to a node
   */
  async getConnectedEdges(nodeId: KnowledgeNodeIdType): Promise<KnowledgeEdge[]> {
    return this.edgeRepository.findConnectedEdges(nodeId);
  }

  /**
   * Get outgoing edges from a node
   */
  async getOutgoingEdges(
    nodeId: KnowledgeNodeIdType,
    type?: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    return this.edgeRepository.findOutgoingEdges(nodeId, type);
  }

  /**
   * Get incoming edges to a node
   */
  async getIncomingEdges(
    nodeId: KnowledgeNodeIdType,
    type?: EdgeType,
  ): Promise<KnowledgeEdge[]> {
    return this.edgeRepository.findIncomingEdges(nodeId, type);
  }

  /**
   * Update an edge
   */
  async updateEdge(
    id: KnowledgeEdgeIdType,
    updates: Partial<KnowledgeEdge>,
  ): Promise<KnowledgeEdge | null> {
    try {
      const edge = await this.edgeRepository.update(id, updates);
      if (edge) {
        this.logger.info(`Updated edge ${id}`, KnowledgeGraphService.name);
      }
      return edge;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating edge: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Delete an edge
   */
  async deleteEdge(id: KnowledgeEdgeIdType): Promise<boolean> {
    try {
      const deleted = await this.edgeRepository.delete(id);
      if (deleted) {
        this.logger.info(`Deleted edge ${id}`, KnowledgeGraphService.name);
      }
      return deleted;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting edge: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  // ============================
  // Research Operations
  // ============================

  /**
   * Get all unresearched nodes, optionally filtered by layer
   */
  async getUnresearchedNodes(layer?: ICSLayer): Promise<KnowledgeNode[]> {
    return this.nodeRepository.findUnresearchedByLayer(layer);
  }

  /**
   * Lock a node for research
   */
  async lockNodeForResearch(
    nodeId: KnowledgeNodeIdType,
    agentId: string,
  ): Promise<KnowledgeNode | null> {
    const node = await this.nodeRepository.lockNode(
      nodeId,
      agentId,
      'research_in_progress',
    );
    if (node) {
      this.logger.info(
        `Locked node ${nodeId} for ${agentId}`,
        KnowledgeGraphService.name,
      );
    }
    return node;
  }

  /**
   * Unlock a node after research
   */
  async unlockNode(
    nodeId: KnowledgeNodeIdType,
    agentId: string,
  ): Promise<KnowledgeNode | null> {
    const node = await this.nodeRepository.unlockNode(nodeId, agentId);
    if (node) {
      this.logger.info(
        `Unlocked node ${nodeId} by ${agentId}`,
        KnowledgeGraphService.name,
      );
    }
    return node;
  }

  /**
   * Add research data to a node
   */
  async addResearchData(
    options: AddResearchDataOptions,
  ): Promise<KnowledgeNode | null> {
    try {
      const node = await this.nodeRepository.findById(options.nodeId);
      if (!node) return null;

      // Update research data with new information
      const updatedResearchData = {
        summary: options.summary,
        keyPoints: options.keyPoints,
        examples: options.examples,
        relatedConcepts: options.relatedConcepts,
        equations: options.equations,
      };

      // Update sources array
      const sources = node.sources || [];
      for (const source of options.sources) {
        sources.push({
          url: source.url,
          title: source.title,
          retrievedAt: source.retrievedAt,
          sourceType: source.sourceType,
        });
      }

      const updatedNode = await this.nodeRepository.update(options.nodeId, {
        researchData: updatedResearchData,
        sources,
        researchStatus: ResearchStatus.RESEARCHED,
        confidence: Math.max(node.confidence || 0.5, options.confidence),
      } as any);

      if (updatedNode) {
        this.logger.info(
          `Added research data to node ${options.nodeId}`,
          KnowledgeGraphService.name,
        );
      }

      return updatedNode;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error adding research data: ${info.message}`,
        KnowledgeGraphService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Mark a node as dubious
   */
  async markNodeAsDubious(
    nodeId: KnowledgeNodeIdType,
    agentId: string,
  ): Promise<KnowledgeNode | null> {
    const node = await this.nodeRepository.markAsDubious(nodeId, agentId);
    if (node) {
      this.logger.warn(
        `Node ${nodeId} marked as dubious by ${agentId}`,
        KnowledgeGraphService.name,
      );
    }
    return node;
  }

  /**
   * Validate a node (increase confidence)
   */
  async validateNode(
    nodeId: KnowledgeNodeIdType,
    agentId: string,
  ): Promise<KnowledgeNode | null> {
    const node = await this.nodeRepository.validateNode(nodeId, agentId);
    if (node) {
      this.logger.info(
        `Node ${nodeId} validated by ${agentId}`,
        KnowledgeGraphService.name,
      );
    }
    return node;
  }

  // ============================
  // Graph Structure Operations
  // ============================

  /**
   * Find or create a node with given label and type
   */
  async findOrCreateNode(
    label: string,
    type: string,
    layer: ICSLayer,
  ): Promise<KnowledgeNode> {
    // Try to find existing node
    const nodes = await this.searchNodes(label);
    const existing = nodes.find((n) => n.type === type && n.label === label);
    if (existing) {
      return existing;
    }

    // Create new node
    return this.createNode({
      type,
      label,
      layer,
    });
  }

  /**
   * Connect two nodes with an edge
   */
  async connectNodes(
    sourceId: KnowledgeNodeIdType,
    targetId: KnowledgeNodeIdType,
    edgeType: EdgeType,
    options?: {
      weight?: number;
      confidence?: number;
      equation?: string;
      rationale?: string;
    },
  ): Promise<KnowledgeEdge> {
    // Check if edge already exists
    const existing = await this.edgeRepository.findEdgeBetween(
      sourceId,
      targetId,
      edgeType,
    );

    if (existing) {
      // Update existing edge
      return (await this.updateEdge(existing._id, {
        weight: options?.weight || existing.weight,
        confidence: options?.confidence || existing.confidence,
        equation: options?.equation || existing.equation,
        rationale: options?.rationale || existing.rationale,
      }))!;
    }

    // Create new edge
    return this.createEdge({
      sourceId,
      targetId,
      type: edgeType,
      weight: options?.weight,
      confidence: options?.confidence,
      equation: options?.equation,
      rationale: options?.rationale,
    });
  }

  /**
   * Get the full graph structure (nodes and edges)
   */
  async getGraphStructure(): Promise<{
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
  }> {
    const [nodes, edges] = await Promise.all([
      this.getAllNodes(),
      this.getAllEdges(),
    ]);
    return { nodes, edges };
  }

  /**
   * Get graph statistics
   */
  async getGraphStatistics(): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodesByCategory: Record<string, number>;
    nodesByLayer: Record<number, number>;
    nodesByStatus: Record<string, number>;
  }> {
    const [nodes, edges] = await Promise.all([
      this.getAllNodes(),
      this.getAllEdges(),
    ]);

    const nodesByCategory: Record<string, number> = {};
    const nodesByLayer: Record<number, number> = {};
    const nodesByStatus: Record<string, number> = {};

    for (const node of nodes) {
      // Count by category
      const category = (node.properties?.category as string) || 'Unknown';
      nodesByCategory[category] = (nodesByCategory[category] || 0) + 1;

      // Count by layer
      const layer = node.layer ?? 0;
      nodesByLayer[layer] = (nodesByLayer[layer] || 0) + 1;

      // Count by status
      const status = node.researchStatus ?? 'unknown';
      nodesByStatus[status] = (nodesByStatus[status] || 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByCategory,
      nodesByLayer,
      nodesByStatus,
    };
  }
}
