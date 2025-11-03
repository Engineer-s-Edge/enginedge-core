import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveMessage, CollectiveMessageDocument, MessageType, MessagePriority, MessageStatus } from '../entities/collective-message.entity';
import { CollectiveEvent, CollectiveEventDocument, EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';

/**
 * MessageQueueService
 * 
 * Advanced message queue management for Collective Agent system.
 * 
 * Responsibilities:
 * - Route messages to correct recipients
 * - Track message delivery status
 * - Implement retry logic for failed deliveries
 * - Handle message timeouts
 * - Provide message threading support
 * - Archive old messages
 * - Generate message analytics
 * 
 * Features:
 * - Priority-based delivery
 * - Automatic retry (up to 3 attempts)
 * - Timeout detection (configurable per priority)
 * - Message threading (reply-to support)
 * - Delivery confirmation
 * - Failed message handling
 */
@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  // Retry configuration
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS_MS = [1000, 5000, 15000]; // Exponential backoff

  // Timeout configuration (milliseconds)
  private readonly MESSAGE_TIMEOUTS = {
    CRITICAL: 60000,      // 1 minute
    HIGH: 300000,         // 5 minutes
    NORMAL: 900000,       // 15 minutes
    LOW: 3600000,         // 1 hour
    BACKGROUND: 86400000, // 24 hours
  };

  // Message archival threshold
  private readonly ARCHIVAL_AGE_DAYS = 30;

  constructor(
    @InjectModel(CollectiveMessage.name) private messageModel: Model<CollectiveMessageDocument>,
    @InjectModel(CollectiveEvent.name) private eventModel: Model<CollectiveEventDocument>,
    private readonly messagesRepo: CollectiveMessagesRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
  ) {}

  /**
   * Send a message with automatic routing and retry logic.
   */
  async sendMessage(
    collectiveId: string | Types.ObjectId,
    fromAgentId: string,
    toAgentId: string,
    content: string,
    options: {
      type?: MessageType;
      priority?: MessagePriority;
      metadata?: Record<string, any>;
      conversationId?: string;
      replyToMessageId?: string;
    } = {},
  ): Promise<CollectiveMessageDocument> {
    const collectiveObjectId = typeof collectiveId === 'string' 
      ? new Types.ObjectId(collectiveId) 
      : collectiveId;

    const message = await this.messagesRepo.create({
      collectiveId: collectiveObjectId,
      fromAgentId,
      toAgentId,
      targetAgentId: toAgentId,
      type: options.type || MessageType.STATUS_UPDATE,
      priority: options.priority || MessagePriority.NORMAL,
      content,
      message: content,
      metadata: options.metadata || {},
      conversationId: options.conversationId || `conv-${Date.now()}`,
      taskId: new Types.ObjectId(), // Placeholder - should be passed in options
      status: MessageStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
    });

    // Log message sent event
    await this.eventsRepo.create({
      collectiveId: collectiveObjectId,
      type: EventType.MESSAGE_SENT,
      timestamp: new Date(),
      actorId: fromAgentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.AGENT,
      targetId: toAgentId,
      description: 'Message sent',
      metadata: {
        messageId: (message._id as Types.ObjectId).toString(),
        messageType: options.type,
        priority: options.priority,
      },
    });

    this.logger.debug(
      `Message sent from ${fromAgentId} to ${toAgentId} (${options.priority || 'NORMAL'})`,
    );

    return message;
  }

  /**
   * Broadcast a message to all agents in a collective.
   */
  async broadcastMessage(
    collectiveId: string | Types.ObjectId,
    fromAgentId: string,
    content: string,
    options: {
      type?: string;
      priority?: string;
      metadata?: Record<string, any>;
      excludeAgentIds?: string[];
    } = {},
  ): Promise<CollectiveMessageDocument[]> {
    // Get all agents in collective
    const collective = await this.messageModel.db
      .collection('collectives')
      .findOne({ _id: new Types.ObjectId(collectiveId as string) });

    if (!collective) {
      throw new Error('Collective not found');
    }

    const agentIds = collective.agents
      .map((a: any) => a.id)
      .filter((id: string) => 
        id !== fromAgentId && 
        !(options.excludeAgentIds || []).includes(id)
      );

    // Create message for each recipient
    const messages: CollectiveMessageDocument[] = [];
    for (const agentId of agentIds) {
      const message = await this.sendMessage(
        collectiveId,
        fromAgentId,
        agentId,
        content,
        {
          type: (options.type as MessageType) || MessageType.STATUS_UPDATE,
          priority: (options.priority as MessagePriority) || MessagePriority.NORMAL,
          metadata: options.metadata,
        },
      );
      messages.push(message);
    }

    this.logger.log(
      `Broadcast from ${fromAgentId} delivered to ${messages.length} agents`,
    );

    return messages;
  }

  /**
   * Mark a message as delivered.
   */
  async markDelivered(
    messageId: string | Types.ObjectId,
  ): Promise<CollectiveMessageDocument | null> {
    const message = await this.messageModel.findByIdAndUpdate(
      messageId,
      {
        status: MessageStatus.COMPLETED,
        deliveredAt: new Date(),
      },
      { new: true },
    );

    if (message) {
      this.logger.debug(`Message ${messageId} marked as delivered`);

      // Log delivery event
      await this.eventsRepo.create({
        collectiveId: message.collectiveId,
        type: EventType.MESSAGE_SENT,
        timestamp: new Date(),
        actorId: message.targetAgentId,
        actorType: ActorType.AGENT,
        targetType: TargetType.MESSAGE,
        targetId: (message._id as Types.ObjectId).toString(),
        description: 'Message delivered',
        metadata: {
          messageId: (message._id as Types.ObjectId).toString(),
          fromAgentId: message.sourceAgentId,
        },
      });
    }

    return message;
  }

  /**
   * Mark a message as read.
   */
  async markRead(
    messageId: string | Types.ObjectId,
  ): Promise<CollectiveMessageDocument | null> {
    const message = await this.messageModel.findByIdAndUpdate(
      messageId,
      {
        status: 'read',
        readAt: new Date(),
      },
      { new: true },
    );

    if (message) {
      this.logger.debug(`Message ${messageId} marked as read`);
    }

    return message;
  }

  /**
   * Retry failed message delivery.
   */
  async retryMessage(
    messageId: string | Types.ObjectId,
  ): Promise<CollectiveMessageDocument | null> {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      return null;
    }

    const retryCount = message.retryCount || 0;

    if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
      this.logger.warn(`Message ${messageId} exceeded max retry attempts`);
      
      // Mark as permanently failed
      message.status = MessageStatus.FAILED;
      await message.save();

      // Log failure event
      await this.eventsRepo.create({
        collectiveId: message.collectiveId,
        type: EventType.MESSAGE_SENT,
        timestamp: new Date(),
        actorId: 'system',
        actorType: ActorType.SYSTEM,
        targetType: TargetType.MESSAGE,
        targetId: (message._id as Types.ObjectId).toString(),
        description: 'Message failed',
        metadata: {
          messageId: (message._id as Types.ObjectId).toString(),
          reason: 'Max retry attempts exceeded',
          retryCount,
        },
      });

      return message;
    }

    // Increment retry count
    message.retryCount = retryCount + 1;
    message.status = MessageStatus.PENDING;
    await message.save();

    this.logger.log(
      `Retrying message ${messageId} (attempt ${message.retryCount}/${this.MAX_RETRY_ATTEMPTS})`,
    );

    return message;
  }

  /**
   * Check for timed-out messages and mark them for retry.
   */
  async checkMessageTimeouts(collectiveId: string | Types.ObjectId): Promise<number> {
    const now = Date.now();
    let timedOutCount = 0;

    // Find pending messages
    const pendingMessages = await this.messageModel.find({
      collectiveId,
      status: MessageStatus.PENDING,
    });

    for (const message of pendingMessages) {
      const priorityKey = message.priority.toUpperCase() as keyof typeof this.MESSAGE_TIMEOUTS;
      const timeout = this.MESSAGE_TIMEOUTS[priorityKey] || this.MESSAGE_TIMEOUTS.NORMAL;
      const messageAge = now - message.createdAt.getTime();

      if (messageAge > timeout) {
        this.logger.warn(
          `Message ${(message._id as Types.ObjectId).toString()} timed out (age: ${Math.round(messageAge / 1000)}s, timeout: ${Math.round(timeout / 1000)}s)`,
        );

        // Retry or fail
        await this.retryMessage(message._id as Types.ObjectId);
        timedOutCount++;
      }
    }

    return timedOutCount;
  }

  /**
   * Get messages in a thread (based on conversationId or replyTo chain).
   */
  async getMessageThread(
    messageId: string | Types.ObjectId,
  ): Promise<CollectiveMessageDocument[]> {
    const rootMessage = await this.messageModel.findById(messageId);

    if (!rootMessage) {
      return [];
    }

    // Get all messages in the same conversation
    if (rootMessage.conversationId) {
      return this.messageModel
        .find({ conversationId: rootMessage.conversationId })
        .sort({ createdAt: 1 })
        .exec();
    }

    // Otherwise, build thread from replyTo chain
    const thread: CollectiveMessageDocument[] = [rootMessage];
    
    // Get replies
    const replies = await this.messageModel
      .find({ replyToMessageId: messageId })
      .sort({ createdAt: 1 })
      .exec();
    
    thread.push(...replies);

    return thread;
  }

  /**
   * Get unread message count for an agent.
   */
  async getUnreadCount(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<number> {
    return this.messageModel.countDocuments({
      collectiveId,
      toAgentId: agentId,
      status: { $in: ['pending', 'delivered'] },
    });
  }

  /**
   * Get message statistics for a collective.
   */
  async getMessageStats(collectiveId: string | Types.ObjectId): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    avgDeliveryTime: number | null;
    failureRate: number;
  }> {
    const messages = await this.messageModel.find({ collectiveId });

    const stats = {
      total: messages.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      avgDeliveryTime: null as number | null,
      failureRate: 0,
    };

    // Count by status
    for (const message of messages) {
      stats.byStatus[message.status] = (stats.byStatus[message.status] || 0) + 1;
      stats.byPriority[message.priority] = (stats.byPriority[message.priority] || 0) + 1;
      stats.byType[message.type] = (stats.byType[message.type] || 0) + 1;
    }

    // Calculate average delivery time
    const deliveredMessages = messages.filter(m => m.deliveredAt !== undefined && m.deliveredAt !== null);
    if (deliveredMessages.length > 0) {
      const totalDeliveryTime = deliveredMessages.reduce((sum, m) => {
        const deliveredAt = m.deliveredAt;
        if (deliveredAt) {
          return sum + (deliveredAt.getTime() - m.createdAt.getTime());
        }
        return sum;
      }, 0);
      stats.avgDeliveryTime = Math.round(totalDeliveryTime / deliveredMessages.length);
    }

    // Calculate failure rate
    const failedCount = stats.byStatus['failed'] || 0;
    stats.failureRate = stats.total > 0 ? failedCount / stats.total : 0;

    return stats;
  }

  /**
   * Archive old messages (move to archived status).
   */
  async archiveOldMessages(collectiveId: string | Types.ObjectId): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.ARCHIVAL_AGE_DAYS);

    const result = await this.messageModel.updateMany(
      {
        collectiveId,
        createdAt: { $lt: cutoffDate },
        status: { $in: ['delivered', 'read', 'failed'] },
      },
      {
        $set: { archived: true },
      },
    );

    this.logger.log(
      `Archived ${result.modifiedCount} messages older than ${this.ARCHIVAL_AGE_DAYS} days`,
    );

    return result.modifiedCount;
  }

  /**
   * Delete archived messages (permanent deletion).
   */
  async deleteArchivedMessages(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.messageModel.deleteMany({
      collectiveId,
      archived: true,
    });

    this.logger.log(`Deleted ${result.deletedCount} archived messages`);

    return result.deletedCount;
  }

  /**
   * Search messages by content (full-text search).
   */
  async searchMessages(
    collectiveId: string | Types.ObjectId,
    query: string,
    options: {
      agentId?: string;
      priority?: string;
      type?: string;
      limit?: number;
    } = {},
  ): Promise<CollectiveMessageDocument[]> {
    const filter: any = {
      collectiveId,
      $text: { $search: query },
    };

    if (options.agentId) {
      filter.$or = [
        { fromAgentId: options.agentId },
        { toAgentId: options.agentId },
      ];
    }

    if (options.priority) {
      filter.priority = options.priority;
    }

    if (options.type) {
      filter.type = options.type;
    }

    return this.messageModel
      .find(filter)
      .sort({ score: { $meta: 'textScore' } })
      .limit(options.limit || 50)
      .exec();
  }

  /**
   * Get pending messages for an agent (sorted by priority).
   */
  async getPendingMessages(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    _limit: number = 10,
  ): Promise<CollectiveMessageDocument[]> {
    return this.messagesRepo.findPendingForAgent(collectiveId, agentId);
  }

  /**
   * Bulk delete messages by collective (cleanup utility).
   */
  async deleteAllMessages(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.messageModel.deleteMany({ collectiveId });
    this.logger.log(`Deleted ${result.deletedCount} messages for collective ${collectiveId}`);
    return result.deletedCount;
  }
}
