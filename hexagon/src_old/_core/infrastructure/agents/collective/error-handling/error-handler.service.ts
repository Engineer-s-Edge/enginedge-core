import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveTask, CollectiveTaskDocument } from '../entities/collective-task.entity';
import { Collective, CollectiveDocument } from '../entities/collective.entity';
import { CollectiveEvent, CollectiveEventDocument, EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { CommunicationService } from '../communication/communication.service';
import { PMToolsService } from '../services/pm-tools.service';

/**
 * ErrorHandlerService
 * 
 * Intelligent error handling for Collective Agent system.
 * 
 * Responsibilities:
 * - Detect and classify errors
 * - Provide troubleshooting guidance to agents
 * - Decide when to retry vs. cancel vs. escalate
 * - Track error patterns
 * - Generate error reports
 * 
 * Error Types:
 * - task_failure: Task execution failed
 * - agent_crash: Agent stopped responding
 * - dependency_error: Dependency unavailable
 * - timeout_error: Task exceeded time limit
 * - validation_error: Output doesn't meet acceptance criteria
 * - resource_error: Insufficient resources
 */
@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);

  // Error tracking
  private readonly errorHistory = new Map<string, ErrorRecord[]>(); // taskId -> errors
  private readonly MAX_ERROR_HISTORY = 100;

  // Retry thresholds
  private readonly MAX_TASK_RETRIES = 3;
  private readonly RETRY_DELAYS_MS = [5000, 15000, 30000]; // 5s, 15s, 30s

  constructor(
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    @InjectModel(CollectiveEvent.name) private eventModel: Model<CollectiveEventDocument>,
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
    private readonly communication: CommunicationService,
    private readonly pmTools: PMToolsService,
  ) {}

  /**
   * Handle a task failure.
   */
  async handleTaskFailure(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
    error: {
      type: string;
      message: string;
      stack?: string;
      agentId?: string;
    },
  ): Promise<{
    action: 'retry' | 'cancel' | 'escalate' | 'reassign';
    reason: string;
  }> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // Record error
    this.recordError(taskId.toString(), error);

    // Classify error
    const classification = this.classifyError(error);

    // Log error event
    await this.eventsRepo.create({
      collectiveId: collectiveId as any,
      type: EventType.TASK_FAILED,
      actorId: error.agentId || 'system',
      actorType: ActorType.AGENT,
      timestamp: new Date(),
      targetType: TargetType.TASK,
      targetId: taskId.toString(),
      description: `Task failed: ${error.message}`,
      metadata: {
        errorType: classification.type,
        errorMessage: error.message,
        severity: classification.severity,
      },
    });

    // Determine action based on error type and history
    const errorCount = this.getErrorCount(taskId.toString());
    const action = this.determineErrorAction(classification, errorCount, task);

    this.logger.log(
      `Task ${taskId} failed (${classification.type}). Action: ${action.action}. Reason: ${action.reason}`,
    );

    // Execute action
    await this.executeErrorAction(collectiveId, task, action, error);

    return action;
  }

  /**
   * Provide troubleshooting guidance to an agent.
   */
  async provideTroubleshootingGuidance(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
    error: {
      type: string;
      message: string;
    },
  ): Promise<string> {
    const classification = this.classifyError(error);
    const guidance = this.generateGuidance(classification, error);

    // Send guidance to agent
    const task = await this.taskModel.findById(taskId);
    if (task && task.assignedAgentId) {
      await this.communication.pmDirective(
        collectiveId,
        task.assignedAgentId,
        guidance,
        { taskId: taskId.toString() },
      );
    }

    return guidance;
  }

  /**
   * Check if a task should be retried.
   */
  async shouldRetryTask(taskId: string | Types.ObjectId): Promise<boolean> {
    const errorCount = this.getErrorCount(taskId.toString());
    return errorCount < this.MAX_TASK_RETRIES;
  }

  /**
   * Retry a failed task with optional modifications.
   */
  async retryTask(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
    options: {
      newAgentId?: string;
      modifiedDescription?: string;
      additionalHints?: string[];
    } = {},
  ): Promise<void> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const errorCount = this.getErrorCount(taskId.toString());

    // Build retry hints
    const hints = options.additionalHints || [];
    const previousErrors = this.getErrorHistory(taskId.toString());
    hints.push(`Previous attempt failed: ${previousErrors[previousErrors.length - 1]?.message}`);

    // Reassign if different agent specified
    if (options.newAgentId && options.newAgentId !== task.assignedAgentId) {
      await this.pmTools.reassignTask({
        collectiveId: collectiveId as any,
        taskId: taskId as any,
        fromAgentId: task.assignedAgentId || '',
        toAgentId: options.newAgentId,
        reason: `Retry with different agent (attempt ${errorCount + 1}/${this.MAX_TASK_RETRIES})`,
      });
    }

    // Update task with hints
    await this.pmTools.retryTaskWithHints({
      collectiveId: collectiveId as any,
      taskId: taskId as any,
      agentId: task.assignedAgentId || 'system',
      hints: hints.join('\n'),
      retryStrategy: 'same_approach',
    });

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Retrying task "${task.title}" (attempt ${errorCount + 1}/${this.MAX_TASK_RETRIES})`,
      { priority: 'NORMAL' },
    );

    this.logger.log(`Retrying task ${taskId} (attempt ${errorCount + 1})`);
  }

  /**
   * Get error statistics for a collective.
   */
  async getErrorStats(collectiveId: string | Types.ObjectId): Promise<{
    totalErrors: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byAgent: Record<string, number>;
    mostCommonError: string;
    errorRate: number;
  }> {
    const events = await this.eventModel
      .find({
        collectiveId,
        type: 'task_failed',
      })
      .exec();

    const stats = {
      totalErrors: events.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byAgent: {} as Record<string, number>,
      mostCommonError: '',
      errorRate: 0,
    };

    // Count by type, severity, agent
    for (const event of events) {
      const errorType = event.metadata?.errorType || 'unknown';
      const severity = event.metadata?.severity || 'unknown';
      const agent = event.actorId || 'unknown';

      stats.byType[errorType] = (stats.byType[errorType] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
      stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;
    }

    // Find most common error
    const sortedTypes = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
    stats.mostCommonError = sortedTypes[0]?.[0] || 'none';

    // Calculate error rate
    const allTasks = await this.taskModel.countDocuments({ collectiveId });
    stats.errorRate = allTasks > 0 ? events.length / allTasks : 0;

    return stats;
  }

  /**
   * Generate error report for PM review.
   */
  async generateErrorReport(collectiveId: string | Types.ObjectId): Promise<string> {
    const stats = await this.getErrorStats(collectiveId);

    let report = `# Error Report\n\n`;
    report += `**Total Errors:** ${stats.totalErrors}\n`;
    report += `**Error Rate:** ${(stats.errorRate * 100).toFixed(2)}%\n\n`;

    report += `## Errors by Type\n`;
    for (const [type, count] of Object.entries(stats.byType)) {
      report += `- ${type}: ${count}\n`;
    }

    report += `\n## Errors by Severity\n`;
    for (const [severity, count] of Object.entries(stats.bySeverity)) {
      report += `- ${severity}: ${count}\n`;
    }

    report += `\n## Errors by Agent\n`;
    for (const [agent, count] of Object.entries(stats.byAgent)) {
      report += `- ${agent}: ${count}\n`;
    }

    report += `\n**Most Common Error:** ${stats.mostCommonError}\n`;

    return report;
  }

  /**
   * Classify an error.
   */
  private classifyError(error: { type: string; message: string }): {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recoverable: boolean;
  } {
    const message = error.message.toLowerCase();

    // Critical errors
    if (message.includes('crash') || message.includes('segfault')) {
      return { type: 'agent_crash', severity: 'critical', recoverable: false };
    }

    if (message.includes('out of memory') || message.includes('disk full')) {
      return { type: 'resource_error', severity: 'critical', recoverable: false };
    }

    // High severity errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return { type: 'timeout_error', severity: 'high', recoverable: true };
    }

    if (message.includes('dependency') || message.includes('not found')) {
      return { type: 'dependency_error', severity: 'high', recoverable: true };
    }

    // Medium severity errors
    if (message.includes('validation') || message.includes('invalid')) {
      return { type: 'validation_error', severity: 'medium', recoverable: true };
    }

    if (message.includes('permission') || message.includes('access denied')) {
      return { type: 'permission_error', severity: 'medium', recoverable: true };
    }

    // Low severity (default)
    return { type: 'task_failure', severity: 'low', recoverable: true };
  }

  /**
   * Determine action to take based on error and history.
   */
  private determineErrorAction(
    classification: { type: string; severity: string; recoverable: boolean },
    errorCount: number,
    _task: CollectiveTaskDocument,
  ): { action: 'retry' | 'cancel' | 'escalate' | 'reassign'; reason: string } {
    // Critical errors: Escalate immediately
    if (classification.severity === 'critical') {
      return {
        action: 'escalate',
        reason: `Critical error (${classification.type}) requires human intervention`,
      };
    }

    // Non-recoverable errors: Cancel
    if (!classification.recoverable) {
      return {
        action: 'cancel',
        reason: `Error is not recoverable (${classification.type})`,
      };
    }

    // Max retries exceeded: Escalate
    if (errorCount >= this.MAX_TASK_RETRIES) {
      return {
        action: 'escalate',
        reason: `Task failed ${errorCount} times, escalating to human`,
      };
    }

    // Agent crash: Reassign
    if (classification.type === 'agent_crash') {
      return {
        action: 'reassign',
        reason: 'Agent crashed, reassigning to different agent',
      };
    }

    // Default: Retry
    return {
      action: 'retry',
      reason: `Retryable error (${classification.type}), attempt ${errorCount + 1}/${this.MAX_TASK_RETRIES}`,
    };
  }

  /**
   * Execute the determined error action.
   */
  private async executeErrorAction(
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    action: { action: string; reason: string },
    error: any,
  ): Promise<void> {
    switch (action.action) {
      case 'retry':
        await this.scheduleRetry(collectiveId, task, error);
        break;

      case 'cancel':
        await this.pmTools.cancelTask({
          collectiveId: collectiveId as any,
          taskId: task._id as any,
          reason: action.reason,
        });
        break;

      case 'escalate':
        await this.escalateError(collectiveId, task, error, action.reason);
        break;

      case 'reassign':
        await this.reassignAfterError(collectiveId, task, error);
        break;
    }
  }

  /**
   * Schedule a retry for a failed task.
   */
  private async scheduleRetry(
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    error: any,
  ): Promise<void> {
    const taskId = task._id as Types.ObjectId;
    const errorCount = this.getErrorCount(taskId.toString());
    const delay = this.RETRY_DELAYS_MS[errorCount] || this.RETRY_DELAYS_MS[this.RETRY_DELAYS_MS.length - 1];

    // Schedule retry (in real implementation, use a job queue)
    setTimeout(async () => {
      await this.retryTask(collectiveId, taskId, {
        additionalHints: [`Previous error: ${error.message}`],
      });
    }, delay);

    this.logger.log(`Scheduled retry for task ${taskId} in ${delay}ms`);
  }

  /**
   * Escalate error to PM/human.
   */
  private async escalateError(
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    error: any,
    reason: string,
  ): Promise<void> {
    const taskId = task._id as Types.ObjectId;
    const errorHistory = this.getErrorHistory(taskId.toString());
    const summary = this.buildErrorSummary(task, errorHistory);

    await this.communication.escalateToPM(
      collectiveId,
      error.agentId || 'system',
      `TASK FAILURE ESCALATION\n\nTask: "${task.title}"\nReason: ${reason}\n\n${summary}`,
      {
        taskId: taskId.toString(),
        reason,
        metadata: {
          errorCount: errorHistory.length,
          errorTypes: errorHistory.map(e => e.type),
        },
      },
    );

    this.logger.warn(`Escalated error for task ${task._id} to PM`);
  }

  /**
   * Reassign task after error.
   */
  private async reassignAfterError(
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    error: any,
  ): Promise<void> {
    // Find different agent
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) return;

    const currentAgentId = task.assignedAgentId;
    if (!currentAgentId) {
      this.logger.warn('Cannot reassign task with no assigned agent');
      return;
    }

    const availableAgent = collective.agents.find(
      agent => agent.id !== currentAgentId && agent.status === 'idle',
    );

    if (!availableAgent) {
      // No available agent, escalate instead
      await this.escalateError(collectiveId, task, error, 'No available agent for reassignment');
      return;
    }

    await this.pmTools.reassignTask({
      collectiveId: collectiveId as any,
      taskId: task._id as any,
      fromAgentId: currentAgentId,
      toAgentId: availableAgent.id,
      reason: `Reassigned due to error: ${error.message}`,
    });

    this.logger.log(`Reassigned task ${task._id} to ${availableAgent.id} after error`);
  }

  /**
   * Generate troubleshooting guidance.
   */
  private generateGuidance(
    classification: { type: string; severity: string },
    error: { message: string },
  ): string {
    let guidance = `**Troubleshooting Guidance for ${classification.type}:**\n\n`;

    switch (classification.type) {
      case 'timeout_error':
        guidance += `1. Check if the task is too complex and needs to be broken down\n`;
        guidance += `2. Verify network connectivity if using external APIs\n`;
        guidance += `3. Increase timeout limits if appropriate\n`;
        guidance += `4. Consider asking PM for help if stuck\n`;
        break;

      case 'dependency_error':
        guidance += `1. Verify that dependent resources exist and are accessible\n`;
        guidance += `2. Check if dependencies need to be installed or configured\n`;
        guidance += `3. Review task dependencies and ensure they're up to date\n`;
        guidance += `4. Ask PM if dependencies can be provided differently\n`;
        break;

      case 'validation_error':
        guidance += `1. Review the acceptance criteria carefully\n`;
        guidance += `2. Check that output format matches requirements\n`;
        guidance += `3. Verify data types and value ranges\n`;
        guidance += `4. Ask PM to clarify requirements if ambiguous\n`;
        break;

      case 'permission_error':
        guidance += `1. Check file/resource permissions\n`;
        guidance += `2. Verify authentication credentials\n`;
        guidance += `3. Request elevated permissions from PM if needed\n`;
        guidance += `4. Consider alternative approaches that don't require permission\n`;
        break;

      default:
        guidance += `1. Review the error message: "${error.message}"\n`;
        guidance += `2. Check logs for additional context\n`;
        guidance += `3. Try a different approach to the task\n`;
        guidance += `4. Ask PM for guidance if unsure how to proceed\n`;
    }

    return guidance;
  }

  /**
   * Build error summary for escalation.
   */
  private buildErrorSummary(
    task: CollectiveTaskDocument,
    errorHistory: ErrorRecord[],
  ): string {
    let summary = `**Task Details:**\n`;
    summary += `- ID: ${task._id}\n`;
    summary += `- Title: ${task.title}\n`;
    summary += `- Level: ${task.level}\n`;
    summary += `- State: ${task.state}\n`;
    summary += `- Assigned Agent: ${task.assignedAgentId || 'none'}\n\n`;

    summary += `**Error History (${errorHistory.length} errors):**\n`;
    errorHistory.slice(-5).forEach((error, idx) => {
      summary += `${idx + 1}. ${error.type}: ${error.message}\n`;
    });

    return summary;
  }

  /**
   * Record an error in history.
   */
  private recordError(taskId: string, error: any): void {
    let history = this.errorHistory.get(taskId) || [];
    history.push({
      type: error.type,
      message: error.message,
      timestamp: new Date(),
      agentId: error.agentId,
    });

    // Limit history size
    if (history.length > this.MAX_ERROR_HISTORY) {
      history = history.slice(-this.MAX_ERROR_HISTORY);
    }

    this.errorHistory.set(taskId, history);
  }

  /**
   * Get error count for a task.
   */
  private getErrorCount(taskId: string): number {
    const history = this.errorHistory.get(taskId) || [];
    return history.length;
  }

  /**
   * Get error history for a task.
   */
  private getErrorHistory(taskId: string): ErrorRecord[] {
    return this.errorHistory.get(taskId) || [];
  }

  /**
   * Clear error history (useful after collective completion).
   */
  clearErrorHistory(_collectiveId: string): void {
    // In a real implementation, you'd need to track which tasks belong to which collective
    // For now, this is a placeholder
    this.errorHistory.clear();
  }
}

interface ErrorRecord {
  type: string;
  message: string;
  timestamp: Date;
  agentId?: string;
}
