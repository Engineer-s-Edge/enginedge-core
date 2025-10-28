import { TopicIdType, GeniusAgentIdType } from '@core/infrastructure/database/utils/custom_types';
import { ExpertReport } from './expert-pool.types';

/**
 * Learning Mode Types
 * 
 * Type definitions for Genius Agent's 3 learning modes:
 * - User-Directed: User explicitly selects topics
 * - Autonomous: Agent auto-selects high-priority topics
 * - Scheduled: Cron-based automated research cycles
 */

/**
 * Learning mode enumeration
 */
export enum LearningMode {
  USER_DIRECTED = 'user-directed',
  AUTONOMOUS = 'autonomous',
  SCHEDULED = 'scheduled',
}

/**
 * Configuration for User-Directed learning mode
 */
export interface UserDirectedConfig {
  /** User ID who selected the topics */
  userId: string;
  
  /** List of topic IDs to research */
  topicIds: TopicIdType[];
  
  /** Priority order (higher = research first) */
  priority?: number;
  
  /** Max concurrent experts for this session */
  maxConcurrentExperts?: number;
  
  /** Whether to wait for all topics to complete */
  waitForCompletion?: boolean;
}

/**
 * Configuration for Autonomous learning mode
 */
export interface AutonomousConfig {
  /** How many topics to pull per cycle */
  batchSize: number;
  
  /** Minimum priority threshold (0-100) */
  minPriority?: number;
  
  /** Target category distribution (category name → weight) */
  categoryWeights?: Record<string, number>;
  
  /** Max category distance from existing nodes */
  maxCategoryDistance?: number;
  
  /** Whether to prefer organic discoveries */
  preferOrganic?: boolean;
  
  /** Max concurrent experts */
  maxConcurrentExperts?: number;
  
  /** Stop after this many completed topics (0 = unlimited) */
  stopAfter?: number;
}

/**
 * Configuration for Scheduled learning mode
 */
export interface ScheduledConfig {
  /** Cron expression for schedule (e.g., "0 2 * * *" = 2am daily) */
  cronExpression: string;
  
  /** Whether the schedule is active */
  enabled: boolean;
  
  /** Batch size per scheduled run */
  batchSize: number;
  
  /** Category preferences for scheduled runs */
  categoryWeights?: Record<string, number>;
  
  /** Min priority threshold */
  minPriority?: number;
  
  /** Max concurrent experts per run */
  maxConcurrentExperts?: number;
  
  /** Time budget per run (ms) */
  timeBudgetMs?: number;
}

/**
 * Result of a learning session
 */
export interface LearningSessionResult {
  /** Session ID */
  sessionId: string;
  
  /** Learning mode used */
  mode: LearningMode;
  
  /** Genius Agent ID */
  geniusAgentId: GeniusAgentIdType;
  
  /** Session start time */
  startTime: Date;
  
  /** Session end time */
  endTime: Date;
  
  /** Total duration in milliseconds */
  durationMs: number;
  
  /** Topics attempted */
  topicsAttempted: number;
  
  /** Topics completed successfully */
  topicsCompleted: number;
  
  /** Topics that failed */
  topicsFailed: number;
  
  /** Topics that timed out */
  topicsTimedOut: number;
  
  /** Topics that escalated */
  topicsEscalated: number;
  
  /** Expert reports for all topics */
  expertReports: ExpertReport[];
  
  /** New nodes added to knowledge graph */
  nodesAdded: number;
  
  /** New edges added to knowledge graph */
  edgesAdded: number;
  
  /** Graph components merged */
  componentsMerged: number;
  
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Status of a scheduled learning job
 */
export interface ScheduledJobStatus {
  /** Job ID */
  jobId: string;
  
  /** Schedule config */
  config: ScheduledConfig;
  
  /** Last run time */
  lastRun?: Date;
  
  /** Next scheduled run time */
  nextRun: Date;
  
  /** Whether job is currently running */
  isRunning: boolean;
  
  /** Last session result */
  lastResult?: LearningSessionResult;
  
  /** Total runs completed */
  totalRuns: number;
  
  /** Total topics researched */
  totalTopicsResearched: number;
}

/**
 * Request to start a learning session
 */
export interface StartLearningRequest {
  /** Learning mode to use */
  mode: LearningMode;
  
  /** Config specific to the mode */
  config: UserDirectedConfig | AutonomousConfig | ScheduledConfig;
  
  /** Optional session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Topic selection criteria for autonomous mode
 */
export interface TopicSelectionCriteria {
  /** Min priority score */
  minPriority: number;
  
  /** Max topics to select */
  limit: number;
  
  /** Preferred categories */
  preferredCategories?: string[];
  
  /** Category weights */
  categoryWeights?: Record<string, number>;
  
  /** Max distance from existing graph */
  maxCategoryDistance?: number;
  
  /** Include organic discoveries */
  includeOrganic?: boolean;
  
  /** Exclude recently researched (within X hours) */
  excludeRecentlyResearched?: number;
}

/**
 * Statistics for learning activities
 */
export interface LearningStatistics {
  /** Total learning sessions */
  totalSessions: number;
  
  /** Sessions by mode */
  sessionsByMode: Record<LearningMode, number>;
  
  /** Total topics researched */
  totalTopicsResearched: number;
  
  /** Success rate (0-1) */
  successRate: number;
  
  /** Average session duration (ms) */
  avgSessionDurationMs: number;
  
  /** Average topics per session */
  avgTopicsPerSession: number;
  
  /** Total knowledge nodes added */
  totalNodesAdded: number;
  
  /** Total edges added */
  totalEdgesAdded: number;
  
  /** Graph coverage by category */
  categoryDistribution: Record<string, number>;
}
