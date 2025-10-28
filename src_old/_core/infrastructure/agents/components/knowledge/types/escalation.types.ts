/**
 * Escalation System Types
 * 
 * Handles scenarios where Expert Agents need user involvement:
 * - Contradictions in knowledge graph
 * - Missing critical information
 * - Low quality research that can't be auto-fixed
 * - Complex decisions requiring human judgment
 * - Source verification failures
 */

import {
  EscalationIdType,
  ExpertAgentIdType,
  GeniusAgentIdType,
  TopicIdType,
  UserIdType,
  KnowledgeNodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { ValidationResult } from './validation.types';
import { ExpertReport } from './expert-pool.types';

/**
 * Escalation Status (State Machine)
 */
export enum EscalationStatus {
  /** Escalation detected but not yet notified to user */
  DETECTED = 'detected',
  
  /** User has been notified, awaiting response */
  NOTIFIED = 'notified',
  
  /** User is actively discussing/providing input */
  IN_DISCUSSION = 'in-discussion',
  
  /** User has resolved the issue */
  RESOLVED = 'resolved',
  
  /** Escalation was cancelled or dismissed */
  CANCELLED = 'cancelled',
  
  /** Research has resumed after resolution */
  BACK_TO_RESEARCH = 'back-to-research',
}

/**
 * Escalation Type (Why was this escalated?)
 */
export enum EscalationType {
  /** Contradiction detected in knowledge graph */
  CONTRADICTION = 'contradiction',
  
  /** Validation failed with critical errors */
  VALIDATION_FAILURE = 'validation-failure',
  
  /** Missing critical information to proceed */
  MISSING_INFORMATION = 'missing-information',
  
  /** Source verification failed */
  SOURCE_VERIFICATION = 'source-verification',
  
  /** Hallucination detected */
  HALLUCINATION = 'hallucination',
  
  /** Duplicate nodes that can't be automatically merged */
  DUPLICATE_CONFLICT = 'duplicate-conflict',
  
  /** Expert agent encountered an error */
  EXPERT_ERROR = 'expert-error',
  
  /** Quality score below acceptable threshold */
  LOW_QUALITY = 'low-quality',
  
  /** User manually requested escalation */
  USER_REQUESTED = 'user-requested',
}

/**
 * Escalation Priority
 */
export enum EscalationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Escalation Context
 * Additional information to help user understand the issue
 */
export interface EscalationContext {
  /** Topic being researched */
  topicId?: TopicIdType;
  topicName?: string;
  
  /** Expert agent that triggered escalation */
  expertAgentId?: ExpertAgentIdType;
  
  /** Genius agent managing the process */
  geniusAgentId?: GeniusAgentIdType;
  
  /** Related knowledge nodes */
  affectedNodeIds?: KnowledgeNodeIdType[];
  
  /** Validation result if applicable */
  validationResult?: ValidationResult;
  
  /** Expert report if applicable */
  expertReport?: ExpertReport;
  
  /** Error message if applicable */
  errorMessage?: string;
  errorStack?: string;
  
  /** Conflicting data */
  conflictingData?: {
    existing: any;
    proposed: any;
    reason: string;
  };
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * User Response to Escalation
 */
export interface UserResponse {
  /** Response timestamp */
  respondedAt: Date;
  
  /** User's decision */
  decision: 'approve' | 'reject' | 'modify' | 'skip' | 'needs-more-info';
  
  /** User's comments/instructions */
  comments?: string;
  
  /** Modified data if user chose 'modify' */
  modifiedData?: any;
  
  /** Should research continue? */
  continueResearch: boolean;
  
  /** Should this node/topic be flagged for future reference? */
  flagForReview?: boolean;
}

/**
 * Escalation Entity
 */
export interface Escalation {
  /** Unique escalation ID */
  escalationId: EscalationIdType;
  
  /** Current status */
  status: EscalationStatus;
  
  /** Type of escalation */
  type: EscalationType;
  
  /** Priority level */
  priority: EscalationPriority;
  
  /** User who should handle this */
  userId: UserIdType;
  
  /** Title/summary of the issue */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Context data */
  context: EscalationContext;
  
  /** User's response (when status = RESOLVED) */
  userResponse?: UserResponse;
  
  /** Status history */
  statusHistory: Array<{
    status: EscalationStatus;
    timestamp: Date;
    note?: string;
  }>;
  
  /** Timestamps */
  createdAt: Date;
  notifiedAt?: Date;
  resolvedAt?: Date;
  
  /** Auto-dismiss after this date if not resolved */
  expiresAt?: Date;
  
  /** Has user been notified via external channel? (email, slack, etc.) */
  externalNotificationSent?: boolean;
}

/**
 * Create Escalation DTO
 */
export interface CreateEscalationDto {
  type: EscalationType;
  priority: EscalationPriority;
  userId: UserIdType;
  title: string;
  description: string;
  context: EscalationContext;
  expiresAt?: Date;
}

/**
 * Update Escalation Status DTO
 */
export interface UpdateEscalationStatusDto {
  status: EscalationStatus;
  note?: string;
}

/**
 * Escalation Query Filters
 */
export interface EscalationQueryFilters {
  userId?: UserIdType;
  status?: EscalationStatus | EscalationStatus[];
  type?: EscalationType | EscalationType[];
  priority?: EscalationPriority | EscalationPriority[];
  topicId?: TopicIdType;
  geniusAgentId?: GeniusAgentIdType;
  createdAfter?: Date;
  createdBefore?: Date;
  includeExpired?: boolean;
}

/**
 * Escalation Statistics
 */
export interface EscalationStatistics {
  total: number;
  byStatus: Record<EscalationStatus, number>;
  byType: Record<EscalationType, number>;
  byPriority: Record<EscalationPriority, number>;
  averageResolutionTime: number; // milliseconds
  activeEscalations: number;
  expiredEscalations: number;
  resolutionRate: number; // percentage
}

/**
 * Notification Preferences
 */
export interface NotificationPreferences {
  /** Send email notifications? */
  email?: boolean;
  
  /** Send in-app notifications? */
  inApp?: boolean;
  
  /** Send Slack notifications? */
  slack?: boolean;
  
  /** Only notify for these priorities */
  priorityThreshold?: EscalationPriority;
  
  /** Only notify for these types */
  types?: EscalationType[];
  
  /** Quiet hours (no notifications) */
  quietHours?: {
    start: string; // HH:mm format
    end: string;
    timezone: string;
  };
}
