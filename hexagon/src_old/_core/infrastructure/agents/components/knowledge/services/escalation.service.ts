/**
 * Escalation Service
 * 
 * Manages user escalations for the Genius Agent system.
 * 
 * Key Responsibilities:
 * - Create escalations when Expert Agents need user input
 * - Track escalation state machine (detected → notified → in-discussion → resolved)
 * - Send notifications to users (in-app, email, Slack)
 * - Process user responses
 * - Trigger research continuation after resolution
 * - Generate escalation statistics
 * 
 * State Machine:
 * DETECTED → NOTIFIED → IN_DISCUSSION → RESOLVED → BACK_TO_RESEARCH
 *                ↓
 *            CANCELLED
 */

import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import {
  EscalationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { EscalationRepository } from '../repositories/escalation.repository';
import {
  Escalation,
  EscalationStatus,
  EscalationType,
  EscalationPriority,
  CreateEscalationDto,
  EscalationQueryFilters,
  EscalationStatistics,
  UserResponse,
} from '../types/escalation.types';
import { ValidationResult, ValidationSeverity } from '../types/validation.types';
import { ExpertReport } from '../types/expert-pool.types';

@Injectable()
export class EscalationService {
  constructor(
    private repository: EscalationRepository,
    private logger: MyLogger,
  ) {}

  // ========================================
  // Escalation Creation
  // ========================================

  /**
   * Create escalation from validation failure
   */
  async createFromValidation(
    userId: UserIdType,
    validationResult: ValidationResult,
    expertReport: ExpertReport,
  ): Promise<Escalation> {
    const priority = this.determinePriorityFromValidation(validationResult);

    const dto: CreateEscalationDto = {
      type: this.determineTypeFromValidation(validationResult),
      priority,
      userId,
      title: `Validation Failed: ${expertReport.topicResearched}`,
      description: this.buildValidationDescription(validationResult),
      context: {
        topicId: expertReport.topicId as any,
        topicName: expertReport.topicResearched,
        expertAgentId: expertReport.expertId,
        validationResult,
        expertReport,
        affectedNodeIds: validationResult.issues.map((i) => i.affectedNodeId).filter(Boolean) as any[],
      },
      expiresAt: this.calculateExpiration(priority),
    };

    return this.create(dto);
  }

  /**
   * Create escalation from expert error
   */
  async createFromExpertError(
    userId: UserIdType,
    expertReport: ExpertReport,
    error: Error,
  ): Promise<Escalation> {
    const info = getErrorInfo(error);

    const dto: CreateEscalationDto = {
      type: EscalationType.EXPERT_ERROR,
      priority: EscalationPriority.HIGH,
      userId,
      title: `Expert Agent Error: ${expertReport.topicResearched}`,
      description: `Expert Agent encountered an error while researching "${expertReport.topicResearched}".\n\nError: ${info.message}`,
      context: {
        topicId: expertReport.topicId as any,
        topicName: expertReport.topicResearched,
        expertAgentId: expertReport.expertId,
        expertReport,
        errorMessage: info.message,
        errorStack: info.stack,
      },
      expiresAt: this.calculateExpiration(EscalationPriority.HIGH),
    };

    return this.create(dto);
  }

  /**
   * Create manual escalation
   */
  async create(dto: CreateEscalationDto): Promise<Escalation> {
    this.logger.info(
      `Creating escalation: ${dto.type} (${dto.priority}) for user ${dto.userId}`,
      EscalationService.name,
    );

    const escalation = await this.repository.create(dto);

    // Auto-notify based on priority
    if (dto.priority === EscalationPriority.CRITICAL || dto.priority === EscalationPriority.HIGH) {
      await this.notifyUser(escalation.escalationId);
    }

    return escalation;
  }

  // ========================================
  // State Transitions
  // ========================================

  /**
   * Notify user about escalation
   */
  async notifyUser(escalationId: EscalationIdType): Promise<Escalation | null> {
    const escalation = await this.repository.findById(escalationId);
    if (!escalation) {
      this.logger.warn(`Escalation ${escalationId} not found`, EscalationService.name);
      return null;
    }

    if (escalation.status !== EscalationStatus.DETECTED) {
      this.logger.warn(
        `Escalation ${escalationId} already notified (status: ${escalation.status})`,
        EscalationService.name,
      );
      return escalation;
    }

    this.logger.info(`Notifying user about escalation ${escalationId}`, EscalationService.name);

    // Send notification (TODO: integrate with notification system)
    const notificationSent = await this.sendNotification(escalation);

    // Update status
    const updated = await this.repository.updateStatus(escalationId, {
      status: EscalationStatus.NOTIFIED,
      note: 'User notified',
    });

    if (updated) {
      await this.repository.markNotified(escalationId, notificationSent);
    }

    return updated;
  }

  /**
   * Mark escalation as in discussion
   */
  async startDiscussion(escalationId: EscalationIdType): Promise<Escalation | null> {
    return this.repository.updateStatus(escalationId, {
      status: EscalationStatus.IN_DISCUSSION,
      note: 'User started discussion',
    });
  }

  /**
   * Process user response
   */
  async resolveWithResponse(
    escalationId: EscalationIdType,
    userResponse: UserResponse,
  ): Promise<Escalation | null> {
    this.logger.info(
      `Resolving escalation ${escalationId} with decision: ${userResponse.decision}`,
      EscalationService.name,
    );

    const escalation = await this.repository.addUserResponse(escalationId, userResponse);

    if (escalation && userResponse.continueResearch) {
      // Move to BACK_TO_RESEARCH state
      await this.repository.updateStatus(escalationId, {
        status: EscalationStatus.BACK_TO_RESEARCH,
        note: 'Resuming research',
      });

      // TODO: Trigger research continuation (notify GeniusAgent)
      this.logger.info(
        `Research will continue for topic: ${escalation.context.topicName}`,
        EscalationService.name,
      );
    }

    return escalation;
  }

  /**
   * Cancel escalation
   */
  async cancel(escalationId: EscalationIdType, reason?: string): Promise<Escalation | null> {
    return this.repository.updateStatus(escalationId, {
      status: EscalationStatus.CANCELLED,
      note: reason || 'Cancelled by user',
    });
  }

  // ========================================
  // Queries
  // ========================================

  /**
   * Get escalation by ID
   */
  async getById(escalationId: EscalationIdType): Promise<Escalation | null> {
    return this.repository.findById(escalationId);
  }

  /**
   * Find escalations with filters
   */
  async find(filters: EscalationQueryFilters, limit = 100): Promise<Escalation[]> {
    return this.repository.findMany(filters, limit);
  }

  /**
   * Get active escalations for user
   */
  async getActiveForUser(userId: UserIdType, limit = 50): Promise<Escalation[]> {
    return this.repository.getActiveForUser(userId, limit);
  }

  /**
   * Get pending notifications (DETECTED status)
   */
  async getPendingNotifications(limit = 50): Promise<Escalation[]> {
    return this.repository.findMany(
      {
        status: EscalationStatus.DETECTED,
        includeExpired: false,
      },
      limit,
    );
  }

  /**
   * Get statistics
   */
  async getStatistics(userId?: UserIdType): Promise<EscalationStatistics> {
    return this.repository.getStatistics(userId);
  }

  // ========================================
  // Notifications (Placeholder)
  // ========================================

  /**
   * Send notification to user
   * TODO: Integrate with actual notification system
   */
  private async sendNotification(escalation: Escalation): Promise<boolean> {
    this.logger.info(
      `Sending notification for escalation ${escalation.escalationId}`,
      EscalationService.name,
    );

    // TODO: Implement notification logic
    // - In-app notification
    // - Email notification
    // - Slack notification
    // - Check user preferences

    return false; // Not implemented yet
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Determine escalation type from validation result
   */
  private determineTypeFromValidation(validationResult: ValidationResult): EscalationType {
    const criticalIssues = validationResult.issues.filter((i) => i.severity === ValidationSeverity.CRITICAL);

    // Check for specific issue types
    const hasHallucination = validationResult.issues.some((i) =>
      i.checkType.includes('hallucination'),
    );
    if (hasHallucination) {
      return EscalationType.HALLUCINATION;
    }

    const hasSourceIssue = validationResult.issues.some((i) =>
      i.checkType.includes('source'),
    );
    if (hasSourceIssue) {
      return EscalationType.SOURCE_VERIFICATION;
    }

    const hasDuplicate = validationResult.issues.some((i) =>
      i.checkType.includes('duplicate'),
    );
    if (hasDuplicate) {
      return EscalationType.DUPLICATE_CONFLICT;
    }

    return criticalIssues.length > 0
      ? EscalationType.VALIDATION_FAILURE
      : EscalationType.LOW_QUALITY;
  }

  /**
   * Determine priority from validation result
   */
  private determinePriorityFromValidation(
    validationResult: ValidationResult,
  ): EscalationPriority {
    const criticalCount = validationResult.issues.filter((i) => i.severity === ValidationSeverity.CRITICAL).length;
    const errorCount = validationResult.issues.filter((i) => i.severity === ValidationSeverity.ERROR).length;

    if (criticalCount > 0) {
      return EscalationPriority.CRITICAL;
    }

    if (errorCount > 2) {
      return EscalationPriority.HIGH;
    }

    if (validationResult.qualityScore < 50) {
      return EscalationPriority.HIGH;
    }

    if (validationResult.qualityScore < 70) {
      return EscalationPriority.MEDIUM;
    }

    return EscalationPriority.LOW;
  }

  /**
   * Build description from validation result
   */
  private buildValidationDescription(validationResult: ValidationResult): string {
    const lines: string[] = [
      `Validation Status: ${validationResult.status}`,
      `Quality Score: ${validationResult.qualityScore}/100`,
      '',
      'Issues:',
    ];

    validationResult.issues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.severity}] ${issue.message}`);
    });

    if (validationResult.requiresManualReview) {
      lines.push('');
      lines.push('⚠️ Manual review required');
    }

    return lines.join('\n');
  }

  /**
   * Calculate expiration date based on priority
   */
  private calculateExpiration(priority: EscalationPriority): Date {
    const now = new Date();
    const hours = {
      [EscalationPriority.CRITICAL]: 24, // 1 day
      [EscalationPriority.HIGH]: 72, // 3 days
      [EscalationPriority.MEDIUM]: 168, // 7 days
      [EscalationPriority.LOW]: 336, // 14 days
    };

    now.setHours(now.getHours() + hours[priority]);
    return now;
  }

  /**
   * Clean up old resolved escalations
   */
  async cleanup(daysOld = 90): Promise<number> {
    this.logger.info(
      `Cleaning up escalations older than ${daysOld} days`,
      EscalationService.name,
    );

    const deletedCount = await this.repository.deleteOldResolved(daysOld);

    this.logger.info(
      `Deleted ${deletedCount} old escalations`,
      EscalationService.name,
    );

    return deletedCount;
  }
}
