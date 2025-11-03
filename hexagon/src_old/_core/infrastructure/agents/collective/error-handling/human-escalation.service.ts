import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collective, CollectiveDocument, CollectiveStatus } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskDocument, TaskState } from '../entities/collective-task.entity';
import { CollectiveMessage, CollectiveMessageDocument } from '../entities/collective-message.entity';
import { CollectiveArtifact, CollectiveArtifactDocument } from '../entities/collective-artifact.entity';
import { CollectiveConversation, CollectiveConversationDocument } from '../entities/collective-conversation.entity';
import { EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import { CollectivesRepository } from '../repositories/collectives.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { CommunicationService } from '../communication/communication.service';

/**
 * HumanEscalationService
 * 
 * Handles situations that require human intervention.
 * 
 * Escalation Triggers:
 * - Deadlock unresolvable after max attempts
 * - Critical errors (crashes, data loss)
 * - Task failures exceeding retry limits
 * - Agent requests human guidance
 * - PM determines human input needed
 * - Ambiguous requirements
 * 
 * Escalation Process:
 * 1. Detect escalation condition
 * 2. Pause collective execution
 * 3. Build comprehensive context summary
 * 4. Notify human via CRITICAL message
 * 5. Wait for human response
 * 6. Integrate guidance
 * 7. Resume execution
 */
@Injectable()
export class HumanEscalationService {
  private readonly logger = new Logger(HumanEscalationService.name);

  // Escalation tracking
  private readonly activeEscalations = new Map<string, EscalationRecord>();
  private readonly MAX_ESCALATION_WAIT_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(CollectiveMessage.name) private messageModel: Model<CollectiveMessageDocument>,
    @InjectModel(CollectiveArtifact.name) private artifactModel: Model<CollectiveArtifactDocument>,
    @InjectModel(CollectiveConversation.name) private conversationModel: Model<CollectiveConversationDocument>,
    private readonly collectivesRepo: CollectivesRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
    private readonly communication: CommunicationService,
  ) {}

  /**
   * Escalate a situation to human.
   */
  async escalate(
    collectiveId: string | Types.ObjectId,
    escalation: {
      reason: string;
      type: 'deadlock' | 'error' | 'ambiguity' | 'decision' | 'resource';
      context: {
        taskId?: string;
        agentId?: string;
        details?: any;
      };
      urgency: 'low' | 'medium' | 'high' | 'critical';
    },
  ): Promise<{
    escalationId: string;
    status: 'pending' | 'resolved' | 'timeout';
  }> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error('Collective not found');
    }

    this.logger.warn(`Escalating to human: ${escalation.reason} (${escalation.type}, ${escalation.urgency})`);

    // Pause collective
    await this.pauseCollective(collectiveId, `Escalation: ${escalation.reason}`);

    // Build context summary
    const summary = await this.buildEscalationSummary(collectiveId, escalation);

    // Create escalation record
    const escalationId = new Types.ObjectId().toString();
    const record: EscalationRecord = {
      id: escalationId,
      collectiveId: collectiveId.toString(),
      reason: escalation.reason,
      type: escalation.type,
      urgency: escalation.urgency,
      summary,
      status: 'pending',
      createdAt: new Date(),
      resolvedAt: null,
      resolution: null,
    };
    this.activeEscalations.set(escalationId, record);

    // Log escalation event
    await this.eventsRepo.create({
      collectiveId: collectiveId as any,
      type: EventType.USER_INTERVENTION,
      actorId: 'system',
      actorType: ActorType.SYSTEM,
      timestamp: new Date(),
      targetType: TargetType.COLLECTIVE,
      targetId: collectiveId.toString(),
      description: `Human escalation: ${escalation.reason}`,
      metadata: {
        escalationType: escalation.type,
        urgency: escalation.urgency,
        reason: escalation.reason,
        escalationId,
      },
    });

    // Send CRITICAL message to PM
    await this.communication.pmBroadcast(
      collectiveId,
      this.formatEscalationMessage(escalation, summary),
      { priority: 'CRITICAL' },
    );

    // Set timeout
    this.setEscalationTimeout(escalationId);

    return {
      escalationId,
      status: 'pending',
    };
  }

  /**
   * Resolve an escalation with human guidance.
   */
  async resolve(
    escalationId: string,
    resolution: {
      guidance: string;
      actions?: Array<{
        type: 'cancel_task' | 'modify_task' | 'add_context' | 'change_agent' | 'adjust_priority';
        params: any;
      }>;
    },
  ): Promise<void> {
    const record = this.activeEscalations.get(escalationId);
    if (!record) {
      throw new Error('Escalation not found');
    }

    if (record.status !== 'pending') {
      throw new Error('Escalation already resolved or timed out');
    }

    this.logger.log(`Resolving escalation ${escalationId} with human guidance`);

    // Update record
    record.status = 'resolved';
    record.resolvedAt = new Date();
    record.resolution = resolution;

    // Log resolution event
    await this.eventsRepo.create({
      collectiveId: record.collectiveId as any,
      type: EventType.USER_INTERVENTION,
      actorId: 'human',
      actorType: ActorType.USER,
      timestamp: new Date(),
      targetType: TargetType.COLLECTIVE,
      targetId: record.collectiveId,
      description: 'Escalation resolved by human',
      metadata: {
        escalationId,
        guidance: resolution.guidance,
        actions: resolution.actions?.length || 0,
      },
    });

    // Execute actions
    if (resolution.actions) {
      await this.executeResolutionActions(record.collectiveId, resolution.actions);
    }

    // Send guidance to PM
    await this.communication.pmBroadcast(
      record.collectiveId,
      `**Human Guidance:** ${resolution.guidance}`,
      { priority: 'HIGH' },
    );

    // Resume collective
    await this.resumeCollective(record.collectiveId, resolution.guidance);

    // Clean up
    this.activeEscalations.delete(escalationId);
  }

  /**
   * Get active escalations for a collective.
   */
  async getActiveEscalations(collectiveId: string | Types.ObjectId): Promise<EscalationRecord[]> {
    const records = Array.from(this.activeEscalations.values()).filter(
      r => r.collectiveId === collectiveId.toString() && r.status === 'pending',
    );
    return records;
  }

  /**
   * Get escalation by ID.
   */
  async getEscalation(escalationId: string): Promise<EscalationRecord | null> {
    return this.activeEscalations.get(escalationId) || null;
  }

  /**
   * Cancel an escalation (if human decides to abort).
   */
  async cancelEscalation(escalationId: string, reason: string): Promise<void> {
    const record = this.activeEscalations.get(escalationId);
    if (!record) {
      throw new Error('Escalation not found');
    }

    this.logger.log(`Cancelling escalation ${escalationId}: ${reason}`);

    // Mark as resolved with cancellation
    record.status = 'resolved';
    record.resolvedAt = new Date();
    record.resolution = {
      guidance: `Escalation cancelled: ${reason}`,
      actions: [],
    };

    // Log cancellation
    await this.eventsRepo.create({
      collectiveId: record.collectiveId as any,
      type: EventType.USER_INTERVENTION,
      actorId: 'human',
      actorType: ActorType.USER,
      timestamp: new Date(),
      targetType: TargetType.COLLECTIVE,
      targetId: record.collectiveId,
      description: `Escalation cancelled: ${reason}`,
      metadata: {
        escalationId,
        reason,
      },
    });

    // Resume collective
    await this.resumeCollective(record.collectiveId, `Escalation cancelled: ${reason}`);

    // Clean up
    this.activeEscalations.delete(escalationId);
  }

  /**
   * Pause collective execution.
   */
  private async pauseCollective(collectiveId: string | Types.ObjectId, reason: string): Promise<void> {
    await this.collectivesRepo.updateStatus(collectiveId, CollectiveStatus.PAUSED);

    this.logger.log(`Paused collective ${collectiveId}: ${reason}`);
  }

  /**
   * Resume collective execution.
   */
  private async resumeCollective(collectiveId: string | Types.ObjectId, reason: string): Promise<void> {
    await this.collectivesRepo.updateStatus(collectiveId, CollectiveStatus.RUNNING);

    this.logger.log(`Resumed collective ${collectiveId}: ${reason}`);
  }

  /**
   * Build comprehensive escalation summary.
   */
  private async buildEscalationSummary(
    collectiveId: string | Types.ObjectId,
    escalation: any,
  ): Promise<string> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      return 'Collective not found';
    }

    let summary = `# Escalation Summary\n\n`;
    summary += `**Type:** ${escalation.type}\n`;
    summary += `**Urgency:** ${escalation.urgency}\n`;
    summary += `**Reason:** ${escalation.reason}\n\n`;

    // Collective overview
    summary += `## Collective Overview\n`;
    summary += `- **Vision:** ${collective.vision}\n`;
    summary += `- **Status:** ${collective.status}\n`;
    summary += `- **PM Agent:** ${collective.pmAgent.id}\n`;
    summary += `- **Total Agents:** ${collective.agents.length}\n\n`;

    // Task statistics
    const allTasks = await this.taskModel.find({ collectiveId }).exec();
    const taskStats = {
      total: allTasks.length,
      completed: allTasks.filter(t => t.state === TaskState.COMPLETED).length,
      inProgress: allTasks.filter(t => t.state === TaskState.IN_PROGRESS).length,
      unassigned: allTasks.filter(t => t.state === TaskState.UNASSIGNED).length,
      blocked: allTasks.filter(t => t.state === TaskState.BLOCKED).length,
      failed: allTasks.filter(t => t.state === TaskState.FAILED).length,
    };

    summary += `## Task Progress\n`;
    summary += `- Total: ${taskStats.total}\n`;
    summary += `- Completed: ${taskStats.completed}\n`;
    summary += `- In Progress: ${taskStats.inProgress}\n`;
    summary += `- Unassigned: ${taskStats.unassigned}\n`;
    summary += `- Blocked: ${taskStats.blocked}\n`;
    summary += `- Failed: ${taskStats.failed}\n\n`;

    // Specific context
    if (escalation.context.taskId) {
      const task = await this.taskModel.findById(escalation.context.taskId);
      if (task) {
        summary += `## Problem Task\n`;
        summary += `- **ID:** ${task._id}\n`;
        summary += `- **Title:** ${task.title}\n`;
        summary += `- **Level:** ${task.level}\n`;
        summary += `- **State:** ${task.state}\n`;
        summary += `- **Assigned Agent:** ${task.assignedAgentId || 'none'}\n`;
        summary += `- **Description:** ${task.description}\n`;
        summary += `\n`;
      }
    }

    // Recent activity
    const recentMessages = await this.messageModel
      .find({ collectiveId })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    if (recentMessages.length > 0) {
      summary += `## Recent Communication\n`;
      for (const msg of recentMessages) {
        summary += `- [${msg.createdAt.toISOString()}] ${msg.sourceAgentId} → ${msg.targetAgentId}: ${msg.message.substring(0, 100)}...\n`;
      }
      summary += `\n`;
    }

    // Additional details
    if (escalation.context.details) {
      summary += `## Additional Context\n`;
      summary += `\`\`\`json\n${JSON.stringify(escalation.context.details, null, 2)}\n\`\`\`\n\n`;
    }

    summary += `## Suggested Actions\n`;
    summary += this.suggestActions(escalation);

    return summary;
  }

  /**
   * Suggest actions based on escalation type.
   */
  private suggestActions(escalation: any): string {
    let suggestions = '';

    switch (escalation.type) {
      case 'deadlock':
        suggestions += `- Cancel one of the deadlocked tasks\n`;
        suggestions += `- Remove a circular dependency\n`;
        suggestions += `- Reassign tasks to break contention\n`;
        suggestions += `- Provide manual resolution guidance\n`;
        break;

      case 'error':
        suggestions += `- Review error details and provide fix\n`;
        suggestions += `- Cancel failing task if unrecoverable\n`;
        suggestions += `- Modify task parameters\n`;
        suggestions += `- Provide troubleshooting guidance\n`;
        break;

      case 'ambiguity':
        suggestions += `- Clarify ambiguous requirements\n`;
        suggestions += `- Provide additional context\n`;
        suggestions += `- Simplify task scope\n`;
        suggestions += `- Break down into clearer subtasks\n`;
        break;

      case 'decision':
        suggestions += `- Make strategic decision\n`;
        suggestions += `- Adjust priorities\n`;
        suggestions += `- Provide direction on trade-offs\n`;
        suggestions += `- Approve/reject proposed approach\n`;
        break;

      case 'resource':
        suggestions += `- Provide additional resources\n`;
        suggestions += `- Adjust resource limits\n`;
        suggestions += `- Find alternative approach\n`;
        suggestions += `- Reduce scope to fit resources\n`;
        break;

      default:
        suggestions += `- Review situation and provide guidance\n`;
    }

    return suggestions;
  }

  /**
   * Format escalation message for PM.
   */
  private formatEscalationMessage(escalation: any, summary: string): string {
    let message = `🚨 **HUMAN ESCALATION REQUIRED** 🚨\n\n`;
    message += `**Urgency:** ${escalation.urgency.toUpperCase()}\n`;
    message += `**Type:** ${escalation.type}\n`;
    message += `**Reason:** ${escalation.reason}\n\n`;
    message += `---\n\n`;
    message += summary;
    message += `\n---\n\n`;
    message += `**The collective is now PAUSED awaiting human guidance.**\n`;
    message += `Please review the situation and provide resolution guidance.`;

    return message;
  }

  /**
   * Execute resolution actions.
   */
  private async executeResolutionActions(
    collectiveId: string,
    actions: Array<{ type: string; params: any }>,
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeResolutionAction(collectiveId, action);
      } catch (error) {
        this.logger.error(`Failed to execute resolution action ${action.type}:`, error);
      }
    }
  }

  /**
   * Execute a single resolution action.
   */
  private async executeResolutionAction(
    collectiveId: string,
    action: { type: string; params: any },
  ): Promise<void> {
    switch (action.type) {
      case 'cancel_task':
        await this.taskModel.findByIdAndUpdate(action.params.taskId, {
          state: 'cancelled',
          metadata: { cancelReason: 'Human escalation resolution' },
        });
        break;

      case 'modify_task':
        await this.taskModel.findByIdAndUpdate(action.params.taskId, action.params.updates);
        break;

      case 'add_context':
        const task = await this.taskModel.findById(action.params.taskId);
        if (task) {
          const updatedDescription = `${task.description}\n\n**Additional Context:**\n${action.params.context}`;
          await this.taskModel.findByIdAndUpdate(action.params.taskId, {
            description: updatedDescription,
          });
        }
        break;

      case 'change_agent':
        await this.taskModel.findByIdAndUpdate(action.params.taskId, {
          assignedAgentId: action.params.newAgentId,
          state: 'pending',
        });
        break;

      case 'adjust_priority':
        await this.taskModel.findByIdAndUpdate(action.params.taskId, {
          priority: action.params.newPriority,
        });
        break;

      default:
        this.logger.warn(`Unknown resolution action type: ${action.type}`);
    }
  }

  /**
   * Set timeout for escalation.
   */
  private setEscalationTimeout(escalationId: string): void {
    setTimeout(async () => {
      const record = this.activeEscalations.get(escalationId);
      if (record && record.status === 'pending') {
        this.logger.warn(`Escalation ${escalationId} timed out after ${this.MAX_ESCALATION_WAIT_MS}ms`);

        record.status = 'timeout';
        record.resolvedAt = new Date();

        // Log timeout event
        await this.eventsRepo.create({
          collectiveId: record.collectiveId as any,
          type: EventType.USER_INTERVENTION,
          actorId: 'system',
          actorType: ActorType.SYSTEM,
          timestamp: new Date(),
          targetType: TargetType.COLLECTIVE,
          targetId: record.collectiveId,
          description: 'Escalation timed out',
          metadata: {
            escalationId,
            waitTime: this.MAX_ESCALATION_WAIT_MS,
          },
        });

        // Auto-resolve with timeout guidance
        await this.resumeCollective(
          record.collectiveId,
          'Escalation timed out, collective will attempt to continue',
        );

        this.activeEscalations.delete(escalationId);
      }
    }, this.MAX_ESCALATION_WAIT_MS);
  }

  /**
   * Get escalation statistics.
   */
  async getEscalationStats(collectiveId: string | Types.ObjectId): Promise<{
    totalEscalations: number;
    byType: Record<string, number>;
    byUrgency: Record<string, number>;
    resolved: number;
    pending: number;
    timedOut: number;
    avgResolutionTime: number;
  }> {
    // In a real implementation, query from database
    // For now, return in-memory stats
    const records = Array.from(this.activeEscalations.values()).filter(
      r => r.collectiveId === collectiveId.toString(),
    );

    const stats = {
      totalEscalations: records.length,
      byType: {} as Record<string, number>,
      byUrgency: {} as Record<string, number>,
      resolved: 0,
      pending: 0,
      timedOut: 0,
      avgResolutionTime: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const record of records) {
      stats.byType[record.type] = (stats.byType[record.type] || 0) + 1;
      stats.byUrgency[record.urgency] = (stats.byUrgency[record.urgency] || 0) + 1;

      if (record.status === 'resolved') {
        stats.resolved++;
        if (record.resolvedAt) {
          const resolutionTime = record.resolvedAt.getTime() - record.createdAt.getTime();
          totalResolutionTime += resolutionTime;
          resolvedCount++;
        }
      } else if (record.status === 'pending') {
        stats.pending++;
      } else if (record.status === 'timeout') {
        stats.timedOut++;
      }
    }

    if (resolvedCount > 0) {
      stats.avgResolutionTime = totalResolutionTime / resolvedCount;
    }

    return stats;
  }
}

interface EscalationRecord {
  id: string;
  collectiveId: string;
  reason: string;
  type: 'deadlock' | 'error' | 'ambiguity' | 'decision' | 'resource';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  status: 'pending' | 'resolved' | 'timeout';
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: {
    guidance: string;
    actions?: Array<any>;
  } | null;
}
