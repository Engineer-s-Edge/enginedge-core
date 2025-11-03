import { Injectable } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { HabitsService } from './habits.service';

export interface DailyTimeBreakdown {
  habits: number;
  goals: number;
  total: number;
  habitsCount: number;
  goalsCount: number;
}

export interface TimeCommitmentItem {
  id: string;
  title: string;
  type: 'habit' | 'goal';
  dailyTimeCommitment: number;
  priority: string;
  status: string;
}

@Injectable()
export class TimeManagementService {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly habitsService: HabitsService,
  ) {}

  async getDailyTimeBreakdown(userId: string): Promise<DailyTimeBreakdown> {
    const [habitsTime, goalsTime] = await Promise.all([
      this.habitsService.getTotalDailyTimeCommitment(userId),
      this.goalsService.getTotalDailyTimeCommitment(userId),
    ]);

    const [activeHabits, activeGoals] = await Promise.all([
      this.habitsService.getHabitsByTimeCommitment(userId),
      this.goalsService.getGoalsByTimeCommitment(userId),
    ]);

    return {
      habits: habitsTime,
      goals: goalsTime,
      total: habitsTime + goalsTime,
      habitsCount: activeHabits.length,
      goalsCount: activeGoals.length,
    };
  }

  async getAllTimeCommitments(userId: string): Promise<TimeCommitmentItem[]> {
    const [habits, goals] = await Promise.all([
      this.habitsService.getHabitsByTimeCommitment(userId),
      this.goalsService.getGoalsByTimeCommitment(userId),
    ]);

    const timeCommitments: TimeCommitmentItem[] = [];

    // Add habits
    habits.forEach((habit) => {
      if (habit.dailyTimeCommitment) {
        timeCommitments.push({
          id: habit._id?.toString() || '',
          title: habit.title,
          type: 'habit',
          dailyTimeCommitment: habit.dailyTimeCommitment,
          priority: habit.priority,
          status: habit.status,
        });
      }
    });

    // Add goals
    goals.forEach((goal) => {
      if (goal.dailyTimeCommitment) {
        timeCommitments.push({
          id: goal._id?.toString() || '',
          title: goal.title,
          type: 'goal',
          dailyTimeCommitment: goal.dailyTimeCommitment,
          priority: goal.priority,
          status: goal.status,
        });
      }
    });

    // Sort by daily time commitment (descending)
    return timeCommitments.sort(
      (a, b) => b.dailyTimeCommitment - a.dailyTimeCommitment,
    );
  }

  async getTimeCommitmentsByRange(
    userId: string,
    minMinutes?: number,
    maxMinutes?: number,
  ): Promise<TimeCommitmentItem[]> {
    const [habits, goals] = await Promise.all([
      this.habitsService.getHabitsByTimeCommitment(
        userId,
        minMinutes,
        maxMinutes,
      ),
      this.goalsService.getGoalsByTimeCommitment(
        userId,
        minMinutes,
        maxMinutes,
      ),
    ]);

    const timeCommitments: TimeCommitmentItem[] = [];

    // Add habits
    habits.forEach((habit) => {
      if (habit.dailyTimeCommitment) {
        timeCommitments.push({
          id: habit._id?.toString() || '',
          title: habit.title,
          type: 'habit',
          dailyTimeCommitment: habit.dailyTimeCommitment,
          priority: habit.priority,
          status: habit.status,
        });
      }
    });

    // Add goals
    goals.forEach((goal) => {
      if (goal.dailyTimeCommitment) {
        timeCommitments.push({
          id: goal._id?.toString() || '',
          title: goal.title,
          type: 'goal',
          dailyTimeCommitment: goal.dailyTimeCommitment,
          priority: goal.priority,
          status: goal.status,
        });
      }
    });

    return timeCommitments.sort(
      (a, b) => b.dailyTimeCommitment - a.dailyTimeCommitment,
    );
  }

  async validateDailyTimeLimit(
    userId: string,
    maxDailyMinutes: number,
  ): Promise<{
    isValid: boolean;
    currentTotal: number;
    maxLimit: number;
    exceededBy?: number;
  }> {
    const breakdown = await this.getDailyTimeBreakdown(userId);
    const isValid = breakdown.total <= maxDailyMinutes;

    return {
      isValid,
      currentTotal: breakdown.total,
      maxLimit: maxDailyMinutes,
      exceededBy: isValid ? undefined : breakdown.total - maxDailyMinutes,
    };
  }
}
