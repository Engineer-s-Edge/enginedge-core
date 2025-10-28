import * as crypto from 'crypto';
import { Embed } from '../vectorstores/entities/store.entity';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * ICS Layer levels for knowledge graph organization
 * L1 = Domain-level (broadest)
 * L2 = Category/Sub-domain
 * L3 = Specific topics
 * L4+ = Details, examples, edge cases
 */
export enum ICSLayer {
  L1_DOMAIN = 1,
  L2_CATEGORY = 2,
  L3_TOPIC = 3,
  L4_DETAIL = 4,
  L5_IMPLEMENTATION = 5,
  L6_EDGE_CASE = 6,
}

/**
 * Research status for knowledge graph nodes
 */
export enum ResearchStatus {
  UNRESEARCHED = 'unresearched', // Node created but not researched
  IN_PROGRESS = 'in_progress', // Currently being researched
  RESEARCHED = 'researched', // Deep research completed
  NEEDS_UPDATE = 'needs_update', // Marked for re-research
  DUBIOUS = 'dubious', // Marked as potentially incorrect
}

/**
 * Represents a node in the knowledge graph
 */
export interface KnowledgeNode {
  /** Unique identifier for the node */
  id: string;

  /** The type of entity this node represents (e.g., person, concept, organization, etc.) */
  type: string;

  /** The name or primary label for this node */
  label: string;

  /** Additional properties/attributes for this node */
  properties: Record<string, any>;

  /** When this node was created */
  createdAt: Date;

  /** When this node was last updated */
  lastUpdated: Date;

  /** Optional embedding vector for semantic search */
  embedding?: Embed;

  /** Optional relevance/importance score (0-1) */
  relevance?: number;

  // === ICS-Specific Fields ===

  /** ICS layer level (L1-L6) for hierarchical organization */
  layer?: ICSLayer;

  /** Research status of this node */
  researchStatus?: ResearchStatus;

  /** Confidence score (0-1) based on source quality and user validation */
  confidence?: number;

  /** Number of users who have validated this information */
  validationCount?: number;

  /** Citations/sources for this node's information */
  sources?: Array<{
    url?: string;
    title?: string;
    author?: string;
    retrievedAt: Date;
    sourceType: 'web' | 'academic' | 'document' | 'user' | 'llm';
  }>;

  /** Research content (detailed information gathered during SHOOT phase) */
  researchData?: {
    summary?: string;
    keyPoints?: string[];
    examples?: string[];
    relatedConcepts?: string[]; // IDs of related nodes
    equations?: string[]; // LaTeX or plain text equations
  };

  /** Lock information for concurrent access control */
  lock?: {
    lockedBy: string; // Agent/user ID
    lockedAt: Date;
    reason: string;
  };
}

/**
 * Edge/Relationship types for ICS knowledge graph
 */
export enum EdgeType {
  IS_A = 'is-a', // Classification
  PART_OF = 'part-of', // Composition
  PREREQUISITE_FOR = 'prerequisite-for', // Learning order
  RELATES_TO = 'relates-to', // General association
  CONTRASTS_WITH = 'contrasts-with', // Comparative understanding
  EXAMPLE_OF = 'example-of', // Concrete examples
  DERIVES_FROM = 'derives-from', // Mathematical/logical derivation
  APPLIED_IN = 'applied-in', // Practical application
  DEPENDS_ON = 'depends-on', // Dependency
}

/**
 * Represents a directed relationship between two nodes in the knowledge graph
 */
export interface KnowledgeEdge {
  /** Unique identifier for the edge */
  id: string;

  /** The source node ID (where the edge starts) */
  sourceId: string;

  /** The target node ID (where the edge ends) */
  targetId: string;

  /** The type of relationship (e.g., "knows", "belongs_to", "contains", etc.) */
  type: string;

  /** Additional properties/attributes for this relationship */
  properties: Record<string, any>;

  /** Weight/strength of the relationship (0-1) */
  weight: number;

  /** When this relationship was established */
  createdAt: Date;

  /** When this relationship was last updated */
  lastUpdated: Date;

  /** Optional confidence score for the relationship (0-1) */
  confidence?: number;

  // === ICS-Specific Fields ===

  /** Equation or formula that describes this relationship (if applicable) */
  equation?: string;

  /** Explanation of why this relationship exists */
  rationale?: string;

  /** Sources/citations for this relationship */
  sources?: Array<{
    url?: string;
    title?: string;
    retrievedAt: Date;
  }>;
}

/**
 * Options for configuring the knowledge graph
 */
export interface KnowledgeGraphOptions {
  /** Whether to allow duplicate nodes with the same label but different IDs */
  allowDuplicateNodes?: boolean;

  /** Threshold for merging similar nodes (0-1) */
  nodeSimilarityThreshold?: number;

  /** Whether to track relationship provenance (where the relationship was found) */
  trackProvenance?: boolean;

  /** Maximum number of edges per node (-1 for unlimited) */
  maxEdgesPerNode?: number;

  /** Whether to enable automatic embedding generation for nodes */
  enableEmbeddings?: boolean;

  /** Provider name for embeddings */
  embeddingProvider?: string;

