import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskProviderService } from './task-provider.service';
import { TimeSlotService } from './time-slot.service';
import { TaskSchedulerService } from './task-scheduler.service';
import { TaskCompletionService } from './task-completion.service';
import {
  ScheduleItem,
  ScheduleSlot,
  AvailableTimeSlot,
} from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

export { ScheduleItem, ScheduleSlot, AvailableTimeSlot };

@Injectable()
export class SchedulingService {
  constructor(
    private readonly configService: ConfigService,
    private taskProviderService: TaskProviderService,
    private timeSlotService: TimeSlotService,
    private taskSchedulerService: TaskSchedulerService,
    private taskCompletionService: TaskCompletionService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('SchedulingService initialized', SchedulingService.name);
  }

  async scheduleItemsForToday(
    userId: string,
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours?: { start: string; end: string },
  ): Promise<ScheduleSlot[]> {
    this.logger.info(
      `Scheduling items for today for user: ${userId}`,
      SchedulingService.name,
    );
    try {
      const wh = workingHours ||
        this.configService.get<{ start: string; end: string }>(
          'scheduling.defaultWorkingHours',
        ) || { start: '09:00', end: '17:00' };
      const unmetItems =
        await this.taskProviderService.getUnmetItemsForScheduling(userId);
      this.logger.info(
        `Found ${unmetItems.length} unmet items for scheduling`,
        SchedulingService.name,
      );

      const availableSlots = this.timeSlotService.findAvailableTimeSlots(
        busySlots,
        wh,
      );
      this.logger.info(
        `Found ${availableSlots.length} available time slots`,
        SchedulingService.name,
      );

      const scheduledSlots = this.taskSchedulerService.fitItemsIntoSlots(
        unmetItems,
        availableSlots,
      );
      this.logger.info(
        `Scheduled ${scheduledSlots.length} items into time slots`,
        SchedulingService.name,
      );

      await this.taskCompletionService.markScheduledItemsAsMet(
        userId,
        scheduledSlots,
      );
      this.logger.info(
        `Successfully scheduled items for today for user: ${userId}`,
        SchedulingService.name,
      );

      return scheduledSlots;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to schedule items for today for user: ${userId}`,
        e.stack,
        SchedulingService.name,
      );
      throw e;
    }
  }

  async previewSchedule(
    userId: string,
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours?: { start: string; end: string },
    markAsMet: boolean = false,
  ): Promise<{
    scheduledItems: ScheduleSlot[];
    unscheduledItems: ScheduleItem[];
    availableSlots: AvailableTimeSlot[];
  }> {
    const wh = workingHours ||
      this.configService.get<{ start: string; end: string }>(
        'scheduling.defaultWorkingHours',
      ) || { start: '09:00', end: '17:00' };
    const unmetItems =
      await this.taskProviderService.getUnmetItemsForScheduling(userId);
    const availableSlots = this.timeSlotService.findAvailableTimeSlots(
      busySlots,
      wh,
    );
    const scheduledItems = this.taskSchedulerService.fitItemsIntoSlots(
      unmetItems,
      availableSlots,
    );

    const scheduledOriginalIds = new Set<string>();
    scheduledItems.forEach((slot) => {
      if (slot.item.isSplit) {
        const originalId = slot.item.id.split('_part_')[0];
        scheduledOriginalIds.add(originalId);
      } else {
        scheduledOriginalIds.add(slot.item.id);
      }
    });

    const unscheduledItems = unmetItems.filter(
      (item) => !scheduledOriginalIds.has(item.id),
    );

    if (markAsMet && scheduledItems.length > 0) {
      try {
        await this.taskCompletionService.markScheduledItemsAsMet(
          userId,
          scheduledItems,
        );
        this.logger.info(
          `✅ Marked ${scheduledItems.length} scheduled items as met for today`,
          SchedulingService.name,
        );
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to mark scheduled items as met: ${e.message}`,
          e.stack,
          SchedulingService.name,
        );
      }
    }

    return {
      scheduledItems,
      unscheduledItems,
      availableSlots,
    };
  }

  async scheduleProvidedItems(
    items: ScheduleItem[],
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours?: { start: string; end: string },
    markAsMet: boolean = false,
    userId?: string,
  ): Promise<{
    scheduledItems: ScheduleSlot[];
    unscheduledItems: ScheduleItem[];
    availableSlots: AvailableTimeSlot[];
  }> {
    const wh = workingHours ||
      this.configService.get<{ start: string; end: string }>(
        'scheduling.defaultWorkingHours',
      ) || { start: '09:00', end: '17:00' };
    const availableSlots = this.timeSlotService.findAvailableTimeSlots(
      busySlots,
      wh,
    );
    const scheduledItems = this.taskSchedulerService.fitItemsIntoSlots(
      items,
      availableSlots,
    );

    const scheduledOriginalIds = new Set<string>();
    scheduledItems.forEach((slot) => {
      if (slot.item.isSplit) {
        const originalId = slot.item.id.split('_part_')[0];
        scheduledOriginalIds.add(originalId);
      } else {
        scheduledOriginalIds.add(slot.item.id);
      }
    });

    const unscheduledItems = items.filter(
      (item) => !scheduledOriginalIds.has(item.id),
    );

    if (markAsMet && userId && scheduledItems.length > 0) {
      try {
        await this.taskCompletionService.markScheduledItemsAsMet(
          userId,
          scheduledItems,
        );
        this.logger.info(
          `✅ Marked ${scheduledItems.length} scheduled items as met for today`,
          SchedulingService.name,
        );
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to mark scheduled items as met: ${e.message}`,
          e.stack,
          SchedulingService.name,
        );
      }
    }

    return {
      scheduledItems,
      unscheduledItems,
      availableSlots,
    };
  }

  /**
   * Get unmet items for scheduling - wrapper for task provider service
   */
  async getUnmetItemsForScheduling(userId: string): Promise<ScheduleItem[]> {
    return this.taskProviderService.getUnmetItemsForScheduling(userId);
  }
}
