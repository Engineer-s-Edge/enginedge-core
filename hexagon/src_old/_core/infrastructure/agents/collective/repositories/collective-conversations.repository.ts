import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CollectiveConversation,
  CollectiveConversationDocument,
  ConversationMessage,
  ConversationStatus,
} from '../entities/collective-conversation.entity';

@Injectable()
export class CollectiveConversationsRepository {
  constructor(
    @InjectModel(CollectiveConversation.name)
    private conversationModel: Model<CollectiveConversationDocument>,
  ) {}

  async create(
    conversationData: Partial<CollectiveConversation>,
  ): Promise<CollectiveConversationDocument> {
    const conversation = new this.conversationModel(conversationData);
    return conversation.save();
  }

  async findById(
    id: string | Types.ObjectId,
  ): Promise<CollectiveConversationDocument | null> {
    return this.conversationModel.findById(id).exec();
  }

  async findByTaskId(
    taskId: string | Types.ObjectId,
  ): Promise<CollectiveConversationDocument | null> {
    return this.conversationModel.findOne({ taskId }).exec();
  }

  async findByAgentId(
    collectiveId: string | Types.ObjectId,
    agentId: string,
  ): Promise<CollectiveConversationDocument[]> {
    return this.conversationModel.find({ collectiveId, agentId }).exec();
  }

  async findActiveByAgent(
    agentId: string,
  ): Promise<CollectiveConversationDocument[]> {
    return this.conversationModel
      .find({ agentId, status: ConversationStatus.ACTIVE })
      .exec();
  }

  async addMessage(
    id: string | Types.ObjectId,
    message: ConversationMessage,
  ): Promise<CollectiveConversationDocument | null> {
    return this.conversationModel
      .findByIdAndUpdate(
        id,
        {
          $push: { messages: message },
        },
        { new: true },
      )
      .exec();
  }

  async updateSummary(
    id: string | Types.ObjectId,
    summary: string,
  ): Promise<CollectiveConversationDocument | null> {
    return this.conversationModel
      .findByIdAndUpdate(
        id,
        {
          summary,
          lastSummarizedAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: ConversationStatus,
  ): Promise<CollectiveConversationDocument | null> {
    const updates: any = { status };

    if (status === ConversationStatus.PAUSED) {
      updates.pausedAt = new Date();
    }

    if (status === ConversationStatus.ACTIVE) {
      updates.resumedAt = new Date();
    }

    return this.conversationModel.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async searchConversations(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    query: string,
  ): Promise<CollectiveConversationDocument[]> {
    // Search in summaries and message content
    return this.conversationModel
      .find({
        collectiveId,
        agentId,
        $or: [
          { summary: { $regex: query, $options: 'i' } },
          { 'messages.content': { $regex: query, $options: 'i' } },
        ],
      })
      .exec();
  }

  async searchAllConversations(
    collectiveId: string | Types.ObjectId,
    query: string,
  ): Promise<CollectiveConversationDocument[]> {
    // PM can search all conversations
    return this.conversationModel
      .find({
        collectiveId,
        $or: [
          { summary: { $regex: query, $options: 'i' } },
          { 'messages.content': { $regex: query, $options: 'i' } },
        ],
      })
      .exec();
  }

  async deleteByCollectiveId(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.conversationModel.deleteMany({ collectiveId }).exec();
    return result.deletedCount;
  }
}
