import { KnowledgeNode } from './knowledge-node.entity';
import { KnowledgeEdge } from './knowledge-edge.entity';

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
 * History entry for graph modifications (for rollback/audit)
 */
export interface GraphHistoryEntry {
  /** Unique ID for this history entry */
  id: string;

  /** Timestamp of the modification */
  timestamp: Date;

  /** Type of operation */
  operationType:
    | 'add_node'
    | 'update_node'
    | 'delete_node'
    | 'add_edge'
    | 'update_edge'
    | 'delete_edge'
    | 'skin_operation';

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
 * Options for configuring knowledge graph operations
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