  /** Model ID for embeddings */
  embeddingModel?: string;
}

/**
 * Result type for search operations in the knowledge graph
 */
export interface GraphSearchResult<T> {
  /** The matched item (node or edge) */
  item: T;

  /** Similarity/relevance score */
  score: number;

  /** Distance metric (if applicable) */
  distance?: number;
}

/**
 * Traversal path through the knowledge graph
 */
export interface GraphPath {
  /** Sequence of nodes in the path */
  nodes: KnowledgeNode[];

  /** Sequence of edges connecting the nodes */
  edges: KnowledgeEdge[];

  /** Total path length/cost (sum of edge weights) */
  pathCost: number;
}

/**
 * History entry for graph modifications (for rollback/audit)
 */
export interface GraphHistoryEntry {
  /** Unique ID for this history entry */
  id: string;

  /** Timestamp of the modification */
  timestamp: Date;

  /** Type of operation */
  operationType: 'add_node' | 'update_node' | 'delete_node' | 'add_edge' | 'update_edge' | 'delete_edge' | 'skin_operation';

  /** ID of the agent/user who made the change */
  actorId: string;

  /** Description of the change */
  description: string;

  /** Before state (for rollback) */
  beforeState?: {
    nodes?: KnowledgeNode[];
    edges?: KnowledgeEdge[];
  };

  /** After state */
  afterState?: {
    nodes?: KnowledgeNode[];
    edges?: KnowledgeEdge[];
  };

  /** Whether this change can be rolled back */
  canRollback: boolean;
}

/**
 * Result of finding the relationship path between two concepts
 */
export interface ConceptRelationship {
  /** The two concept IDs being related */
  conceptA: string;
  conceptB: string;

  /** All paths connecting the concepts */
  paths: GraphPath[];

  /** Common ancestors (concepts that both A and B belong to) */
  commonAncestors: KnowledgeNode[];

  /** Direct relationship (if exists) */
  directEdge?: KnowledgeEdge;

  /** Shortest path */
  shortestPath?: GraphPath;

  /** Explanation of how the concepts relate */
  explanation?: string;
}

/**
 * Prerequisite chain for learning a concept
 */
export interface PrerequisiteChain {
  /** The target concept */
  targetConcept: KnowledgeNode;

  /** Ordered list of prerequisites (learn in this order) */
  prerequisites: KnowledgeNode[];

  /** Prerequisite edges */
  edges: KnowledgeEdge[];

  /** Estimated total learning time/complexity */
  complexity?: number;
}

/**
 * KnowledgeGraph
 *
 * This class implements a flexible knowledge graph data structure for storing entities
 * (nodes) and their relationships (edges). It supports advanced operations such as:
 * - Adding/updating nodes and relationships
 * - Semantic and attribute-based search
 * - Graph traversal and path finding
 * - Subgraph extraction
 * - Merging similar nodes
 *
 * The structure is designed to be used in knowledge-based agents, including KG memory
 * agents and research agents, allowing them to build, maintain, and query a rich
 * representation of domain knowledge.
 */
