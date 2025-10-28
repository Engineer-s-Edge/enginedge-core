import { ExpertAgentIdType, KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';
import { ExpertReport } from './expert-pool.types';

/**
 * Validation Types
 * 
 * Type definitions for the Validation Service that reviews Expert Agent work
 * for quality, accuracy, and consistency.
 */

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Types of validation checks
 */
export enum ValidationCheckType {
  // Content quality checks
  HALLUCINATION_DETECTION = 'hallucination-detection',
  SOURCE_VERIFICATION = 'source-verification',
  FACT_CONSISTENCY = 'fact-consistency',
  LOGICAL_COHERENCE = 'logical-coherence',
  
  // Knowledge graph checks
  DUPLICATE_DETECTION = 'duplicate-detection',
  RELATIONSHIP_VALIDITY = 'relationship-validity',
  CATEGORY_CONSISTENCY = 'category-consistency',
  COMPLEXITY_MATCH = 'complexity-match',
  
  // Research quality checks
  SOURCE_QUALITY = 'source-quality',
  COVERAGE_COMPLETENESS = 'coverage-completeness',
  CITATION_ACCURACY = 'citation-accuracy',
  BIAS_DETECTION = 'bias-detection',
}

/**
 * Result of a single validation check
 */
export interface ValidationIssue {
  /** Type of check that found this issue */
  checkType: ValidationCheckType;
  
  /** Severity level */
  severity: ValidationSeverity;
  
  /** Human-readable description */
  message: string;
  
  /** Affected knowledge node (if applicable) */
  affectedNodeId?: KnowledgeNodeIdType;
  
  /** Specific field/property that has the issue */
  affectedField?: string;
  
  /** Current (problematic) value */
  currentValue?: unknown;
  
  /** Suggested fix or correction */
  suggestedFix?: unknown;
  
  /** Confidence in this issue (0-1) */
  confidence: number;
  
  /** Additional context */
  details?: Record<string, unknown>;
}

/**
 * Validation result for an expert's work
 */
export interface ValidationResult {
  /** Expert whose work was validated */
  expertId: ExpertAgentIdType;
  
  /** Timestamp of validation */
  validatedAt: Date;
  
  /** Duration of validation (ms) */
  validationDurationMs: number;
  
  /** Overall validation status */
  status: 'passed' | 'passed-with-warnings' | 'failed' | 'needs-review';
  
  /** All issues found */
  issues: ValidationIssue[];
  
  /** Issues by severity */
  issuesBySeverity: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
  
  /** Overall confidence score (0-1) */
  overallConfidence: number;
  
  /** Quality score (0-100) */
  qualityScore: number;
  
  /** Whether manual review is recommended */
  requiresManualReview: boolean;
  
  /** Reason for manual review (if applicable) */
  reviewReason?: string;
  
  /** Automated fixes applied */
  autoFixesApplied?: Array<{
    issue: ValidationIssue;
    fixApplied: unknown;
    success: boolean;
  }>;
}

/**
 * Configuration for validation service
 */
export interface ValidationConfig {
  /** Enabled validation check types */
  enabledChecks: ValidationCheckType[];
  
  /** Minimum confidence threshold for flagging issues (0-1) */
  minConfidenceThreshold: number;
  
  /** Whether to auto-fix issues where possible */
  autoFixEnabled: boolean;
  
  /** Severity threshold for blocking (e.g., block on ERROR and above) */
  blockingSeverity: ValidationSeverity;
  
  /** Whether to delegate SKIN phase validation to ValidationAgent */
  useSkinValidationAgent: boolean;
  
  /** LLM model to use for validation */
  llmModel?: string;
  
  /** Timeout for validation (ms) */
  timeout: number;
}

/**
 * Source verification result
 */
export interface SourceVerificationResult {
  /** Source URL */
  sourceUrl: string;
  
  /** Whether source is accessible */
  accessible: boolean;
  
  /** HTTP status code (if applicable) */
  statusCode?: number;
  
  /** Whether source content matches claims */
  contentMatches: boolean;
  
  /** Confidence in match (0-1) */
  matchConfidence: number;
  
  /** Source quality score (0-100) */
  qualityScore: number;
  
  /** Source type categorization */
  sourceType: 'academic' | 'news' | 'blog' | 'wiki' | 'government' | 'commercial' | 'unknown';
  
  /** Issues with source */
  issues: string[];
}

/**
 * Hallucination detection result
 */
export interface HallucinationCheck {
  /** Text being checked */
  text: string;
  
  /** Whether hallucination detected */
  isHallucination: boolean;
  
  /** Confidence in detection (0-1) */
  confidence: number;
  
  /** Type of hallucination */
  hallucinationType?: 'factual' | 'logical' | 'temporal' | 'statistical' | 'referential';
  
  /** Explanation */
  explanation: string;
  
  /** Supporting evidence (if available) */
  evidence?: string[];
}

/**
 * Fact consistency check result
 */
export interface FactConsistencyCheck {
  /** Fact statement */
  fact: string;
  
  /** Related facts from knowledge graph */
  relatedFacts: Array<{
    nodeId: KnowledgeNodeIdType;
    fact: string;
    similarity: number;
  }>;
  
  /** Whether fact is consistent */
  isConsistent: boolean;
  
  /** Confidence (0-1) */
  confidence: number;
  
  /** Conflicts detected */
  conflicts: Array<{
    conflictingNodeId: KnowledgeNodeIdType;
    conflictingFact: string;
    conflictType: 'direct-contradiction' | 'temporal-mismatch' | 'value-mismatch' | 'logical-inconsistency';
  }>;
}

/**
 * Request to validate expert work
 */
export interface ValidateExpertWorkRequest {
  /** Expert report to validate */
  expertReport: ExpertReport;
  
  /** Optional custom config for this validation */
  config?: Partial<ValidationConfig>;
  
  /** Whether to apply auto-fixes */
  applyFixes?: boolean;
}

/**
 * Batch validation request
 */
export interface BatchValidationRequest {
  /** Multiple expert reports */
  expertReports: ExpertReport[];
  
  /** Config for all validations */
  config?: Partial<ValidationConfig>;
  
  /** Max concurrent validations */
  maxConcurrent?: number;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  /** Total reports validated */
  totalReports: number;
  
  /** Individual results */
  results: ValidationResult[];
  
  /** Aggregate statistics */
  aggregateStats: {
    passed: number;
    passedWithWarnings: number;
    failed: number;
    needsReview: number;
    averageQualityScore: number;
    averageConfidence: number;
    totalIssues: number;
  };
  
  /** Duration of batch validation (ms) */
  totalDurationMs: number;
}

/**
 * Validation statistics
 */
export interface ValidationStatistics {
  /** Total validations performed */
  totalValidations: number;
  
  /** Validations by status */
  validationsByStatus: {
    passed: number;
    passedWithWarnings: number;
    failed: number;
    needsReview: number;
  };
  
  /** Issues by type */
  issuesByType: Record<ValidationCheckType, number>;
  
  /** Issues by severity */
  issuesBySeverity: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
  
  /** Average quality score */
  averageQualityScore: number;
  
  /** Average confidence */
  averageConfidence: number;
  
  /** Auto-fixes applied */
  totalAutoFixesApplied: number;
  
  /** Auto-fix success rate */
  autoFixSuccessRate: number;
}
