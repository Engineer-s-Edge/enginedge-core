import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import {
  Assistant,
  AssistantType,
  AssistantMode,
  AssistantStatus,
} from '../entities/assistant.entity';

export interface AssistantFilters {
  type?: AssistantType;
  mode?: AssistantMode;
  status?: AssistantStatus;
  isPublic?: boolean;
  userId?: string;
  search?: string;
}

@Injectable()
export class AssistantsRepository {
  constructor(
    @InjectModel(Assistant.name) private assistantModel: Model<Assistant>,
  ) {}

  async create(assistantData: Partial<Assistant>): Promise<Assistant> {
    const assistant = new this.assistantModel(assistantData);
    return assistant.save();
  }

  async findAll(filters: AssistantFilters = {}): Promise<Assistant[]> {
    const query: FilterQuery<Assistant> = {};

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.mode) {
      query.primaryMode = filters.mode;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.isPublic !== undefined) {
      query.isPublic = filters.isPublic;
    }

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { subjectExpertise: { $in: [new RegExp(filters.search, 'i')] } },
      ];
    }

    return this.assistantModel.find(query).exec();
  }

  async findByName(name: string): Promise<Assistant | null> {
    return this.assistantModel.findOne({ name }).exec();
  }

  async findById(id: string): Promise<Assistant | null> {
    return this.assistantModel.findById(id).exec();
  }

  async update(
    name: string,
    updateData: Partial<Assistant>,
  ): Promise<Assistant | null> {
    return this.assistantModel
      .findOneAndUpdate({ name }, updateData, { new: true })
      .exec();
  }

  async delete(name: string): Promise<boolean> {
    const result = await this.assistantModel.deleteOne({ name }).exec();
    return result.deletedCount > 0;
  }

  async findPublicAssistants(): Promise<Assistant[]> {
    return this.assistantModel
      .find({ isPublic: true, status: AssistantStatus.ACTIVE })
      .exec();
  }

  async findUserAssistants(userId: string): Promise<Assistant[]> {
    return this.assistantModel
      .find({ userId, status: { $ne: AssistantStatus.DISABLED } })
      .exec();
  }

  async exists(name: string): Promise<boolean> {
    const count = await this.assistantModel.countDocuments({ name }).exec();
    return count > 0;
  }

  async updateExecutionStats(name: string): Promise<void> {
    await this.assistantModel
      .updateOne(
        { name },
        {
          $set: { lastExecuted: new Date() },
          $inc: { executionCount: 1 },
        },
      )
      .exec();
  }

  async findByType(type: AssistantType): Promise<Assistant[]> {
    return this.assistantModel
      .find({ type, status: AssistantStatus.ACTIVE })
      .exec();
  }

  async findBySubjectExpertise(subject: string): Promise<Assistant[]> {
    return this.assistantModel
      .find({
        subjectExpertise: { $in: [subject] },
        status: AssistantStatus.ACTIVE,
      })
      .exec();
  }
}
