import {
  ExpertAgentIdType,
  KnowledgeNodeIdType,
  KnowledgeEdgeIdType,
} from '@core/infrastructure/database/utils/custom_types';

/**
 * Configuration for Expert Pool Manager
 */
export interface ExpertPoolConfig {
  /** Maximum number of experts that can run concurrently */
  maxConcurrentExperts: number;

  /** Maximum time an expert can run before timing out (ms) */
  expertTimeout: number;

  /** Maximum retry attempts for a topic before escalating */
  maxRetriesPerTopic: number;

  /** Maximum concurrent knowledge graph writes */
  knowledgeGraphWriteSemaphore: number;

  /** Enable detailed logging for debugging */
  verbose: boolean;
}

/**
 * Knowledge Graph modification record
 */
export interface KGModification {
  timestamp: Date;
  expertId: ExpertAgentIdType;
  operationType: 'create-node' | 'update-node' | 'create-edge' | 'add-research' | 'skin';
  nodeId?: KnowledgeNodeIdType;
  edgeId?: KnowledgeEdgeIdType;
  success: boolean;
  conflictResolution?: 'skipped' | 'merged' | 'overwritten' | 'retried';
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Expert work report
 */
export interface ExpertReport {
  expertId: ExpertAgentIdType;
  topicResearched: string;
  topicId?: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  modifications: KGModification[];
  sourcesUsed: number;
  avgConfidence: number;
  issuesEncountered: string[];
  escalationRequired: boolean;
  escalationReason?: string;
  status: 'completed' | 'failed' | 'timeout' | 'escalated';
  result?: any;
}

/**
 * Active expert tracking
 */
export interface ActiveExpert {
  expertId: ExpertAgentIdType;
  topic: string;
  topicId?: string;
  startTime: Date;
  timeout: NodeJS.Timeout;
  promise: Promise<ExpertReport>;
  abortController?: AbortController;
}

/**
 * Expert pool statistics
 */
export interface ExpertPoolStats {
  activeExperts: number;
  totalExpertsSpawned: number;
  totalTopicsCompleted: number;
  totalTopicsFailed: number;
  totalTimeout: number;
  totalEscalations: number;
  averageCompletionTimeMs: number;
  collisionCount: number;
  queuedRequests: number;
}

/**
 * Collision handling result
 */
export interface CollisionResult {
  handled: boolean;
  action: 'skipped' | 'waited' | 'merged' | 'failed';
  message: string;
}
