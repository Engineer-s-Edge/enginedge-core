import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CollectiveMessage,
  CollectiveMessageDocument,
  MessagePriority,
  MessageStatus,
} from '../entities/collective-message.entity';

@Injectable()
export class CollectiveMessagesRepository {
  constructor(
    @InjectModel(CollectiveMessage.name)
    private messageModel: Model<CollectiveMessageDocument>,
  ) {}

  async create(
    messageData: Partial<CollectiveMessage>,
  ): Promise<CollectiveMessageDocument> {
    const message = new this.messageModel(messageData);
    return message.save();
  }

  async findById(id: string | Types.ObjectId): Promise<CollectiveMessageDocument | null> {
    return this.messageModel.findById(id).exec();
  }

  async findPendingForAgent(
    collectiveId: string | Types.ObjectId,
    targetAgentId: string,
  ): Promise<CollectiveMessageDocument[]> {
    // Use aggregation to sort by custom priority order
    const priorityOrder = this.getPrioritySortValue();
    return this.messageModel.aggregate([
      {
        $match: {
          collectiveId: new Types.ObjectId(collectiveId as string),
          targetAgentId,
          status: MessageStatus.PENDING,
        },
      },
      {
        $addFields: {
          priorityValue: {
            $switch: {
              branches: Object.entries(priorityOrder).map(([key, value]) => ({
                case: { $eq: ['$priority', key] },
                then: value,
              })),
              default: 999,
            },
          },
        },
      },
      { $sort: { priorityValue: 1, createdAt: 1 } },
    ]);
  }

  async findByConversation(
    conversationId: string,
  ): Promise<CollectiveMessageDocument[]> {
    return this.messageModel.find({ conversationId }).sort({ createdAt: 1 }).exec();
  }

  async getNextMessageForAgent(
    collectiveId: string | Types.ObjectId,
    targetAgentId: string,
  ): Promise<CollectiveMessageDocument | null> {
    // Get highest priority pending message using aggregation
    const priorityOrder = this.getPrioritySortValue();
    const results = await this.messageModel.aggregate([
      {
        $match: {
          collectiveId: new Types.ObjectId(collectiveId as string),
          targetAgentId,
          status: MessageStatus.PENDING,
        },
      },
      {
        $addFields: {
          priorityValue: {
            $switch: {
              branches: Object.entries(priorityOrder).map(([key, value]) => ({
                case: { $eq: ['$priority', key] },
                then: value,
              })),
              default: 999,
            },
          },
        },
      },
      { $sort: { priorityValue: 1, createdAt: 1 } },
      { $limit: 1 },
    ]);

    return results[0] || null;
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: MessageStatus,
  ): Promise<CollectiveMessageDocument | null> {
    const updates: any = { status };

    if (status === MessageStatus.IN_PROGRESS || status === MessageStatus.COMPLETED) {
      updates.processedAt = new Date();
    }

    return this.messageModel.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async deleteByCollectiveId(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.messageModel.deleteMany({ collectiveId }).exec();
    return result.deletedCount;
  }

  /**
   * Find pending messages by priority levels.
   * Used by PM main loop to process messages in priority order.
   */
  async findPendingByPriority(
    collectiveId: string | Types.ObjectId,
    priorities: MessagePriority[],
    limit: number = 10,
  ): Promise<CollectiveMessageDocument[]> {
    // Use aggregation to sort by custom priority order
    const priorityOrder = this.getPrioritySortValue();
    return this.messageModel.aggregate([
      {
        $match: {
          collectiveId: new Types.ObjectId(collectiveId as string),
          status: MessageStatus.PENDING,
          priority: { $in: priorities },
        },
      },
      {
        $addFields: {
          priorityValue: {
            $switch: {
              branches: Object.entries(priorityOrder).map(([key, value]) => ({
                case: { $eq: ['$priority', key] },
                then: value,
              })),
              default: 999,
            },
          },
        },
      },
      { $sort: { priorityValue: 1, createdAt: 1 } },
      { $limit: limit },
    ]);
  }

  /**
   * Priority sort helper - CRITICAL first, BACKGROUND last
   */
  private getPrioritySortValue(): Record<string, number> {
    return {
      [MessagePriority.CRITICAL]: 1,
      [MessagePriority.HIGH]: 2,
      [MessagePriority.NORMAL]: 3,
      [MessagePriority.LOW]: 4,
      [MessagePriority.BACKGROUND]: 5,
    };
  }
}
