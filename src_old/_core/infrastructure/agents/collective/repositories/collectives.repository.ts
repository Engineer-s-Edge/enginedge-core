import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Collective,
  CollectiveDocument,
  CollectiveStatus,
} from '../entities/collective.entity';

@Injectable()
export class CollectivesRepository {
  constructor(
    @InjectModel(Collective.name)
    private collectiveModel: Model<CollectiveDocument>,
  ) {}

  async create(collectiveData: Partial<Collective>): Promise<CollectiveDocument> {
    const collective = new this.collectiveModel(collectiveData);
    return collective.save();
  }

  async findById(id: string | Types.ObjectId): Promise<CollectiveDocument | null> {
    return this.collectiveModel.findById(id).exec();
  }

  async findByUserId(
    userId: string | Types.ObjectId,
    limit = 50,
  ): Promise<CollectiveDocument[]> {
    return this.collectiveModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findRunning(): Promise<CollectiveDocument[]> {
    return this.collectiveModel
      .find({ status: CollectiveStatus.RUNNING })
      .exec();
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: CollectiveStatus,
    additionalUpdates?: Partial<Collective>,
  ): Promise<CollectiveDocument | null> {
    return this.collectiveModel
      .findByIdAndUpdate(
        id,
        {
          status,
          ...additionalUpdates,
        },
        { new: true },
      )
      .exec();
  }

  async updateAgentStatus(
    collectiveId: string | Types.ObjectId,
    agentId: string,
    status: string,
    currentTaskId?: string,
  ): Promise<CollectiveDocument | null> {
    return this.collectiveModel
      .findOneAndUpdate(
        {
          _id: collectiveId,
          'agents.id': agentId,
        },
        {
          $set: {
            'agents.$.status': status,
            'agents.$.currentTaskId': currentTaskId,
          },
        },
        { new: true },
      )
      .exec();
  }

  async delete(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.collectiveModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }
}
