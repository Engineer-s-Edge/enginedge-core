import { Injectable } from '@nestjs/common';
import { HabitsService } from '../../habits-goals/services/habits.service';
import { GoalsService } from '../../habits-goals/services/goals.service';
import { Priority } from '../../habits-goals/dto/habit.dto';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class DataSyncService {
  constructor(
    private habitsService: HabitsService,
    private goalsService: GoalsService,
    private readonly logger: MyLogger,
  ) {}

  async syncFrontendHabitsToDatabase(
    habitsData: any[],
    userId: string,
  ): Promise<any[]> {
    const syncedHabits = [];

    for (const habit of habitsData) {
      try {
        const mappedPriority = this.mapPriorityForDatabase(habit.priority);

        const existingHabits = await this.habitsService.findAll(userId);
        const existingHabit = existingHabits.find(
          (h) => h.title === habit.title,
        );

        if (existingHabit) {
          const habitId = existingHabit._id?.toString();
          if (habitId) {
            const updatedHabit = await this.habitsService.update(
              habitId,
              userId,
              {
                description: habit.description,
                frequency: habit.frequency,
                priority: mappedPriority as Priority,
                dailyTimeCommitment: habit.dailyTimeCommitment,
                status: habit.status,
                category: habit.category,
                targetDays: habit.targetDays,
              },
            );
            syncedHabits.push(updatedHabit);
          }
        } else {
          const newHabit = await this.habitsService.create(userId, {
            title: habit.title,
            description: habit.description,
            frequency: habit.frequency || 'daily',
            priority: (mappedPriority || 'medium') as Priority,
            dailyTimeCommitment: habit.dailyTimeCommitment,
            status: habit.status || 'active',
            category: habit.category,
            startDate:
              habit.startDate || new Date().toISOString().split('T')[0],
            targetDays: habit.targetDays,
          });
          syncedHabits.push(newHabit);
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Failed to sync habit "${habit.title}": ${info.message}`,
          info.stack,
          DataSyncService.name,
        );
      }
    }

    return syncedHabits;
  }

  async syncFrontendGoalsToDatabase(
    goalsData: any[],
    userId: string,
  ): Promise<any[]> {
    const syncedGoals = [];

    for (const goal of goalsData) {
      try {
        const mappedPriority = this.mapPriorityForDatabase(goal.priority);

        const existingGoals = await this.goalsService.findAll(userId);
        const existingGoal = existingGoals.find((g) => g.title === goal.title);

        if (existingGoal) {
          const goalId = existingGoal._id?.toString();
          if (goalId) {
            const updatedGoal = await this.goalsService.update(goalId, userId, {
              description: goal.description,
              status: goal.status,
              priority: mappedPriority as Priority,
              dailyTimeCommitment: goal.dailyTimeCommitment,
              category: goal.category,
              progress: goal.progress,
              estimatedDuration: goal.estimatedDuration,
            });
            syncedGoals.push(updatedGoal);
          }
        } else {
          const newGoal = await this.goalsService.create(userId, {
            title: goal.title,
            description: goal.description,
            status: goal.status || 'not_started',
            priority: (mappedPriority || 'medium') as Priority,
            dailyTimeCommitment: goal.dailyTimeCommitment,
            category: goal.category,
            startDate: goal.startDate || new Date().toISOString().split('T')[0],
            progress: goal.progress || 0,
            estimatedDuration: goal.estimatedDuration,
          });
          syncedGoals.push(newGoal);
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Failed to sync goal "${goal.title}": ${info.message}`,
          info.stack,
          DataSyncService.name,
        );
      }
    }

    return syncedGoals;
  }

  private mapPriorityForDatabase(priority: string): string {
    switch (priority?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'medium':
        return 'medium';
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      case 'urgent':
        return 'critical';
      default:
        return 'medium';
    }
  }
}
