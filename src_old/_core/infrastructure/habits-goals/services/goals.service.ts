import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Goal, GoalDocument } from '../entities/goal.entity';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from '../dto/goal.dto';

@Injectable()
export class GoalsService {
  constructor(@InjectModel(Goal.name) private goalModel: Model<GoalDocument>) {}

  async create(userId: string, createGoalDto: CreateGoalDto): Promise<Goal> {
    const goal = new this.goalModel({
      ...createGoalDto,
      userId,
      startDate: new Date(createGoalDto.startDate),
      targetDate: createGoalDto.targetDate
        ? new Date(createGoalDto.targetDate)
        : undefined,
    });
    return goal.save();
  }

  async findAll(userId: string): Promise<Goal[]> {
    return this.goalModel.find({ userId }).exec();
  }

  async findOne(id: string, userId: string): Promise<Goal> {
    const goal = await this.goalModel.findOne({ _id: id, userId }).exec();
    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }
    return goal;
  }

  async update(
    id: string,
    userId: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<Goal> {
    const goal = await this.goalModel
      .findOneAndUpdate(
        { _id: id, userId },
        { ...updateGoalDto, updatedAt: new Date() },
        { new: true },
      )
      .exec();

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }
    return goal;
  }

  async updateProgress(
    id: string,
    userId: string,
    progressDto: UpdateGoalProgressDto,
  ): Promise<Goal> {
    const updateData: any = {
      progress: progressDto.progress,
      updatedAt: new Date(),
    };

    // Auto-update status based on progress
    if (progressDto.progress === 100) {
      updateData.status = 'completed';
    } else if (progressDto.progress > 0) {
      updateData.status = 'in_progress';
    }

    const goal = await this.goalModel
      .findOneAndUpdate({ _id: id, userId }, updateData, { new: true })
      .exec();

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }
    return goal;
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.goalModel.deleteOne({ _id: id, userId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }
  }

  async getUnmetGoals(userId: string): Promise<Goal[]> {
    const today = new Date();

    return this.goalModel
      .find({
        userId,
        status: { $in: ['not_started', 'in_progress'] },
        $or: [
          { targetDate: { $exists: false } },
          { targetDate: { $gte: today } },
        ],
      })
      .sort({ priority: 1, targetDate: 1 })
      .exec();
  }

  async getGoalsByPriority(
    userId: string,
    priorities: string[],
  ): Promise<Goal[]> {
    return this.goalModel
      .find({
        userId,
        priority: { $in: priorities },
        status: { $in: ['not_started', 'in_progress'] },
      })
      .sort({ priority: 1, targetDate: 1 })
      .exec();
  }

  async getOverdueGoals(userId: string): Promise<Goal[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.goalModel
      .find({
        userId,
        status: { $in: ['not_started', 'in_progress'] },
        targetDate: { $lt: today },
      })
      .sort({ targetDate: 1 })
      .exec();
  }

  async getGoalsByStatus(userId: string, statuses: string[]): Promise<Goal[]> {
    return this.goalModel
      .find({
        userId,
        status: { $in: statuses },
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async getTotalDailyTimeCommitment(userId: string): Promise<number> {
    const activeGoals = await this.goalModel
      .find({
        userId,
        status: { $in: ['not_started', 'in_progress'] },
        dailyTimeCommitment: { $exists: true, $gt: 0 },
      })
      .exec();

    return activeGoals.reduce(
      (total, goal) => total + (goal.dailyTimeCommitment || 0),
      0,
    );
  }

  async getGoalsByTimeCommitment(
    userId: string,
    minMinutes?: number,
    maxMinutes?: number,
  ): Promise<Goal[]> {
    const query: any = {
      userId,
      status: { $in: ['not_started', 'in_progress'] },
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    };

    if (minMinutes !== undefined) {
      query.dailyTimeCommitment.$gte = minMinutes;
    }
    if (maxMinutes !== undefined) {
      query.dailyTimeCommitment.$lte = maxMinutes;
    }

    return this.goalModel.find(query).sort({ dailyTimeCommitment: 1 }).exec();
  }
}
