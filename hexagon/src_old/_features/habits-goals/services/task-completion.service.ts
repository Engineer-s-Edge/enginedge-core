import { Injectable } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { ScheduleSlot } from '../dto/scheduling.dto';
import { GoalStatus } from '../dto/goal.dto';
import { Goal } from '../entities/goal.entity';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class TaskCompletionService {
  constructor(
    private habitsService: HabitsService,
    private goalsService: GoalsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'TaskCompletionService initialized',
      TaskCompletionService.name,
    );
  }

  async markScheduledItemsAsMet(
    userId: string,
    scheduledSlots: ScheduleSlot[],
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const processedItems = new Set<string>();

    for (const slot of scheduledSlots) {
      const item = slot.item;
      let originalId = item.id;

      if (item.isSplit && item.id.includes('_part_')) {
        originalId = item.id.split('_part_')[0];
      }

      if (processedItems.has(originalId)) {
        continue;
      }

      if (!this.isValidObjectId(originalId)) {
        this.logger.info(
          `⏭️ Skipping marking item "${item.title}" (ID: ${originalId}) - not a database record`,
          TaskCompletionService.name,
        );
        processedItems.add(originalId);
        continue;
      }

      processedItems.add(originalId);

      try {
        if (item.type === 'habit') {
          await this.habitsService.toggleEntry(originalId, userId, {
            date: today.toISOString(),
            completed: true,
            notes: `Scheduled and completed on ${today.toDateString()}`,
          });
          this.logger.info(
            `✅ Marked habit "${item.title}" as completed for today`,
            TaskCompletionService.name,
          );
        } else if (item.type === 'goal') {
          const goalItem = item.item as Goal;
          if (goalItem.status === 'not_started') {
            await this.goalsService.update(originalId, userId, {
              status: GoalStatus.IN_PROGRESS,
            });
            this.logger.info(
              `✅ Marked goal "${item.title}" as in_progress`,
              TaskCompletionService.name,
            );
          }
        }
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to mark ${item.type} "${item.title}" as met: ${e.message}`,
          e.stack,
          TaskCompletionService.name,
        );
      }
    }
  }

  private isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
}
