import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collective, CollectiveDocument } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskDocument } from '../entities/collective-task.entity';
import { CollectiveConversation, CollectiveConversationDocument } from '../entities/collective-conversation.entity';
import { EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import { MessageType, MessagePriority } from '../entities/collective-message.entity';
import { MessageQueueService } from './message-queue.service';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { CollectiveConversationsRepository } from '../repositories/collective-conversations.repository';

/**
 * CommunicationService
 * 
 * High-level communication patterns for Collective Agent system.
 * 
 * Provides convenient methods for:
 * - Agent-to-agent messaging
 * - Agent-to-PM communication
 * - PM-to-agent directives
 * - Broadcast messages
 * - Task-specific messaging
 * - Conversation threading
 * - Escalation paths
 * 
 * Built on top of MessageQueueService for reliable delivery.
 */
@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(CollectiveConversation.name) private conversationModel: Model<CollectiveConversationDocument>,
    private readonly messageQueue: MessageQueueService,
    private readonly eventsRepo: CollectiveEventsRepository,
    private readonly conversationsRepo: CollectiveConversationsRepository,
  ) {}

  /**
   * Agent asks PM a question.
   * Creates HIGH priority message and adds to PM conversation.
   */
  async askPM(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    question: string,
    options: {
      taskId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    // Send message to PM
    await this.messageQueue.sendMessage(
      collectiveId,
      agentId,
      'pm_agent',
      question,
      {
        type: MessageType.HELP_REQUEST,
        priority: MessagePriority.HIGH,
        metadata: {
          ...options.metadata,
          taskId: options.taskId,
        },
      },
    );

    // Add to PM conversation
    const pmConversation = await this.conversationsRepo.findByAgentId(
      collectiveId,
      'pm_agent',
    );
    if (pmConversation && pmConversation[0]) {
      await this.conversationsRepo.addMessage(pmConversation[0]._id as any, {
        role: 'user',
        content: `Question from ${agentId}: ${question}`,
        timestamp: new Date(),
      });
    }

    this.logger.log(`Agent ${agentId} asked PM: ${question.substring(0, 50)}...`);
  }

  /**
   * PM sends directive to an agent.
   * Creates HIGH priority message and adds to agent's task conversation.
   */
  async pmDirective(
    collectiveId: string | Types.ObjectId,
    targetAgentId: string,
    directive: string,
    options: {
      taskId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    // Send message to agent
    await this.messageQueue.sendMessage(
      collectiveId,
      'pm_agent',
      targetAgentId,
      directive,
      {
        type: MessageType.PM_DIRECTIVE,
        priority: MessagePriority.HIGH,
        metadata: {
          ...options.metadata,
          taskId: options.taskId,
        },
      },
    );

    // Add to agent's task conversation if taskId provided
    if (options.taskId) {
      const taskConversation = await this.conversationsRepo.findByTaskId(
        options.taskId,
      );
      if (taskConversation) {
        await this.conversationsRepo.addMessage(taskConversation._id as any, {
          role: 'user',
          content: `PM directive: ${directive}`,
          timestamp: new Date(),
        });
      }
    }

    this.logger.log(`PM sent directive to ${targetAgentId}: ${directive.substring(0, 50)}...`);
  }

  /**
   * PM broadcasts message to all agents.
   */
  async pmBroadcast(
    collectiveId: string | Types.ObjectId,
    message: string,
    options: {
      priority?: string;
      excludeAgentIds?: string[];
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    await this.messageQueue.broadcastMessage(
      collectiveId,
      'pm_agent',
      message,
      {
        type: 'broadcast',
        priority: options.priority || 'NORMAL',
        excludeAgentIds: options.excludeAgentIds,
        metadata: options.metadata,
      },
    );

    // Add to PM conversation
    const pmConversation = await this.conversationsRepo.findByAgentId(
      collectiveId,
      'pm_agent',
    );
    if (pmConversation && pmConversation[0]) {
      await this.conversationsRepo.addMessage(pmConversation[0]._id as any, {
        role: 'assistant',
        content: `Broadcast sent: ${message}`,
        timestamp: new Date(),
      });
    }

    this.logger.log(`PM broadcast: ${message.substring(0, 50)}...`);
  }

  /**
   * Agent sends task update to PM.
   */
  async reportProgress(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    taskId: string,
    progress: string,
    options: {
      percentage?: number;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    const content = options.percentage
      ? `[${options.percentage}%] ${progress}`
      : progress;

    await this.messageQueue.sendMessage(
      collectiveId,
      agentId,
      'pm_agent',
      content,
      {
        type: MessageType.STATUS_UPDATE,
        priority: MessagePriority.NORMAL,
        metadata: {
          ...options.metadata,
          taskId,
          percentage: options.percentage,
        },
      },
    );

    // Add to PM conversation
    const pmConversation = await this.conversationsRepo.findByAgentId(
      collectiveId,
      'pm_agent',
    );
    if (pmConversation && pmConversation[0]) {
      await this.conversationsRepo.addMessage(pmConversation[0]._id as any, {
        role: 'assistant',
        content: `Progress from ${agentId} on task ${taskId}: ${content}`,
        timestamp: new Date(),
      });
    }

    this.logger.debug(`Agent ${agentId} reported progress on task ${taskId}`);
  }

  /**
   * Agent requests help from another agent.
   * Creates NORMAL priority message between agents.
   */
  async requestHelp(
    collectiveId: string | Types.ObjectId,
    fromAgentId: string,
    toAgentId: string,
    helpRequest: string,
    options: {
      taskId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    await this.messageQueue.sendMessage(
      collectiveId,
      fromAgentId,
      toAgentId,
      helpRequest,
      {
        type: MessageType.HELP_REQUEST,
        priority: MessagePriority.NORMAL,
        metadata: {
          ...options.metadata,
          taskId: options.taskId,
        },
      },
    );

    this.logger.log(`Agent ${fromAgentId} requested help from ${toAgentId}`);
  }

  /**
   * Agent shares information with another agent.
   */
  async shareInfo(
    collectiveId: string | Types.ObjectId,
    fromAgentId: string,
    toAgentId: string,
    info: string,
    options: {
      taskId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    await this.messageQueue.sendMessage(
      collectiveId,
      fromAgentId,
      toAgentId,
      info,
      {
        type: MessageType.INFO_REQUEST,
        priority: MessagePriority.LOW,
        metadata: {
          ...options.metadata,
          taskId: options.taskId,
        },
      },
    );

    this.logger.debug(`Agent ${fromAgentId} shared info with ${toAgentId}`);
  }

  /**
   * Escalate issue to PM (CRITICAL priority).
   */
  async escalateToPM(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    issue: string,
    options: {
      taskId?: string;
      reason?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    await this.messageQueue.sendMessage(
      collectiveId,
      agentId,
      'pm_agent',
      issue,
      {
        type: MessageType.HUMAN_MESSAGE,
        priority: MessagePriority.CRITICAL,
        metadata: {
          ...options.metadata,
          taskId: options.taskId,
          reason: options.reason,
        },
      },
    );

    // Add to PM conversation with special formatting
    const pmConversation = await this.conversationsRepo.findByAgentId(
      collectiveId,
      'pm_agent',
    );
    if (pmConversation && pmConversation[0]) {
      await this.conversationsRepo.addMessage(pmConversation[0]._id as any, {
        role: 'user',
        content: `🚨 ESCALATION from ${agentId}: ${issue}`,
        timestamp: new Date(),
      });
    }

    // Log escalation event
    await this.eventsRepo.create({
      collectiveId: collectiveId as any,
      type: EventType.USER_INTERVENTION,
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.AGENT,
      targetId: 'pm_agent',
      description: `Escalation: ${issue}`,
      metadata: {
        taskId: options.taskId,
        reason: options.reason,
        issue,
      },
      timestamp: new Date(),
    });

    this.logger.warn(`Agent ${agentId} escalated issue to PM: ${issue.substring(0, 50)}...`);
  }

  /**
   * Send notification to all agents about a task change.
   */
  async notifyTaskChange(
    collectiveId: string | Types.ObjectId,
    taskId: string,
    changeType: 'created' | 'updated' | 'completed' | 'cancelled' | 'blocked',
    message: string,
    options: {
      excludeAgentIds?: string[];
    } = {},
  ): Promise<void> {
    await this.messageQueue.broadcastMessage(
      collectiveId,
      'system',
      message,
      {
        type: 'task_notification',
        priority: 'LOW',
        excludeAgentIds: options.excludeAgentIds,
        metadata: {
          taskId,
          changeType,
        },
      },
    );

    this.logger.debug(`Task notification sent: ${changeType} - ${taskId}`);
  }

  /**
   * Get conversation between two agents.
   */
  async getAgentConversation(
    collectiveId: string | Types.ObjectId,
    agentId1: string,
    agentId2: string,
  ): Promise<any[]> {
    // Get messages between these two agents
    const messages = await this.messageQueue['messageModel']
      .find({
        collectiveId,
        $or: [
          { sourceAgentId: agentId1, targetAgentId: agentId2 },
          { sourceAgentId: agentId2, targetAgentId: agentId1 },
        ],
      })
      .sort({ createdAt: 1 })
      .exec();

    return messages.map(m => ({
      id: (m._id as Types.ObjectId).toString(),
      from: m.sourceAgentId,
      to: m.targetAgentId,
      content: m.message,
      type: m.type,
      priority: m.priority,
      timestamp: m.createdAt,
      status: m.status,
    }));
  }

  /**
   * Check if an agent has pending messages.
   */
  async hasPendingMessages(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<boolean> {
    const count = await this.messageQueue.getUnreadCount(collectiveId, agentId);
    return count > 0;
  }

  /**
   * Get pending message count for an agent.
   */
  async getPendingCount(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<number> {
    return this.messageQueue.getUnreadCount(collectiveId, agentId);
  }

  /**
   * Reply to a message (creates threaded conversation).
   */
  async replyToMessage(
    collectiveId: string | Types.ObjectId,
    replyToMessageId: string,
    fromAgentId: string,
    content: string,
    options: {
      priority?: string;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    // Get original message
    const originalMessage = await this.messageQueue['messageModel'].findById(replyToMessageId);
    if (!originalMessage) {
      throw new Error('Original message not found');
    }

    // Send reply
    await this.messageQueue.sendMessage(
      collectiveId,
      fromAgentId,
      originalMessage.sourceAgentId || 'pm_agent', // Reply to sender
      content,
      {
        type: MessageType.RESULT,
        priority: (options.priority as MessagePriority) || originalMessage.priority,
        metadata: options.metadata,
        conversationId: originalMessage.conversationId,
        replyToMessageId,
      },
    );

    this.logger.debug(`Agent ${fromAgentId} replied to message ${replyToMessageId}`);
  }

  /**
   * Get all messages for a task (for task-specific communication).
   */
  async getTaskMessages(
    collectiveId: string | Types.ObjectId,
    taskId: string,
  ): Promise<any[]> {
    const messages = await this.messageQueue['messageModel']
      .find({
        collectiveId,
        'metadata.taskId': taskId,
      })
      .sort({ createdAt: 1 })
      .exec();

    return messages.map(m => ({
      id: (m._id as Types.ObjectId).toString(),
      from: m.sourceAgentId,
      to: m.targetAgentId,
      content: m.message,
      type: m.type,
      priority: m.priority,
      timestamp: m.createdAt,
      status: m.status,
    }));
  }

  /**
   * Start a group conversation (multiple agents).
   */
  async startGroupConversation(
    collectiveId: string | Types.ObjectId,
    agentIds: string[],
    topic: string,
    initialMessage: string,
  ): Promise<string> {
    const conversationId = new Types.ObjectId().toString();

    // Send initial message to all participants
    for (const agentId of agentIds) {
      await this.messageQueue.sendMessage(
        collectiveId,
        'system',
        agentId,
        initialMessage,
        {
          type: MessageType.STATUS_UPDATE,
          priority: MessagePriority.NORMAL,
          conversationId,
          metadata: {
            topic,
            participants: agentIds,
          },
        },
      );
    }

    this.logger.log(`Started group conversation: ${topic} with ${agentIds.length} agents`);

    return conversationId;
  }

  /**
   * Send message to group conversation.
   */
  async sendToGroup(
    collectiveId: string | Types.ObjectId,
    conversationId: string,
    fromAgentId: string,
    message: string,
  ): Promise<void> {
    // Get all participants from existing messages
    const existingMessages = await this.messageQueue['messageModel']
      .find({ conversationId })
      .limit(1)
      .exec();

    if (existingMessages.length === 0) {
      throw new Error('Conversation not found');
    }

    const participants = existingMessages[0].metadata?.participants || [];

    // Send to all participants except sender
    for (const agentId of participants) {
      if (agentId !== fromAgentId) {
        await this.messageQueue.sendMessage(
          collectiveId,
          fromAgentId,
          agentId,
          message,
          {
            type: MessageType.STATUS_UPDATE,
            priority: MessagePriority.NORMAL,
            conversationId,
          },
        );
      }
    }

    this.logger.debug(`Agent ${fromAgentId} sent message to group ${conversationId}`);
  }

  /**
   * Get communication statistics for an agent.
   */
  async getAgentCommStats(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<{
    messagesSent: number;
    messagesReceived: number;
    questionsAsked: number;
    escalations: number;
    avgResponseTime: number | null;
  }> {
    const sent = await this.messageQueue['messageModel'].countDocuments({
      collectiveId,
      sourceAgentId: agentId,
    });

    const received = await this.messageQueue['messageModel'].countDocuments({
      collectiveId,
      targetAgentId: agentId,
    });

    const questions = await this.messageQueue['messageModel'].countDocuments({
      collectiveId,
      sourceAgentId: agentId,
      type: 'question',
    });

    const escalations = await this.messageQueue['messageModel'].countDocuments({
      collectiveId,
      sourceAgentId: agentId,
      type: 'escalation',
    });

    // Calculate average response time (simplified)
    const repliesWithTimes = await this.messageQueue['messageModel']
      .find({
        collectiveId,
        sourceAgentId: agentId,
        'metadata.replyToMessageId': { $exists: true },
      })
      .exec();

    let avgResponseTime: number | null = null;
    if (repliesWithTimes.length > 0) {
      const responseTimes = await Promise.all(
        repliesWithTimes.map(async reply => {
          const replyToId = reply.metadata?.replyToMessageId;
          if (replyToId) {
            const original = await this.messageQueue['messageModel'].findById(replyToId);
            if (original) {
              return reply.createdAt.getTime() - original.createdAt.getTime();
            }
          }
          return 0;
        }),
      );

      const validTimes = responseTimes.filter(t => t > 0);
      if (validTimes.length > 0) {
        avgResponseTime = Math.round(
          validTimes.reduce((a, b) => a + b, 0) / validTimes.length,
        );
      }
    }

    return {
      messagesSent: sent,
      messagesReceived: received,
      questionsAsked: questions,
      escalations,
      avgResponseTime,
    };
  }
}
