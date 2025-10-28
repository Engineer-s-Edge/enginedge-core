import { Injectable } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { ScheduleItem } from '../dto/scheduling.dto';

@Injectable()
export class TaskProviderService {
  constructor(
    private habitsService: HabitsService,
    private goalsService: GoalsService,
  ) {}

  async getUnmetItemsForScheduling(userId: string): Promise<ScheduleItem[]> {
    const [unmetHabits, unmetGoals] = await Promise.all([
      this.habitsService.getUnmetHabits(userId),
      this.goalsService.getUnmetGoals(userId),
    ]);

    const habitItems: ScheduleItem[] = unmetHabits.map((habit) => ({
      type: 'habit' as const,
      id: habit._id?.toString() || '',
      title: habit.title,
      priority: habit.priority,
      estimatedDuration: habit.dailyTimeCommitment || 30,
      item: habit,
    }));

    const goalItems: ScheduleItem[] = unmetGoals.map((goal) => ({
      type: 'goal' as const,
      id: goal._id?.toString() || '',
      title: goal.title,
      priority: goal.priority,
      estimatedDuration: goal.dailyTimeCommitment || 60,
      item: goal,
    }));

    const allItems = [...habitItems, ...goalItems];
    return this.sortByPriority(allItems);
  }

  private sortByPriority(items: ScheduleItem[]): ScheduleItem[] {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => {
      const aPriority =
        priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
      const bPriority =
        priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
      return aPriority - bPriority;
    });
  }
}
