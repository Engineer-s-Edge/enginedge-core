import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Goal, GoalDocument } from '../entities/goal.entity';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from '../dto/goal.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('GoalsService initialized', GoalsService.name);
  }

  async create(userId: string, createGoalDto: CreateGoalDto): Promise<Goal> {
    this.logger.info(
      `Creating goal for user: ${userId}, title: ${createGoalDto.title}`,
      GoalsService.name,
    );
    try {
      const goal = new this.goalModel({
        ...createGoalDto,
        userId,
        startDate: new Date(createGoalDto.startDate),
        targetDate: createGoalDto.targetDate
          ? new Date(createGoalDto.targetDate)
          : undefined,
      });
      const savedGoal = await goal.save();
      this.logger.info(
        `Successfully created goal: ${savedGoal._id} for user: ${userId}`,
        GoalsService.name,
      );
      return savedGoal;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create goal for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
    }
  }

  async findAll(userId: string): Promise<Goal[]> {
    this.logger.info(
      `Finding all goals for user: ${userId}`,
      GoalsService.name,
    );
    try {
      const goals = await this.goalModel.find({ userId }).exec();
      this.logger.info(
        `Found ${goals.length} goals for user: ${userId}`,
        GoalsService.name,
      );
      return goals;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find goals for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
    }
  }

  async findOne(id: string, userId: string): Promise<Goal> {
    this.logger.info(
      `Finding goal: ${id} for user: ${userId}`,
      GoalsService.name,
    );
    try {
      const goal = await this.goalModel.findOne({ _id: id, userId }).exec();
      if (!goal) {
        this.logger.warn(
          `Goal not found: ${id} for user: ${userId}`,
          GoalsService.name,
        );
        throw new NotFoundException(`Goal with ID ${id} not found`);
      }
      this.logger.info(
        `Found goal: ${id} for user: ${userId}`,
        GoalsService.name,
      );
      return goal;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find goal: ${id} for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
    }
  }

  async update(
    id: string,
    userId: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<Goal> {
    this.logger.info(
      `Updating goal: ${id} for user: ${userId}`,
      GoalsService.name,
    );
    try {
      const goal = await this.goalModel
        .findOneAndUpdate(
          { _id: id, userId },
          { ...updateGoalDto, updatedAt: new Date() },
          { new: true },
        )
        .exec();

      if (!goal) {
        this.logger.warn(
          `Goal not found for update: ${id} for user: ${userId}`,
          GoalsService.name,
        );
        throw new NotFoundException(`Goal with ID ${id} not found`);
      }
      this.logger.info(
        `Successfully updated goal: ${id} for user: ${userId}`,
        GoalsService.name,
      );
      return goal;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to update goal: ${id} for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
    }
  }

  async updateProgress(
    id: string,
    userId: string,
    progressDto: UpdateGoalProgressDto,
  ): Promise<Goal> {
    this.logger.info(
      `Updating progress for goal: ${id} for user: ${userId}, progress: ${progressDto.progress}%`,
      GoalsService.name,
    );
    try {
      const updateData: any = {
        progress: progressDto.progress,
        updatedAt: new Date(),
      };

      // Auto-update status based on progress
      if (progressDto.progress === 100) {
        updateData.status = 'completed';
        this.logger.info(`Goal ${id} marked as completed`, GoalsService.name);
      } else if (progressDto.progress > 0) {
        updateData.status = 'in_progress';
        this.logger.info(`Goal ${id} marked as in progress`, GoalsService.name);
      }

      const goal = await this.goalModel
        .findOneAndUpdate({ _id: id, userId }, updateData, { new: true })
        .exec();

      if (!goal) {
        this.logger.warn(
          `Goal not found for progress update: ${id} for user: ${userId}`,
          GoalsService.name,
        );
        throw new NotFoundException(`Goal with ID ${id} not found`);
      }
      this.logger.info(
        `Successfully updated progress for goal: ${id} to ${progressDto.progress}%`,
        GoalsService.name,
      );
      return goal;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to update progress for goal: ${id} for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.info(
      `Removing goal: ${id} for user: ${userId}`,
      GoalsService.name,
    );
    try {
      const result = await this.goalModel.deleteOne({ _id: id, userId }).exec();
      if (result.deletedCount === 0) {
        this.logger.warn(
          `Goal not found for removal: ${id} for user: ${userId}`,
          GoalsService.name,
        );
        throw new NotFoundException(`Goal with ID ${id} not found`);
      }
      this.logger.info(
        `Successfully removed goal: ${id} for user: ${userId}`,
        GoalsService.name,
      );
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to remove goal: ${id} for user: ${userId}`,
        e.stack,
        GoalsService.name,
      );
      throw e;
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
