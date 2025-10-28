import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CollectiveEvent,
  CollectiveEventDocument,
  EventType,
} from '../entities/collective-event.entity';

@Injectable()
export class CollectiveEventsRepository {
  constructor(
    @InjectModel(CollectiveEvent.name)
    private eventModel: Model<CollectiveEventDocument>,
  ) {}

  async create(eventData: Partial<CollectiveEvent>): Promise<CollectiveEventDocument> {
    const event = new this.eventModel({
      ...eventData,
      timestamp: eventData.timestamp || new Date(),
    });
    return event.save();
  }

  async findByCollectiveId(
    collectiveId: string | Types.ObjectId,
    limit = 100,
  ): Promise<CollectiveEventDocument[]> {
    return this.eventModel
      .find({ collectiveId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  async findByType(
    collectiveId: string | Types.ObjectId,
    type: EventType,
    limit = 100,
  ): Promise<CollectiveEventDocument[]> {
    return this.eventModel
      .find({ collectiveId, type })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  async findByActorId(
    collectiveId: string | Types.ObjectId,
    actorId: string,
    limit = 100,
  ): Promise<CollectiveEventDocument[]> {
    return this.eventModel
      .find({ collectiveId, actorId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  async findByTimeRange(
    collectiveId: string | Types.ObjectId,
    startTime: Date,
    endTime: Date,
  ): Promise<CollectiveEventDocument[]> {
    return this.eventModel
      .find({
        collectiveId,
        timestamp: {
          $gte: startTime,
          $lte: endTime,
        },
      })
      .sort({ timestamp: 1 })
      .exec();
  }

  async deleteByCollectiveId(collectiveId: string | Types.ObjectId): Promise<number> {
    const result = await this.eventModel.deleteMany({ collectiveId }).exec();
    return result.deletedCount;
  }
}
