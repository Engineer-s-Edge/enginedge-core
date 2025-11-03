import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Habit, HabitDocument, HabitEntry } from '../entities/habit.entity';
import {
  CreateHabitDto,
  UpdateHabitDto,
  HabitEntryToggleDto,
} from '../dto/habit.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class HabitsService {
  constructor(
    @InjectModel(Habit.name) private habitModel: Model<HabitDocument>,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('HabitsService initialized', HabitsService.name);
  }

  async create(userId: string, createHabitDto: CreateHabitDto): Promise<Habit> {
    this.logger.info(
      `Creating habit for user: ${userId}, title: ${createHabitDto.title}`,
      HabitsService.name,
    );
    try {
      const habit = new this.habitModel({
        ...createHabitDto,
        userId,
        startDate: new Date(createHabitDto.startDate),
        endDate: createHabitDto.endDate
          ? new Date(createHabitDto.endDate)
          : undefined,
      });
      const savedHabit = await habit.save();
      this.logger.info(
        `Successfully created habit: ${savedHabit._id} for user: ${userId}`,
        HabitsService.name,
      );
      return savedHabit;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create habit for user: ${userId}`,
        e.stack,
        HabitsService.name,
      );
      throw e;
    }
  }

  async findAll(userId: string): Promise<Habit[]> {
    this.logger.info(
      `Finding all habits for user: ${userId}`,
      HabitsService.name,
    );
    try {
      const habits = await this.habitModel.find({ userId }).exec();
      this.logger.info(
        `Found ${habits.length} habits for user: ${userId}`,
        HabitsService.name,
      );
      return habits;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find habits for user: ${userId}`,
        e.stack,
        HabitsService.name,
      );
      throw e;
    }
  }

  async findOne(id: string, userId: string): Promise<Habit> {
    this.logger.info(
      `Finding habit: ${id} for user: ${userId}`,
      HabitsService.name,
    );
    try {
      const habit = await this.habitModel.findOne({ _id: id, userId }).exec();
      if (!habit) {
        this.logger.warn(
          `Habit not found: ${id} for user: ${userId}`,
          HabitsService.name,
        );
        throw new NotFoundException(`Habit with ID ${id} not found`);
      }
      this.logger.info(
        `Found habit: ${id} for user: ${userId}`,
        HabitsService.name,
      );
      return habit;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find habit: ${id} for user: ${userId}`,
        e.stack,
        HabitsService.name,
      );
      throw e;
    }
  }

  async update(
    id: string,
    userId: string,
    updateHabitDto: UpdateHabitDto,
  ): Promise<Habit> {
    this.logger.info(
      `Updating habit: ${id} for user: ${userId}`,
      HabitsService.name,
    );
    try {
      const habit = await this.habitModel
        .findOneAndUpdate(
          { _id: id, userId },
          { ...updateHabitDto, updatedAt: new Date() },
          { new: true },
        )
        .exec();

      if (!habit) {
        this.logger.warn(
          `Habit not found for update: ${id} for user: ${userId}`,
          HabitsService.name,
        );
        throw new NotFoundException(`Habit with ID ${id} not found`);
      }
      this.logger.info(
        `Successfully updated habit: ${id} for user: ${userId}`,
        HabitsService.name,
      );
      return habit;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to update habit: ${id} for user: ${userId}`,
        e.stack,
        HabitsService.name,
      );
      throw e;
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.info(
      `Removing habit: ${id} for user: ${userId}`,
      HabitsService.name,
    );
    try {
      const result = await this.habitModel
        .deleteOne({ _id: id, userId })
        .exec();
      if (result.deletedCount === 0) {
        this.logger.warn(
          `Habit not found for removal: ${id} for user: ${userId}`,
          HabitsService.name,
        );
        throw new NotFoundException(`Habit with ID ${id} not found`);
      }
      this.logger.info(
        `Successfully removed habit: ${id} for user: ${userId}`,
        HabitsService.name,
      );
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to remove habit: ${id} for user: ${userId}`,
        e.stack,
        HabitsService.name,
      );
      throw e;
    }
  }

  async toggleEntry(
    id: string,
    userId: string,
    entryData: HabitEntryToggleDto,
  ): Promise<Habit> {
    const habit = (await this.findOne(id, userId)) as HabitDocument;
    const entryDate = new Date(entryData.date);

    // Find existing entry for this date
    const existingEntryIndex = habit.entries.findIndex(
      (entry: HabitEntry) =>
        entry.date.toDateString() === entryDate.toDateString(),
    );

    if (existingEntryIndex >= 0) {
      // Update existing entry
      if (entryData.completed !== undefined) {
        habit.entries[existingEntryIndex].completed = entryData.completed;
      }
      if (entryData.notes !== undefined) {
        habit.entries[existingEntryIndex].notes = entryData.notes;
      }
      if (entryData.mood !== undefined) {
        habit.entries[existingEntryIndex].mood = entryData.mood;
      }
    } else {
      // Create new entry
      const newEntry: HabitEntry = {
        date: entryDate,
        completed: entryData.completed ?? false,
        notes: entryData.notes ?? '',
        mood: entryData.mood,
        createdAt: new Date(),
      };
      habit.entries.push(newEntry);
    }

    habit.updatedAt = new Date();
    return habit.save();
  }

  async getUnmetHabits(userId: string): Promise<Habit[]> {
    const habits = await this.findAll(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return habits.filter((habit) => {
      if (habit.status !== 'active') return false;

      // Check if habit should be done today based on frequency
      const shouldBeDoneToday = this.shouldHabitBeDoneToday(habit, today);
      if (!shouldBeDoneToday) return false;

      // Check if already completed today
      const todayEntry = habit.entries.find(
        (entry: HabitEntry) =>
          entry.date.toDateString() === today.toDateString(),
      );

      return !todayEntry || !todayEntry.completed;
    });
  }

  private shouldHabitBeDoneToday(habit: Habit, today: Date): boolean {
    const startDate = new Date(habit.startDate);
    startDate.setHours(0, 0, 0, 0);

    // If habit hasn't started yet
    if (today < startDate) return false;

    // If habit has ended
    if (habit.endDate) {
      const endDate = new Date(habit.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (today > endDate) return false;
    }

    const daysDiff = Math.floor(
      (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    switch (habit.frequency) {
      case 'daily':
        return true;
      case 'weekly':
        return daysDiff % 7 === 0;
      case 'monthly':
        // Check if same day of month (simplified)
        return today.getDate() === startDate.getDate();
      case 'custom':
        return habit.customFrequency
          ? daysDiff % habit.customFrequency === 0
          : false;
      default:
        return false;
    }
  }

  async getHabitsByPriority(
    userId: string,
    priorities: string[],
  ): Promise<Habit[]> {
    return this.habitModel
      .find({
        userId,
        priority: { $in: priorities },
        status: 'active',
      })
      .sort({ priority: 1 })
      .exec();
  }

  async getTotalDailyTimeCommitment(userId: string): Promise<number> {
    const activeHabits = await this.habitModel
      .find({
        userId,
        status: 'active',
        dailyTimeCommitment: { $exists: true, $gt: 0 },
      })
      .exec();

    return activeHabits.reduce(
      (total: number, habit: Habit) => total + (habit.dailyTimeCommitment || 0),
      0,
    );
  }

  async getHabitsByTimeCommitment(
    userId: string,
    minMinutes?: number,
    maxMinutes?: number,
  ): Promise<Habit[]> {
    const query: any = {
      userId,
      status: 'active',
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    };

    if (minMinutes !== undefined) {
      query.dailyTimeCommitment.$gte = minMinutes;
    }
    if (maxMinutes !== undefined) {
      query.dailyTimeCommitment.$lte = maxMinutes;
    }

    return this.habitModel.find(query).sort({ dailyTimeCommitment: 1 }).exec();
  }

  async getCombinedDailyTimeCommitment(
    userId: string,
  ): Promise<{ habits: number; goals: number; total: number }> {
    const habitsTime = await this.getTotalDailyTimeCommitment(userId);

    // We need access to the goals service to get goals time
    // This would be better implemented at a higher level service that has access to both
    return {
      habits: habitsTime,
      goals: 0, // Would need GoalsService injected to calculate this
      total: habitsTime,
    };
  }
}
