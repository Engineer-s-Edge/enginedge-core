/**
 * Genius Agent API DTOs
 * 
 * Request/response types for the Genius Agent REST API.
 */

import {
  EscalationStatus,
  EscalationType,
  EscalationPriority,
  UserResponse,
} from '@core/infrastructure/agents/components/knowledge/types/escalation.types';
import { ICSLayer } from '@core/infrastructure/agents/components/knowledge/base';

// ========================================
// Learning Control DTOs
// ========================================

export class StartUserDirectedLearningDto {
  topicIds!: string[];
  maxConcurrentExperts?: number;
  waitForCompletion?: boolean;
}

export class StartAutonomousLearningDto {
  batchSize?: number;
  minPriority?: number;
  maxConcurrentExperts?: number;
  preferOrganic?: boolean;
  categoryWeights?: Record<string, number>;
  maxCategoryDistance?: number;
}

export class CreateScheduleDto {
  name!: string;
  cronExpression!: string;
  enabled!: boolean;
  batchSize?: number;
  minPriority?: number;
  timeBudgetMinutes?: number;
  preferOrganic?: boolean;
  categoryWeights?: Record<string, number>;
  maxCategoryDistance?: number;
}

export class UpdateScheduleDto {
  cronExpression?: string;
  enabled?: boolean;
  batchSize?: number;
  minPriority?: number;
  timeBudgetMinutes?: number;
}

// ========================================
// Topic Management DTOs
// ========================================

export class AddTopicDto {
  name!: string;
  category!: string;
  description?: string;
  complexity?: ICSLayer;
}

export class SeedTopicsDto {
  categories!: string[];
  limit?: number;
}

export class QueryTopicsDto {
  status?: string | string[];
  category?: string;
  minPriority?: number;
  limit?: number;
}

// ========================================
// Escalation DTOs
// ========================================

export class QueryEscalationsDto {
  status?: EscalationStatus | EscalationStatus[];
  type?: EscalationType | EscalationType[];
  priority?: EscalationPriority | EscalationPriority[];
  topicId?: string;
  includeExpired?: boolean;
  limit?: number;
}

export class ResolveEscalationDto implements UserResponse {
  respondedAt!: Date;
  decision!: 'approve' | 'reject' | 'modify' | 'skip' | 'needs-more-info';
  comments?: string;
  modifiedData?: any;
  continueResearch!: boolean;
  flagForReview?: boolean;
}

export class CancelEscalationDto {
  reason?: string;
}

// ========================================
// Response DTOs
// ========================================

export class LearningStatusResponse {
  isLearning!: boolean;
  currentSession?: {
    startTime: Date;
    topicsAttempted: number;
    topicsCompleted: number;
    expertReports: any[];
  };
  expertPoolStats?: {
    activeExperts: number;
    totalExpertsSpawned: number;
    totalTopicsCompleted: number;
    totalTopicsFailed: number;
    averageCompletionTimeMs: number;
  };
}

export class StatisticsResponse {
  geniusAgentId!: string;
  expertPoolStats?: any;
  validationStats?: any;
  topicCatalogStats?: any;
  knowledgeGraphStats?: any;
  newsIntegrationStats?: any;
  escalationStats?: any;
}

export class JobStatusResponse {
  jobId!: string;
  name!: string;
  cronExpression!: string;
  enabled!: boolean;
  isRunning!: boolean;
  lastRun?: Date;
  nextRun?: Date;
  totalRuns!: number;
  totalTopicsResearched!: number;
}