export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  private nodesByType: Map<string, Set<string>> = new Map();
  private edgesByType: Map<string, Set<string>> = new Map();
  private outgoingEdges: Map<string, Set<string>> = new Map();
  private incomingEdges: Map<string, Set<string>> = new Map();

  private options: KnowledgeGraphOptions;
  private logger: MyLogger;

  /**
   * Create a new knowledge graph
   * @param options Configuration options for the knowledge graph
   * @param logger Logger instance for logging operations
   */
  constructor(options: KnowledgeGraphOptions = {}, logger: MyLogger) {
    this.logger = logger;
    this.options = {
      allowDuplicateNodes: false,
      nodeSimilarityThreshold: 0.85,
      trackProvenance: true,
      maxEdgesPerNode: -1,
      enableEmbeddings: true,
      ...options,
    };

    this.logger.info('KnowledgeGraph initializing', KnowledgeGraph.name);
    this.logger.info(
      `KnowledgeGraph options: ${JSON.stringify(this.options)}`,
      KnowledgeGraph.name,
    );
  }

  /**
   * Generate a unique ID for a node or edge
   */
  private generateId(prefix: string = ''): string {
    const randomPart = crypto.randomBytes(8).toString('hex');
    return prefix ? `${prefix}_${randomPart}` : randomPart;
  }

  /**
   * Check if a node with the given ID exists
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Check if an edge with the given ID exists
   */
  hasEdge(id: string): boolean {
    return this.edges.has(id);
  }

  /**
   * Add a new node to the graph
   */
  addNode(
    node: Omit<KnowledgeNode, 'id' | 'createdAt' | 'lastUpdated'>,
  ): KnowledgeNode {
    this.logger.info(
      `Adding node: ${node.label} (type: ${node.type})`,
      KnowledgeGraph.name,
    );

    // Check for duplicate nodes if not allowed
    if (!this.options.allowDuplicateNodes) {
      const existingNode = this.findNodeByLabel(node.label);
      if (existingNode) {
        this.logger.info(
          `Found existing node with label '${node.label}', updating instead of creating new`,
          KnowledgeGraph.name,
        );
        // Update existing node instead of adding a new one
        return this.updateNode(existingNode.id, {
          ...node,
          properties: { ...existingNode.properties, ...node.properties },
        });
      }
    }

    const now = new Date();
    const newNode: KnowledgeNode = {
      id: this.generateId(node.type),
      ...node,
      createdAt: now,
      lastUpdated: now,
    };

    this.nodes.set(newNode.id, newNode);

    // Add to type index
    if (!this.nodesByType.has(newNode.type)) {
      this.nodesByType.set(newNode.type, new Set());
    }
    this.nodesByType.get(newNode.type)!.add(newNode.id);

    // Initialize edge collections
    this.outgoingEdges.set(newNode.id, new Set());
    this.incomingEdges.set(newNode.id, new Set());

    this.logger.info(
      `Successfully added node: ${newNode.id} (${newNode.label})`,
      KnowledgeGraph.name,
    );
    return newNode;
  }

  /**
   * Update an existing node
   */
  updateNode(
    id: string,
    updates: Partial<Omit<KnowledgeNode, 'id' | 'createdAt' | 'lastUpdated'>>,
  ): KnowledgeNode {
    this.logger.info(`Updating node: ${id}`, KnowledgeGraph.name);

    if (!this.nodes.has(id)) {
      this.logger.error(`Node with ID '${id}' not found`, KnowledgeGraph.name);
      throw new Error(`Node with ID '${id}' not found`);
    }

    const node = this.nodes.get(id)!;

    // Handle type change by updating indexes
    if (updates.type && updates.type !== node.type) {
      this.logger.info(
        `Changing node type from '${node.type}' to '${updates.type}'`,
        KnowledgeGraph.name,
      );
      // Remove from old type index
      this.nodesByType.get(node.type)?.delete(id);
      if (!this.nodesByType.has(updates.type)) {
        this.nodesByType.set(updates.type, new Set());
      }
      // Add to new type index
      this.nodesByType.get(updates.type)!.add(id);
    }

    // Update properties
    const updatedNode: KnowledgeNode = {
      ...node,
      ...updates,
      properties: { ...node.properties, ...(updates.properties || {}) },
      lastUpdated: new Date(),
    };

    this.nodes.set(id, updatedNode);
    this.logger.info(
      `Successfully updated node: ${id} (${updatedNode.label})`,
      KnowledgeGraph.name,
    );
    return updatedNode;
  }

  /**
   * Remove a node and all its connected edges from the graph
   */
  removeNode(id: string): boolean {
    this.logger.info(`Removing node: ${id}`, KnowledgeGraph.name);

    if (!this.nodes.has(id)) {
      this.logger.warn(
        `Node with ID '${id}' not found for removal`,
        KnowledgeGraph.name,
      );
      return false;
    }

    const node = this.nodes.get(id)!;

    // Remove all connected edges
    if (this.outgoingEdges.has(id)) {
      const outEdges = Array.from(this.outgoingEdges.get(id)!);
      this.logger.info(
        `Removing ${outEdges.length} outgoing edges from node ${id}`,
        KnowledgeGraph.name,
      );
      for (const edgeId of outEdges) {
        this.removeEdge(edgeId);
      }
    }

    if (this.incomingEdges.has(id)) {
      const inEdges = Array.from(this.incomingEdges.get(id)!);
      this.logger.info(
        `Removing ${inEdges.length} incoming edges from node ${id}`,
        KnowledgeGraph.name,
      );
      for (const edgeId of inEdges) {
        this.removeEdge(edgeId);
      }
    }

    // Remove from type index
    this.nodesByType.get(node.type)?.delete(id);

    // Clean up edge collections
    this.outgoingEdges.delete(id);
    this.incomingEdges.delete(id);

    // Remove the node itself
    const removed = this.nodes.delete(id);
    this.logger.info(
      `Successfully removed node: ${id} (${node.label})`,
      KnowledgeGraph.name,
    );
    return removed;
  }

  /**
   * Get a node by its ID
   */
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Find a node by its label (exact match)
   */
  findNodeByLabel(label: string): KnowledgeNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.label === label) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Add a new edge between two nodes
   */
  addEdge(
    edge: Omit<KnowledgeEdge, 'id' | 'createdAt' | 'lastUpdated'>,
  ): KnowledgeEdge {
    this.logger.info(
      `Adding edge: ${edge.sourceId} -> ${edge.targetId} (type: ${edge.type}, weight: ${edge.weight})`,
      KnowledgeGraph.name,
    );

    // Validate source and target nodes
    if (!this.nodes.has(edge.sourceId)) {
      this.logger.error(
        `Source node '${edge.sourceId}' not found`,
        KnowledgeGraph.name,
      );
      throw new Error(`Source node '${edge.sourceId}' not found`);
    }
    if (!this.nodes.has(edge.targetId)) {
      this.logger.error(
        `Target node '${edge.targetId}' not found`,
        KnowledgeGraph.name,
      );
      throw new Error(`Target node '${edge.targetId}' not found`);
    }

    // Check edge limit if configured
    if (this.options.maxEdgesPerNode !== -1) {
      const outgoingCount = this.outgoingEdges.get(edge.sourceId)?.size || 0;
      if (outgoingCount >= this.options.maxEdgesPerNode!) {
        this.logger.error(
          `Maximum number of outgoing edges (${this.options.maxEdgesPerNode}) reached for node '${edge.sourceId}'`,
          KnowledgeGraph.name,
        );
        throw new Error(
          `Maximum number of outgoing edges (${this.options.maxEdgesPerNode}) reached for node '${edge.sourceId}'`,
        );
      }
    }

    const now = new Date();
    const newEdge: KnowledgeEdge = {
      id: this.generateId(`edge_${edge.type}`),
      ...edge,
      createdAt: now,
      lastUpdated: now,
    };

    this.edges.set(newEdge.id, newEdge);

    // Add to type index
    if (!this.edgesByType.has(newEdge.type)) {
      this.edgesByType.set(newEdge.type, new Set());
    }
    this.edgesByType.get(newEdge.type)!.add(newEdge.id);

    // Update node connections
    this.outgoingEdges.get(newEdge.sourceId)!.add(newEdge.id);
    this.incomingEdges.get(newEdge.targetId)!.add(newEdge.id);

    this.logger.info(
      `Successfully added edge: ${newEdge.id} (${edge.sourceId} -> ${edge.targetId})`,
      KnowledgeGraph.name,
    );
    return newEdge;
  }

  /**
   * Update an existing edge
   */
  updateEdge(
    id: string,
    updates: Partial<Omit<KnowledgeEdge, 'id' | 'createdAt' | 'lastUpdated'>>,
  ): KnowledgeEdge {
    if (!this.edges.has(id)) {
      throw new Error(`Edge with ID '${id}' not found`);
    }

    const edge = this.edges.get(id)!;

    // Handle type change by updating indexes
    if (updates.type && updates.type !== edge.type) {
      // Remove from old type index
      this.edgesByType.get(edge.type)?.delete(id);
      if (!this.edgesByType.has(updates.type)) {
        this.edgesByType.set(updates.type, new Set());
      }
      // Add to new type index
      this.edgesByType.get(updates.type)!.add(id);
    }

    // Update edge
    const updatedEdge: KnowledgeEdge = {
      ...edge,
      ...updates,
      properties: { ...edge.properties, ...(updates.properties || {}) },
      lastUpdated: new Date(),
    };

    this.edges.set(id, updatedEdge);
    return updatedEdge;
  }

  /**
   * Remove an edge from the graph
   */
  removeEdge(id: string): boolean {
    this.logger.info(`Removing edge: ${id}`, KnowledgeGraph.name);

    if (!this.edges.has(id)) {
      this.logger.warn(
        `Edge with ID '${id}' not found for removal`,
        KnowledgeGraph.name,
      );
      return false;
    }

    const edge = this.edges.get(id)!;

    // Remove from indexes
    this.edgesByType.get(edge.type)?.delete(id);
    this.outgoingEdges.get(edge.sourceId)?.delete(id);
    this.incomingEdges.get(edge.targetId)?.delete(id);

    // Remove the edge itself
    const removed = this.edges.delete(id);
    this.logger.info(
      `Successfully removed edge: ${id} (${edge.sourceId} -> ${edge.targetId})`,
      KnowledgeGraph.name,
    );
    return removed;
  }

  /**
   * Get an edge by its ID
   */
  getEdge(id: string): KnowledgeEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges in the graph
   */
  getAllEdges(): KnowledgeEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get nodes of a specific type
   */
  getNodesByType(type: string): KnowledgeNode[] {
    if (!this.nodesByType.has(type)) {
      return [];
    }

    return Array.from(this.nodesByType.get(type)!)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get edges of a specific type
   */
  getEdgesByType(type: string): KnowledgeEdge[] {
    if (!this.edgesByType.has(type)) {
      return [];
    }

    return Array.from(this.edgesByType.get(type)!)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get edge between two nodes (if exists)
   */
  getEdgeBetween(sourceId: string, targetId: string): KnowledgeEdge | null {
    const outEdges = this.getOutgoingEdges(sourceId);
    for (const edge of outEdges) {
      if (edge.targetId === targetId) {
        return edge;
      }
    }
    return null;
  }

  /**
   * Find nodes where a property matches a given value
   */
  findNodesByProperty(
    propertyName: string,
    propertyValue: any,
  ): KnowledgeNode[] {
    const results: KnowledgeNode[] = [];

    for (const node of this.nodes.values()) {
      if (node.properties[propertyName] === propertyValue) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Get all outgoing edges from a node
   */
  getOutgoingEdges(nodeId: string): KnowledgeEdge[] {
    if (!this.outgoingEdges.has(nodeId)) {
      return [];
    }

    return Array.from(this.outgoingEdges.get(nodeId)!)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all incoming edges to a node
   */
  getIncomingEdges(nodeId: string): KnowledgeEdge[] {
    if (!this.incomingEdges.has(nodeId)) {
      return [];
    }

    return Array.from(this.incomingEdges.get(nodeId)!)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get neighbors (connected nodes) of a given node
   */
  getNeighbors(nodeId: string): {
    node: KnowledgeNode;
    edge: KnowledgeEdge;
    direction: 'outgoing' | 'incoming';
  }[] {
    const neighbors: {
      node: KnowledgeNode;
      edge: KnowledgeEdge;
      direction: 'outgoing' | 'incoming';
    }[] = [];

    // Get outgoing connections
    for (const edge of this.getOutgoingEdges(nodeId)) {
      const targetNode = this.nodes.get(edge.targetId);
      if (targetNode) {
        neighbors.push({
          node: targetNode,
          edge,
          direction: 'outgoing',
        });
      }
    }

    // Get incoming connections
    for (const edge of this.getIncomingEdges(nodeId)) {
      const sourceNode = this.nodes.get(edge.sourceId);
      if (sourceNode) {
        neighbors.push({
          node: sourceNode,
          edge,
          direction: 'incoming',
        });
      }
    }

    return neighbors;
  }

  /**
   * Find the shortest path between two nodes using Dijkstra's algorithm
   */
  findShortestPath(startNodeId: string, endNodeId: string): GraphPath | null {
    this.logger.info(
      `Finding shortest path from ${startNodeId} to ${endNodeId}`,
      KnowledgeGraph.name,
    );

    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) {
      this.logger.warn(
        `One or both nodes not found: start=${startNodeId}, end=${endNodeId}`,
        KnowledgeGraph.name,
      );
      return null;
    }

    // Initialize data structures for Dijkstra's algorithm
    const distances: Map<string, number> = new Map();
    const previousNodes: Map<string, { nodeId: string; edgeId: string }> =
      new Map();
    const unvisited: Set<string> = new Set();

    // Initialize all nodes with Infinity distance
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, nodeId === startNodeId ? 0 : Infinity);
      unvisited.add(nodeId);
    }

    while (unvisited.size > 0) {
      // Find the unvisited node with the smallest distance
      let currentNodeId: string | null = null;
      let smallestDistance = Infinity;

      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId)!;
        if (distance < smallestDistance) {
          smallestDistance = distance;
          currentNodeId = nodeId;
        }
      }

      // If we found our destination or there's no path
      if (currentNodeId === null || smallestDistance === Infinity) {
        break;
      }

      if (currentNodeId === endNodeId) {
        // We've reached the destination, reconstruct the path
        this.logger.info(
          `Found path from ${startNodeId} to ${endNodeId}`,
          KnowledgeGraph.name,
        );
        return this.reconstructPath(startNodeId, endNodeId, previousNodes);
      }

      // Remove current node from unvisited
      unvisited.delete(currentNodeId);

      // Check all neighbors
      const outgoingEdges = this.getOutgoingEdges(currentNodeId);
      for (const edge of outgoingEdges) {
        const neighborId = edge.targetId;
        if (!unvisited.has(neighborId)) continue;

        // Calculate new distance (using edge weight)
        const newDistance = distances.get(currentNodeId)! + (1 - edge.weight); // Convert weight to distance

        if (newDistance < distances.get(neighborId)!) {
          // Update if we found a better path
          distances.set(neighborId, newDistance);
          previousNodes.set(neighborId, {
            nodeId: currentNodeId,
            edgeId: edge.id,
          });
        }
      }
    }

    // If we get here, no path was found
    this.logger.warn(
      `No path found from ${startNodeId} to ${endNodeId}`,
      KnowledgeGraph.name,
    );
    return null;
  }

  /**
   * Reconstruct the path from the Dijkstra's algorithm results
   */
  private reconstructPath(
    startNodeId: string,
    endNodeId: string,
    previousNodes: Map<string, { nodeId: string; edgeId: string }>,
  ): GraphPath {
    const path: GraphPath = {
      nodes: [],
      edges: [],
      pathCost: 0,
    };

    let currentNodeId = endNodeId;

    while (currentNodeId !== startNodeId) {
      const node = this.nodes.get(currentNodeId)!;
      path.nodes.unshift(node);

      const previous = previousNodes.get(currentNodeId);
      if (!previous) {
        throw new Error('Path reconstruction failed - broken path chain');
      }

      const edge = this.edges.get(previous.edgeId)!;
      path.edges.unshift(edge);
      path.pathCost += 1 - edge.weight; // Convert weight to cost

      currentNodeId = previous.nodeId;
    }

    // Add the start node
    path.nodes.unshift(this.nodes.get(startNodeId)!);

    return path;
  }

  /**
   * Get a subgraph containing nodes of specified types and their connections
   */
  getSubgraph(nodeTypes: string[]): KnowledgeGraph {
    this.logger.info(
      `Creating subgraph for node types: ${nodeTypes.join(', ')}`,
      KnowledgeGraph.name,
    );
    const subgraph = new KnowledgeGraph(this.options, this.logger);
    const includedNodeIds = new Set<string>();

    // Add all nodes of the specified types
    for (const type of nodeTypes) {
      if (this.nodesByType.has(type)) {
        for (const nodeId of this.nodesByType.get(type)!) {
          const node = this.nodes.get(nodeId)!;
          subgraph.addNode({
            type: node.type,
            label: node.label,
            properties: { ...node.properties },
            embedding: node.embedding,
            relevance: node.relevance,
          });
          includedNodeIds.add(nodeId);
        }
      }
    }

    // Add edges between included nodes
    for (const edge of this.edges.values()) {
      if (
        includedNodeIds.has(edge.sourceId) &&
        includedNodeIds.has(edge.targetId)
      ) {
        subgraph.addEdge({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          type: edge.type,
          properties: { ...edge.properties },
          weight: edge.weight,
          confidence: edge.confidence,
        });
      }
    }

    this.logger.info(
      `Created subgraph with ${subgraph.getAllNodes().length} nodes and ${subgraph.getAllEdges().length} edges`,
      KnowledgeGraph.name,
    );
    return subgraph;
  }

  /**
   * Clear all data from the graph
   */
  clear(): void {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;
    this.logger.info(
      `Clearing knowledge graph (${nodeCount} nodes, ${edgeCount} edges)`,
      KnowledgeGraph.name,
    );

    this.nodes.clear();
    this.edges.clear();
    this.nodesByType.clear();
    this.edgesByType.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();

    this.logger.info(
      'Knowledge graph cleared successfully',
      KnowledgeGraph.name,
    );
  }

  // ============================================================
  // ICS-SPECIFIC GRAPH ALGORITHMS
  // ============================================================

  /**
   * Find all paths connecting two concepts (for "how are X and Y related?")
   * @param conceptAId ID of the first concept
   * @param conceptBId ID of the second concept
   * @param maxPaths Maximum number of paths to return
   * @param maxDepth Maximum path length to search
   * @returns ConceptRelationship containing all paths and analysis
   */
  findConceptRelationship(
    conceptAId: string,
    conceptBId: string,
    maxPaths: number = 5,
    maxDepth: number = 6,
  ): ConceptRelationship | null {
    const nodeA = this.getNode(conceptAId);
    const nodeB = this.getNode(conceptBId);

    if (!nodeA || !nodeB) {
      this.logger.warn(`One or both concepts not found: ${conceptAId}, ${conceptBId}`);
      return null;
    }

    this.logger.info(`Finding relationship between "${nodeA.label}" and "${nodeB.label}"`);

    // Check for direct edge
    const directEdge = this.getEdgeBetween(conceptAId, conceptBId);

    // Find all paths using DFS
    const allPaths: GraphPath[] = [];
    const visited = new Set<string>();
    
    const dfs = (currentId: string, path: GraphPath, depth: number) => {
      if (depth > maxDepth || allPaths.length >= maxPaths) return;
      if (visited.has(currentId)) return;
      
      if (currentId === conceptBId && path.nodes.length > 1) {
        allPaths.push({ ...path });
        return;
      }

      visited.add(currentId);
      
      const outEdges = this.getOutgoingEdges(currentId);
      for (const edge of outEdges) {
        const targetNode = this.getNode(edge.targetId);
        if (!targetNode) continue;

        dfs(edge.targetId, {
          nodes: [...path.nodes, targetNode],
          edges: [...path.edges, edge],
          pathCost: path.pathCost + (1 - edge.weight),
        }, depth + 1);
      }
      
      visited.delete(currentId);
    };

    dfs(conceptAId, {
      nodes: [nodeA],
      edges: [],
      pathCost: 0,
    }, 0);

    // Find common ancestors (concepts both A and B are part of or instances of)
    const ancestorsA = this.findAncestors(conceptAId, [EdgeType.IS_A, EdgeType.PART_OF]);
    const ancestorsB = this.findAncestors(conceptBId, [EdgeType.IS_A, EdgeType.PART_OF]);
    
    const commonAncestors = ancestorsA.filter(a => 
      ancestorsB.some(b => b.id === a.id)
    );

    // Find shortest path
    const shortestPath = allPaths.length > 0
      ? allPaths.reduce((shortest, current) => 
          current.pathCost < shortest.pathCost ? current : shortest
        )
      : undefined;

    return {
      conceptA: conceptAId,
      conceptB: conceptBId,
      paths: allPaths,
      commonAncestors,
      directEdge: directEdge || undefined,
      shortestPath,
    };
  }

  /**
   * Find all ancestor nodes (following is-a and part-of edges upward)
   * @param nodeId Starting node
   * @param edgeTypes Edge types to follow (default: is-a, part-of)
   * @returns Array of ancestor nodes
   */
  findAncestors(nodeId: string, edgeTypes: string[] = [EdgeType.IS_A, EdgeType.PART_OF]): KnowledgeNode[] {
    const ancestors: KnowledgeNode[] = [];
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const outEdges = this.getOutgoingEdges(currentId);
      for (const edge of outEdges) {
        if (edgeTypes.includes(edge.type)) {
          const ancestor = this.getNode(edge.targetId);
          if (ancestor && !visited.has(ancestor.id)) {
            ancestors.push(ancestor);
            queue.push(ancestor.id);
          }
        }
      }
    }

    return ancestors;
  }

  /**
   * Build prerequisite chain for learning a concept (in order)
   * @param conceptId Target concept to learn
   * @returns Ordered prerequisite chain
   */
  buildPrerequisiteChain(conceptId: string): PrerequisiteChain | null {
    const target = this.getNode(conceptId);
    if (!target) {
      this.logger.warn(`Concept not found: ${conceptId}`);
      return null;
    }

    this.logger.info(`Building prerequisite chain for "${target.label}"`);

    const prerequisites: KnowledgeNode[] = [];
    const edges: KnowledgeEdge[] = [];
    const visited = new Set<string>();

    // DFS to collect all prerequisites
    const collectPrereqs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const inEdges = this.getIncomingEdges(nodeId);
      for (const edge of inEdges) {
        if (edge.type === EdgeType.PREREQUISITE_FOR || edge.type === EdgeType.DEPENDS_ON) {
          const prereqNode = this.getNode(edge.sourceId);
          if (prereqNode) {
            collectPrereqs(edge.sourceId);
            if (!prerequisites.find(p => p.id === prereqNode.id)) {
              prerequisites.push(prereqNode);
              edges.push(edge);
            }
          }
        }
      }
    };

    collectPrereqs(conceptId);

    // Topological sort to get learning order
    const sorted = this.topologicalSort(prerequisites.map(p => p.id));

    return {
      targetConcept: target,
      prerequisites: sorted.map(id => this.getNode(id)!).filter(Boolean),
      edges,
      complexity: prerequisites.length,
    };
  }

  /**
   * Topological sort of nodes (for ordering prerequisites)
   * @param nodeIds List of node IDs to sort
   * @returns Sorted array of node IDs
   */
  private topologicalSort(nodeIds: string[]): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (id: string) => {
      if (temp.has(id)) {
        // Cycle detected
        this.logger.warn(`Cycle detected in prerequisite chain at node: ${id}`);
        return;
      }
      if (visited.has(id)) return;

      temp.add(id);
      
      const outEdges = this.getOutgoingEdges(id);
      for (const edge of outEdges) {
        if ((edge.type === EdgeType.PREREQUISITE_FOR || edge.type === EdgeType.DEPENDS_ON) 
            && nodeIds.includes(edge.targetId)) {
          visit(edge.targetId);
        }
      }

      temp.delete(id);
      visited.add(id);
      sorted.unshift(id); // Add to front for reverse topological order
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    return sorted;
  }

  /**
   * Find related concepts (concepts connected by relates-to, example-of, etc.)
   * @param conceptId Source concept
   * @param maxResults Maximum number of results
   * @returns Array of related nodes with edge information
   */
  findRelatedConcepts(conceptId: string, maxResults: number = 10): Array<{
    node: KnowledgeNode;
    edge: KnowledgeEdge;
    relationshipType: string;
  }> {
    const related: Array<{ node: KnowledgeNode; edge: KnowledgeEdge; relationshipType: string }> = [];
    
    const outEdges = this.getOutgoingEdges(conceptId);
    const inEdges = this.getIncomingEdges(conceptId);

    const relevantTypes = [
      EdgeType.RELATES_TO,
      EdgeType.EXAMPLE_OF,
      EdgeType.CONTRASTS_WITH,
      EdgeType.APPLIED_IN,
    ];

    for (const edge of [...outEdges, ...inEdges]) {
      if (relevantTypes.includes(edge.type as EdgeType)) {
        const targetId = edge.sourceId === conceptId ? edge.targetId : edge.sourceId;
        const node = this.getNode(targetId);
        if (node) {
          related.push({
            node,
            edge,
            relationshipType: edge.type,
          });
        }
      }
    }

    // Sort by edge weight/confidence
    related.sort((a, b) => (b.edge.confidence || 0) - (a.edge.confidence || 0));

    return related.slice(0, maxResults);
  }

  /**
   * Get all unresearched nodes at a specific layer
   * @param layer ICS layer level
   * @returns Array of nodes needing research
   */
  getUnresearchedNodes(layer?: ICSLayer): KnowledgeNode[] {
    const allNodes = this.getAllNodes();
    return allNodes.filter(node => {
      const matchesLayer = layer === undefined || node.layer === layer;
      const needsResearch = node.researchStatus === ResearchStatus.UNRESEARCHED 
                         || node.researchStatus === ResearchStatus.NEEDS_UPDATE;
      return matchesLayer && needsResearch;
    });
  }

  /**
   * Lock a node for exclusive access (prevents concurrent modification)
   * @param nodeId Node to lock
   * @param actorId ID of agent/user acquiring the lock
   * @param reason Reason for locking
   * @returns true if lock acquired, false if already locked
   */
  lockNode(nodeId: string, actorId: string, reason: string): boolean {
    const node = this.getNode(nodeId);
    if (!node) return false;

    if (node.lock && node.lock.lockedBy !== actorId) {
      this.logger.warn(`Node ${nodeId} already locked by ${node.lock.lockedBy}`);
      return false;
    }

    node.lock = {
      lockedBy: actorId,
      lockedAt: new Date(),
      reason,
    };

    this.updateNode(nodeId, node);
    this.logger.info(`Node ${nodeId} locked by ${actorId}: ${reason}`);
    return true;
  }

  /**
   * Release a node lock
   * @param nodeId Node to unlock
   * @param actorId ID of agent/user releasing the lock (must match lock owner)
   * @returns true if unlocked, false if not locked or wrong actor
   */
  unlockNode(nodeId: string, actorId: string): boolean {
    const node = this.getNode(nodeId);
    if (!node) return false;

    if (!node.lock) {
      this.logger.warn(`Node ${nodeId} is not locked`);
      return false;
    }

    if (node.lock.lockedBy !== actorId) {
      this.logger.warn(`Node ${nodeId} cannot be unlocked by ${actorId}, locked by ${node.lock.lockedBy}`);
      return false;
    }

    delete node.lock;
    this.updateNode(nodeId, node);
    this.logger.info(`Node ${nodeId} unlocked by ${actorId}`);
    return true;
  }

  /**
   * Mark a node as dubious (potentially incorrect information)
   * @param nodeId Node to mark
   * @param actorId ID of user/agent marking it
   * @returns Updated node
   */
  markNodeAsDubious(nodeId: string, actorId: string): KnowledgeNode | null {
    const node = this.getNode(nodeId);
    if (!node) return null;

    node.researchStatus = ResearchStatus.DUBIOUS;
    node.confidence = Math.max(0, (node.confidence || 0.5) - 0.3); // Reduce confidence

    if (!node.properties.dubiousReports) {
      node.properties.dubiousReports = [];
    }
    node.properties.dubiousReports.push({
      reportedBy: actorId,
      reportedAt: new Date(),
    });

    this.updateNode(nodeId, node);
    this.logger.warn(`Node ${nodeId} marked as dubious by ${actorId}`);
    return node;
  }

  /**
   * Get nodes by layer level
   * @param layer ICS layer
   * @returns Array of nodes at that layer
   */
  getNodesByLayer(layer: ICSLayer): KnowledgeNode[] {
    return this.getAllNodes().filter(node => node.layer === layer);
  }

  /**
   * Get nodes by research status
   * @param status Research status to filter by
   * @returns Array of matching nodes
   */
  getNodesByResearchStatus(status: ResearchStatus): KnowledgeNode[] {
    return this.getAllNodes().filter(node => node.researchStatus === status);
  }

  /**
   * Validate user's contribution to a node (increase confidence)
   * @param nodeId Node being validated
   * @param actorId User/agent validating
   * @returns Updated node
   */
  validateNode(nodeId: string, actorId: string): KnowledgeNode | null {
    const node = this.getNode(nodeId);
    if (!node) return null;

    node.validationCount = (node.validationCount || 0) + 1;
    node.confidence = Math.min(1.0, (node.confidence || 0.5) + 0.1);

    if (!node.properties.validatedBy) {
      node.properties.validatedBy = [];
    }
    if (!node.properties.validatedBy.includes(actorId)) {
      node.properties.validatedBy.push(actorId);
    }

    this.updateNode(nodeId, node);
    this.logger.info(`Node ${nodeId} validated by ${actorId}. New confidence: ${node.confidence}`);
    return node;
  }

  /**
   * Export the graph to a JSON-serializable object
   */
  toJSON(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Create a knowledge graph from a JSON representation
   */
  static fromJSON(
    data: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] },
    options?: KnowledgeGraphOptions,
    logger?: MyLogger,
  ): KnowledgeGraph {
    if (!logger) {
      throw new Error('Logger is required for KnowledgeGraph.fromJSON');
    }

    logger.info(
      `Creating knowledge graph from JSON (${data.nodes.length} nodes, ${data.edges.length} edges)`,
      KnowledgeGraph.name,
    );
    const graph = new KnowledgeGraph(options, logger);

    // First add all nodes
    for (const nodeData of data.nodes) {
      graph.nodes.set(nodeData.id, {
        ...nodeData,
        createdAt: new Date(nodeData.createdAt),
        lastUpdated: new Date(nodeData.lastUpdated),
      });

      // Setup indexes
      if (!graph.nodesByType.has(nodeData.type)) {
        graph.nodesByType.set(nodeData.type, new Set());
      }
      graph.nodesByType.get(nodeData.type)!.add(nodeData.id);

      // Initialize edge collections
      graph.outgoingEdges.set(nodeData.id, new Set());
      graph.incomingEdges.set(nodeData.id, new Set());
    }

    // Then add all edges
    for (const edgeData of data.edges) {
      graph.edges.set(edgeData.id, {
        ...edgeData,
        createdAt: new Date(edgeData.createdAt),
        lastUpdated: new Date(edgeData.lastUpdated),
      });

      // Setup indexes
      if (!graph.edgesByType.has(edgeData.type)) {
        graph.edgesByType.set(edgeData.type, new Set());
      }
      graph.edgesByType.get(edgeData.type)!.add(edgeData.id);

      // Update connections
      graph.outgoingEdges.get(edgeData.sourceId)?.add(edgeData.id);
      graph.incomingEdges.get(edgeData.targetId)?.add(edgeData.id);
    }

    logger.info(
      `Successfully created knowledge graph from JSON with ${graph.getAllNodes().length} nodes and ${graph.getAllEdges().length} edges`,
      KnowledgeGraph.name,
    );
    return graph;
  }
}
