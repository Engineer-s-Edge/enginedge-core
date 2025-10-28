import { Injectable } from '@nestjs/common';
import { TaskSplittingService } from './task-splitting.service';
import {
  ScheduleItem,
  ScheduleSlot,
  AvailableTimeSlot,
} from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class TaskSchedulerService {
  constructor(
    private taskSplittingService: TaskSplittingService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'TaskSchedulerService initialized',
      TaskSchedulerService.name,
    );
  }

  fitItemsIntoSlots(
    items: ScheduleItem[],
    availableSlots: AvailableTimeSlot[],
  ): ScheduleSlot[] {
    const scheduledItems: ScheduleSlot[] = [];
    const remainingSlots = [...availableSlots].filter(
      (slot) => slot.duration >= 5,
    );
    const itemsToProcess = [...items];

    this.logger.info(
      `fitItemsIntoSlots: Processing ${items.length} items with ${availableSlots.length} available slots`,
      TaskSchedulerService.name,
    );
    items.forEach((item, i) => {
      this.logger.info(
        `  Item ${i + 1}: ${item.title} (${item.estimatedDuration} min, priority: ${item.priority})`,
        TaskSchedulerService.name,
      );
    });

    const sortedItems = this.sortByPriority(itemsToProcess);

    for (const item of sortedItems) {
      if (remainingSlots.length === 0) break;

      this.logger.info(
        `Processing item: ${item.title} (${item.estimatedDuration} min)`,
        TaskSchedulerService.name,
      );
      this.logger.info(
        `  Available remaining slots: ${remainingSlots.length}`,
        TaskSchedulerService.name,
      );
      remainingSlots.forEach((slot, i) => {
        this.logger.info(
          `    Slot ${i + 1}: ${slot.start.toISOString()} to ${slot.end.toISOString()} (${slot.duration} min)`,
          TaskSchedulerService.name,
        );
      });

      let itemScheduled = false;

      const slotIndex = remainingSlots.findIndex(
        (slot) => slot.duration >= item.estimatedDuration,
      );

      if (slotIndex !== -1) {
        const slot = remainingSlots[slotIndex];
        const itemEndTime = new Date(
          slot.start.getTime() + item.estimatedDuration * 60 * 1000,
        );

        this.logger.info(
          `  ✅ Item fits in slot ${slotIndex + 1}: scheduling from ${slot.start.toISOString()} to ${itemEndTime.toISOString()}`,
          TaskSchedulerService.name,
        );

        scheduledItems.push({
          startTime: new Date(slot.start),
          endTime: itemEndTime,
          item,
        });

        const remainingDuration = slot.duration - item.estimatedDuration;
        if (remainingDuration >= 5) {
          remainingSlots[slotIndex] = {
            start: itemEndTime,
            end: slot.end,
            duration: remainingDuration,
          };
        } else {
          remainingSlots.splice(slotIndex, 1);
        }
        itemScheduled = true;
      } else {
        this.logger.info(
          `  ❌ Item doesn't fit in any slot - trying to split`,
          TaskSchedulerService.name,
        );
        const chunks = this.taskSplittingService.splitItemIntoChunks(
          item,
          remainingSlots,
        );
        this.logger.info(
          `  Split into ${chunks.length} chunks`,
          TaskSchedulerService.name,
        );
        chunks.forEach((chunk, i) => {
          this.logger.info(
            `    Chunk ${i + 1}: ${chunk.title} (${chunk.estimatedDuration} min)`,
            TaskSchedulerService.name,
          );
        });

        const scheduledChunks: ScheduleItem[] = [];
        for (const chunk of chunks) {
          const chunkSlotIndex = remainingSlots.findIndex(
            (slot) => slot.duration >= chunk.estimatedDuration,
          );

          if (chunkSlotIndex !== -1) {
            const slot = remainingSlots[chunkSlotIndex];
            const chunkEndTime = new Date(
              slot.start.getTime() + chunk.estimatedDuration * 60 * 1000,
            );

            scheduledItems.push({
              startTime: new Date(slot.start),
              endTime: chunkEndTime,
              item: chunk,
            });

            scheduledChunks.push(chunk);

            const remainingDuration = slot.duration - chunk.estimatedDuration;
            if (remainingDuration >= 5) {
              remainingSlots[chunkSlotIndex] = {
                start: chunkEndTime,
                end: slot.end,
                duration: remainingDuration,
              };
            } else {
              remainingSlots.splice(chunkSlotIndex, 1);
            }
          } else {
            break;
          }
        }

        itemScheduled = scheduledChunks.length > 0;
      }

      if (remainingSlots.length === 0) {
        break;
      }
    }

    return scheduledItems;
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
