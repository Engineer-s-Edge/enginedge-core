import { Injectable } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { Habit } from '../entities/habit.entity';
import { Goal } from '../entities/goal.entity';
import { GoalStatus } from '../dto/goal.dto';
import { MyLogger } from '../../../services/logger/logger.service';

export interface ScheduleItem {
  type: 'habit' | 'goal';
  id: string;
  title: string;
  priority: string;
  estimatedDuration: number; // in minutes
  item: Habit | Goal;
  originalDuration?: number; // Track original duration for split items
  partNumber?: number; // Track which part this is (e.g., 1, 2, 3)
  totalParts?: number; // Track total number of parts
  isSplit?: boolean; // Flag to indicate this is a split item
}

export interface ScheduleSlot {
  startTime: Date;
  endTime: Date;
  item: ScheduleItem;
}

export interface AvailableTimeSlot {
  start: Date;
  end: Date;
  duration: number; // in minutes
}

@Injectable()
export class SchedulingService {
  constructor(
    private habitsService: HabitsService,
    private goalsService: GoalsService,
    private readonly logger: MyLogger,
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
      estimatedDuration: habit.dailyTimeCommitment || 30, // Use dailyTimeCommitment, default 30 minutes
      item: habit,
    }));

    const goalItems: ScheduleItem[] = unmetGoals.map((goal) => ({
      type: 'goal' as const,
      id: goal._id?.toString() || '',
      title: goal.title,
      priority: goal.priority,
      estimatedDuration: goal.dailyTimeCommitment || 60, // Use dailyTimeCommitment, default 60 minutes
      item: goal,
    }));

    // Combine and sort by priority (critical > high > medium > low)
    const allItems = [...habitItems, ...goalItems];
    return this.sortByPriority(allItems);
  }

  private sortByPriority(items: ScheduleItem[]): ScheduleItem[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => {
      const aPriority =
        priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
      const bPriority =
        priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
      return aPriority - bPriority;
    });
  }

  async scheduleItemsForToday(
    userId: string,
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours: { start: string; end: string } = {
      start: '09:00',
      end: '18:00',
    },
  ): Promise<ScheduleSlot[]> {
    const unmetItems = await this.getUnmetItemsForScheduling(userId);
    const availableSlots = this.findAvailableTimeSlots(busySlots, workingHours);

    const scheduledSlots = this.fitItemsIntoSlots(unmetItems, availableSlots);

    // Mark scheduled items as met for today
    await this.markScheduledItemsAsMet(userId, scheduledSlots);

    return scheduledSlots;
  }

  private findAvailableTimeSlots(
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours: { start: string; end: string },
  ): AvailableTimeSlot[] {
    const today = new Date();
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);

    const workStart = new Date(today);
    workStart.setHours(startHour, startMinute, 0, 0);

    const workEnd = new Date(today);
    workEnd.setHours(endHour, endMinute, 0, 0);

    this.logger.info(
      `Finding available slots for working hours ${workingHours.start}-${workingHours.end}`,
      SchedulingService.name,
    );
    this.logger.info(
      `Received ${busySlots.length} busy slots:`,
      SchedulingService.name,
    );
    busySlots.forEach((slot, i) => {
      this.logger.info(
        `  Busy slot ${i + 1}: ${slot.start.toISOString()} to ${slot.end.toISOString()}`,
        SchedulingService.name,
      );
    });

    // Sort busy slots by start time
    const sortedBusySlots = busySlots
      .filter((slot) => {
        // Only consider slots that overlap with today's working hours
        return slot.start < workEnd && slot.end > workStart;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    this.logger.info(
      `${sortedBusySlots.length} busy slots overlap with working hours`,
      SchedulingService.name,
    );

    const availableSlots: AvailableTimeSlot[] = [];
    let currentTime = new Date(workStart);

    for (const busySlot of sortedBusySlots) {
      // If there's a gap before this busy slot
      if (currentTime < busySlot.start) {
        const duration =
          (busySlot.start.getTime() - currentTime.getTime()) / (1000 * 60);
        if (duration >= 10) {
          // Minimum 10-minute slots
          availableSlots.push({
            start: new Date(currentTime),
            end: new Date(busySlot.start),
            duration,
          });
          this.logger.info(
            `  Available slot: ${currentTime.toISOString()} to ${busySlot.start.toISOString()} (${duration} min)`,
            SchedulingService.name,
          );
        }
      }
      currentTime = new Date(
        Math.max(currentTime.getTime(), busySlot.end.getTime()),
      );
    }

    // Check for time after the last busy slot
    if (currentTime < workEnd) {
      const duration =
        (workEnd.getTime() - currentTime.getTime()) / (1000 * 60);
      if (duration >= 10) {
        availableSlots.push({
          start: new Date(currentTime),
          end: new Date(workEnd),
          duration,
        });
        this.logger.info(
          `  Available slot: ${currentTime.toISOString()} to ${workEnd.toISOString()} (${duration} min)`,
          SchedulingService.name,
        );
      }
    }

    this.logger.info(
      `Found ${availableSlots.length} available slots`,
      SchedulingService.name,
    );
    return availableSlots;
  }

  /**
   * Split a large item into smaller schedulable chunks
   */
  private splitItemIntoChunks(
    item: ScheduleItem,
    availableSlots: AvailableTimeSlot[],
  ): ScheduleItem[] {
    this.logger.info(
      `splitItemIntoChunks: Item "${item.title}" (${item.estimatedDuration} min) with ${availableSlots.length} available slots`,
      SchedulingService.name,
    );
    availableSlots.forEach((slot, i) => {
      this.logger.info(
        `  Available slot ${i + 1}: ${slot.duration} min`,
        SchedulingService.name,
      );
    });

    // Handle edge cases
    if (availableSlots.length === 0) {
      // If no slots are available, but the item is large enough to be split, create default chunks
      if (item.estimatedDuration >= 20) {
        // Only split if at least 20 minutes
        this.logger.info(
          `  No slots available, creating default chunks for large item`,
          SchedulingService.name,
        );
        return this.createDefaultChunks(item);
      }
      this.logger.info(
        `  No slots available, returning original small item`,
        SchedulingService.name,
      );
      return [item]; // Can't split if no slots available and item is small
    }

    const maxAvailableSlot = Math.max(
      ...availableSlots.map((slot) => slot.duration),
    );
    this.logger.info(
      `  Max available slot: ${maxAvailableSlot} min`,
      SchedulingService.name,
    );

    // If the item can fit in the largest available slot, don't split
    if (item.estimatedDuration <= maxAvailableSlot) {
      this.logger.info(
        `  Item fits in largest slot (${item.estimatedDuration} <= ${maxAvailableSlot}), not splitting`,
        SchedulingService.name,
      );
      return [item];
    }

    this.logger.info(
      `  Item needs splitting (${item.estimatedDuration} > ${maxAvailableSlot})`,
      SchedulingService.name,
    );

    // If the largest slot is less than 10 minutes, create default chunks for large items
    if (maxAvailableSlot < 10) {
      if (item.estimatedDuration >= 20) {
        this.logger.info(
          `  Largest slot < 10 min, creating default chunks for large item`,
          SchedulingService.name,
        );
        return this.createDefaultChunks(item);
      }
      this.logger.info(
        `  Largest slot < 10 min, returning original small item`,
        SchedulingService.name,
      );
      return [item]; // Return original item as fallback for small items
    }

    this.logger.info(
      `  Starting slot-based splitting...`,
      SchedulingService.name,
    );
    const chunks: ScheduleItem[] = [];
    let remainingDuration = item.estimatedDuration;
    let partNumber = 1;

    // Sort slots by duration descending to fill larger slots first
    const sortedSlots = [...availableSlots]
      .filter((slot) => slot.duration >= 10) // Only consider slots >= 10 minutes
      .sort((a, b) => b.duration - a.duration);

    this.logger.info(
      `  Sorted slots for processing: ${sortedSlots.length} slots >= 10 min`,
      SchedulingService.name,
    );
    sortedSlots.forEach((slot, i) => {
      this.logger.info(
        `    Sorted slot ${i + 1}: ${slot.duration} min`,
        SchedulingService.name,
      );
    });

    // Strategy 1: Try to fill each available slot optimally
    for (const slot of sortedSlots) {
      if (remainingDuration <= 0) break;

      // Calculate chunk size for this slot
      // Use the minimum of remaining duration and slot duration, but at least 10 minutes
      const chunkSize = Math.min(remainingDuration, slot.duration);
      this.logger.info(
        `  Processing slot ${slot.duration} min: chunkSize = min(${remainingDuration}, ${slot.duration}) = ${chunkSize}`,
        SchedulingService.name,
      );

      if (chunkSize >= 10) {
        this.logger.info(
          `    Creating chunk ${partNumber}: ${chunkSize} min`,
          SchedulingService.name,
        );
        chunks.push({
          ...item,
          id: `${item.id}_part_${partNumber}`,
          title: `${item.title} (Part ${partNumber})`,
          estimatedDuration: chunkSize,
          originalDuration: item.estimatedDuration,
          partNumber,
          totalParts: 0, // Will be set after all chunks are created
          isSplit: true,
        });

        remainingDuration -= chunkSize;
        partNumber++;
        this.logger.info(
          `    Remaining duration: ${remainingDuration} min`,
          SchedulingService.name,
        );
      } else {
        this.logger.info(
          `    Chunk too small (${chunkSize} < 10), skipping`,
          SchedulingService.name,
        );
      }
    }

    this.logger.info(
      `  Strategy 1 complete. Created ${chunks.length} chunks, remaining duration: ${remainingDuration} min`,
      SchedulingService.name,
    );

    // Strategy 2: If there's still remaining duration, create additional chunks using the largest available slot size
    while (remainingDuration > 0 && maxAvailableSlot >= 10) {
      const chunkSize = Math.min(remainingDuration, maxAvailableSlot);
      this.logger.info(
        `  Strategy 2: Creating chunk ${partNumber} with ${chunkSize} min (remaining: ${remainingDuration})`,
        SchedulingService.name,
      );

      if (chunkSize >= 10) {
        chunks.push({
          ...item,
          id: `${item.id}_part_${partNumber}`,
          title: `${item.title} (Part ${partNumber})`,
          estimatedDuration: chunkSize,
          originalDuration: item.estimatedDuration,
          partNumber,
          totalParts: 0, // Will be set after all chunks are created
          isSplit: true,
        });

        remainingDuration -= chunkSize;
        partNumber++;
      } else {
        // If remaining duration is less than 10 minutes, add it to the last chunk
        if (chunks.length > 0) {
          this.logger.info(
            `    Adding remaining ${remainingDuration} min to last chunk`,
            SchedulingService.name,
          );
          chunks[chunks.length - 1].estimatedDuration += remainingDuration;
        } else {
          // Edge case: create a 10-minute chunk anyway
          this.logger.info(
            `    Creating 10-min chunk for remaining ${remainingDuration} min`,
            SchedulingService.name,
          );
          chunks.push({
            ...item,
            id: `${item.id}_part_${partNumber}`,
            title: `${item.title} (Part ${partNumber})`,
            estimatedDuration: 10,
            originalDuration: item.estimatedDuration,
            partNumber,
            totalParts: 0,
            isSplit: true,
          });
        }
        break;
      }
    }

    this.logger.info(
      `  Strategy 2 complete. Total chunks: ${chunks.length}, final remaining duration: ${remainingDuration} min`,
      SchedulingService.name,
    );

    // Strategy 3: If we still couldn't create any chunks, use default chunking
    if (chunks.length === 0 && item.estimatedDuration >= 10) {
      this.logger.info(
        `  No chunks created, falling back to default chunking`,
        SchedulingService.name,
      );
      return this.createDefaultChunks(item);
    }

    // Update totalParts for all chunks
    const totalParts = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalParts = totalParts;
    });

    this.logger.info(
      `  Final result: ${chunks.length} chunks created`,
      SchedulingService.name,
    );
    chunks.forEach((chunk, i) => {
      this.logger.info(
        `    Final chunk ${i + 1}: ${chunk.title} (${chunk.estimatedDuration} min)`,
        SchedulingService.name,
      );
    });

    // Always return chunks if we created any, otherwise return original item
    return chunks.length > 0 ? chunks : [item];
  }

  /**
   * Create default chunks when no specific slot information is available
   */
  private createDefaultChunks(item: ScheduleItem): ScheduleItem[] {
    const chunks: ScheduleItem[] = [];
    let remainingDuration = item.estimatedDuration;
    let partNumber = 1;

    // Create chunks of optimal size (between 30-60 minutes, or 10+ minutes for smaller items)
    while (remainingDuration > 0) {
      let chunkSize: number;

      if (remainingDuration >= 60) {
        // For large remaining durations, create 60-minute chunks
        chunkSize = 60;
      } else if (remainingDuration >= 30) {
        // For medium remaining durations, create 30-minute chunks
        chunkSize = 30;
      } else if (remainingDuration >= 20) {
        // For smaller durations, create 20-minute chunks
        chunkSize = 20;
      } else {
        // For very small remaining durations, create at least 10-minute chunks
        chunkSize = Math.max(remainingDuration, 10);
      }

      // Don't create chunks larger than what's remaining
      chunkSize = Math.min(chunkSize, remainingDuration);

      chunks.push({
        ...item,
        id: `${item.id}_part_${partNumber}`,
        title: `${item.title} (Part ${partNumber})`,
        estimatedDuration: chunkSize,
        originalDuration: item.estimatedDuration,
        partNumber,
        totalParts: 0, // Will be set after all chunks are created
        isSplit: true,
      });

      remainingDuration -= chunkSize;
      partNumber++;

      // Safety check to prevent infinite loop
      if (partNumber > 100) {
        break;
      }
    }

    // Update totalParts for all chunks
    const totalParts = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalParts = totalParts;
    });

    return chunks;
  }

  private fitItemsIntoSlots(
    items: ScheduleItem[],
    availableSlots: AvailableTimeSlot[],
  ): ScheduleSlot[] {
    const scheduledItems: ScheduleSlot[] = [];
    const remainingSlots = [...availableSlots].filter(
      (slot) => slot.duration >= 10,
    ); // Only use slots >= 10 minutes
    const itemsToProcess = [...items]; // Copy items array for processing

    this.logger.info(
      `fitItemsIntoSlots: Processing ${items.length} items with ${availableSlots.length} available slots`,
      SchedulingService.name,
    );
    items.forEach((item, i) => {
      this.logger.info(
        `  Item ${i + 1}: ${item.title} (${item.estimatedDuration} min, priority: ${item.priority})`,
        SchedulingService.name,
      );
    });

    // Sort items by priority and duration (highest priority first, then by duration descending)
    const sortedItems = this.sortByPriority(itemsToProcess);

    // Process each item (try direct scheduling first, then splitting)
    for (const item of sortedItems) {
      if (remainingSlots.length === 0) break;

      this.logger.info(
        `Processing item: ${item.title} (${item.estimatedDuration} min)`,
        SchedulingService.name,
      );
      this.logger.info(
        `  Available remaining slots: ${remainingSlots.length}`,
        SchedulingService.name,
      );
      remainingSlots.forEach((slot, i) => {
        this.logger.info(
          `    Slot ${i + 1}: ${slot.start.toISOString()} to ${slot.end.toISOString()} (${slot.duration} min)`,
          SchedulingService.name,
        );
      });

      let itemScheduled = false;

      // First, try to schedule the item as-is
      const slotIndex = remainingSlots.findIndex(
        (slot) => slot.duration >= item.estimatedDuration,
      );

      if (slotIndex !== -1) {
        // Item fits in an available slot
        const slot = remainingSlots[slotIndex];
        const itemEndTime = new Date(
          slot.start.getTime() + item.estimatedDuration * 60 * 1000,
        );

        this.logger.info(
          `  ✅ Item fits in slot ${slotIndex + 1}: scheduling from ${slot.start.toISOString()} to ${itemEndTime.toISOString()}`,
          SchedulingService.name,
        );

        scheduledItems.push({
          startTime: new Date(slot.start),
          endTime: itemEndTime,
          item,
        });

        // Update the remaining time in this slot
        const remainingDuration = slot.duration - item.estimatedDuration;
        if (remainingDuration >= 10) {
          // Keep slots with at least 10 minutes
          remainingSlots[slotIndex] = {
            start: itemEndTime,
            end: slot.end,
            duration: remainingDuration,
          };
        } else {
          // Remove the slot if not enough time remains
          remainingSlots.splice(slotIndex, 1);
        }
        itemScheduled = true;
      } else {
        this.logger.info(
          `  ❌ Item doesn't fit in any slot - trying to split`,
          SchedulingService.name,
        );
        // Item doesn't fit as-is, try splitting it
        const chunks = this.splitItemIntoChunks(item, remainingSlots);
        this.logger.info(
          `  Split into ${chunks.length} chunks`,
          SchedulingService.name,
        );
        chunks.forEach((chunk, i) => {
          this.logger.info(
            `    Chunk ${i + 1}: ${chunk.title} (${chunk.estimatedDuration} min)`,
            SchedulingService.name,
          );
        });

        // Try to schedule each chunk
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

            // Update the remaining time in this slot
            const remainingDuration = slot.duration - chunk.estimatedDuration;
            if (remainingDuration >= 10) {
              // Keep slots with at least 10 minutes
              remainingSlots[chunkSlotIndex] = {
                start: chunkEndTime,
                end: slot.end,
                duration: remainingDuration,
              };
            } else {
              // Remove the slot if not enough time remains
              remainingSlots.splice(chunkSlotIndex, 1);
            }
          } else {
            // Chunk couldn't be scheduled, stop trying to schedule more chunks of this item
            break;
          }
        }

        // Mark as scheduled if at least one chunk was scheduled
        itemScheduled = scheduledChunks.length > 0;
      }

      // If no slots available, stop processing
      if (remainingSlots.length === 0) {
        break;
      }
    }

    return scheduledItems;
  }

  async previewSchedule(
    userId: string,
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours: { start: string; end: string } = {
      start: '09:00',
      end: '18:00',
    },
    markAsMet: boolean = false,
  ): Promise<{
    scheduledItems: ScheduleSlot[];
    unscheduledItems: ScheduleItem[];
    availableSlots: AvailableTimeSlot[];
  }> {
    const unmetItems = await this.getUnmetItemsForScheduling(userId);
    const availableSlots = this.findAvailableTimeSlots(busySlots, workingHours);
    const scheduledItems = this.fitItemsIntoSlots(unmetItems, availableSlots);

    // Track which original items were scheduled (including through splits)
    const scheduledOriginalIds = new Set<string>();
    scheduledItems.forEach((slot) => {
      if (slot.item.isSplit) {
        // For split items, use the original ID (remove the _part_X suffix)
        const originalId = slot.item.id.split('_part_')[0];
        scheduledOriginalIds.add(originalId);
      } else {
        scheduledOriginalIds.add(slot.item.id);
      }
    });

    const unscheduledItems = unmetItems.filter(
      (item) => !scheduledOriginalIds.has(item.id),
    );

    // Mark scheduled items as met if requested
    if (markAsMet && scheduledItems.length > 0) {
      try {
        await this.markScheduledItemsAsMet(userId, scheduledItems);
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
   * Schedule provided items directly without database lookup
   */
  async scheduleProvidedItems(
    items: ScheduleItem[],
    busySlots: Array<{ start: Date; end: Date }>,
    workingHours: { start: string; end: string } = {
      start: '09:00',
      end: '18:00',
    },
    markAsMet: boolean = false,
    userId?: string,
  ): Promise<{
    scheduledItems: ScheduleSlot[];
    unscheduledItems: ScheduleItem[];
    availableSlots: AvailableTimeSlot[];
  }> {
    const availableSlots = this.findAvailableTimeSlots(busySlots, workingHours);
    const scheduledItems = this.fitItemsIntoSlots(items, availableSlots);

    // Track which original items were scheduled (including through splits)
    const scheduledOriginalIds = new Set<string>();
    scheduledItems.forEach((slot) => {
      if (slot.item.isSplit) {
        // For split items, use the original ID (remove the _part_X suffix)
        const originalId = slot.item.id.split('_part_')[0];
        scheduledOriginalIds.add(originalId);
      } else {
        scheduledOriginalIds.add(slot.item.id);
      }
    });

    const unscheduledItems = items.filter(
      (item) => !scheduledOriginalIds.has(item.id),
    );

    // Mark scheduled items as met if requested
    if (markAsMet && userId && scheduledItems.length > 0) {
      try {
        await this.markScheduledItemsAsMet(userId, scheduledItems);
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
   * Check if an ID is a valid MongoDB ObjectId
   */
  private isValidObjectId(id: string): boolean {
    // MongoDB ObjectId is 24 characters long and contains only hexadecimal characters
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Mark scheduled items as met for today (public method for external use)
   */
  async markScheduledItemsAsMet(
    userId: string,
    scheduledSlots: ScheduleSlot[],
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group items by their original ID to avoid duplicate processing for split items
    const processedItems = new Set<string>();

    for (const slot of scheduledSlots) {
      const item = slot.item;
      let originalId = item.id;

      // For split items, get the original ID
      if (item.isSplit && item.id.includes('_part_')) {
        originalId = item.id.split('_part_')[0];
      }

      // Skip if we've already processed this item
      if (processedItems.has(originalId)) {
        continue;
      }

      // Skip items that don't have valid MongoDB ObjectIds (e.g., frontend-only data)
      if (!this.isValidObjectId(originalId)) {
        this.logger.info(
          `⏭️ Skipping marking item "${item.title}" (ID: ${originalId}) - not a database record`,
          SchedulingService.name,
        );
        processedItems.add(originalId);
        continue;
      }

      processedItems.add(originalId);

      try {
        if (item.type === 'habit') {
          // Mark habit as completed for today
          await this.habitsService.toggleEntry(originalId, userId, {
            date: today.toISOString(),
            completed: true,
            notes: `Scheduled and completed on ${today.toDateString()}`,
          });
          this.logger.info(
            `✅ Marked habit "${item.title}" as completed for today`,
            SchedulingService.name,
          );
        } else if (item.type === 'goal') {
          // For goals, we could update progress or mark as in_progress
          // This depends on your business logic - here I'll mark it as in_progress
          const goalItem = item.item as Goal;
          if (goalItem.status === 'not_started') {
            await this.goalsService.update(originalId, userId, {
              status: GoalStatus.IN_PROGRESS,
            });
            this.logger.info(
              `✅ Marked goal "${item.title}" as in_progress`,
              SchedulingService.name,
            );
          }
          // Optionally update progress based on scheduling
          // You could increment progress by a certain amount when scheduled
        }
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to mark ${item.type} "${item.title}" as met: ${e.message}`,
          e.stack,
          SchedulingService.name,
        );
      }
    }
  }
}
