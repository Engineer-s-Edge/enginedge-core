import { Injectable } from '@nestjs/common';
import { calendar_v3 } from 'googleapis';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import { DataSyncService } from './data-sync.service';
import { SchedulingService } from '../../../../features/habits-goals/services/scheduling.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class SchedulingOrchestratorService {
  constructor(
    private googleCalendarApiService: GoogleCalendarApiService,
    private dataSyncService: DataSyncService,
    private schedulingService: SchedulingService,
    private readonly logger: MyLogger,
  ) {}

  async scheduleHabitsAndGoals(
    calendarId = 'primary',
    userId: string,
    busySlots: Array<{ start: string; end: string }>,
    workingHours: { start: string; end: string } = {
      start: '09:00',
      end: '18:00',
    },
    habitsData?: any[],
    goalsData?: any[],
  ): Promise<{
    scheduledEvents: calendar_v3.Schema$Event[];
    unscheduledItems: any[];
    message: string;
  }> {
    try {
      const currentEvents = await this.googleCalendarApiService.listEvents(
        calendarId,
        100,
      );

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      this.logger.info(
        `Filtering events for extended window: ${yesterday.toISOString()} to ${tomorrow.toISOString()}`,
        SchedulingOrchestratorService.name,
      );

      const freshBusySlots = currentEvents
        .filter((event) => {
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime);

          const overlapsWindow =
            eventStart <= tomorrow && eventEnd >= yesterday;

          this.logger.info(
            `Event "${event.summary}": ${eventStart.toISOString()} to ${eventEnd.toISOString()} - overlaps window: ${overlapsWindow}`,
            SchedulingOrchestratorService.name,
          );
          return overlapsWindow;
        })
        .map((event) => ({
          start: event.start!.dateTime!,
          end: event.end!.dateTime!,
        }));

      this.logger.info(
        `Using fresh busy slots from ${currentEvents.length} events: ${freshBusySlots.length} busy slots for today`,
        SchedulingOrchestratorService.name,
      );

      const lockedBlocks = currentEvents.filter(
        (event) => event.extendedProperties?.private?.immutable === 'true',
      );
      this.logger.info(
        `Found ${lockedBlocks.length} locked blocks:`,
        SchedulingOrchestratorService.name,
      );
      lockedBlocks.forEach((block) => {
        this.logger.info(
          `  - "${block.summary}" from ${block.start?.dateTime} to ${block.end?.dateTime}`,
          SchedulingOrchestratorService.name,
        );
      });

      const busySlotsAsDate = freshBusySlots.map((slot) => ({
        start: new Date(slot.start),
        end: new Date(slot.end),
      }));

      this.logger.info(
        `Converted busy slots to Date objects: ${busySlotsAsDate.length} slots`,
        SchedulingOrchestratorService.name,
      );
      busySlotsAsDate.forEach((slot, i) => {
        this.logger.info(
          `  Busy slot ${i + 1} (Date): ${slot.start.toISOString()} to ${slot.end.toISOString()}`,
          SchedulingOrchestratorService.name,
        );
      });

      let schedulingResult: any;

      if (habitsData || goalsData) {
        this.logger.info(
          `Frontend data provided - habits: ${habitsData?.length || 0}, goals: ${goalsData?.length || 0}. Syncing to database first...`,
          SchedulingOrchestratorService.name,
        );

        try {
          const syncedHabits =
            await this.dataSyncService.syncFrontendHabitsToDatabase(
              habitsData || [],
              userId,
            );
          const syncedGoals =
            await this.dataSyncService.syncFrontendGoalsToDatabase(
              goalsData || [],
              userId,
            );

          this.logger.info(
            `Synced ${syncedHabits.length} habits and ${syncedGoals.length} goals to database`,
            SchedulingOrchestratorService.name,
          );

          schedulingResult = await this.schedulingService.previewSchedule(
            userId,
            busySlotsAsDate,
            workingHours,
            true,
          );
        } catch (syncError) {
          const info = getErrorInfo(syncError);
          this.logger.error(
            `Failed to sync frontend data to database, falling back to frontend-only scheduling: ${info.message}\n${info.stack || ''}`,
            SchedulingOrchestratorService.name,
          );

          const unmetHabits = (habitsData || []).filter((habit) => {
            const today = new Date().toISOString().split('T')[0];
            if (habit.status !== 'active') return false;
            const todayEntry = habit.entries?.find(
              (entry: any) => entry.date === today,
            );
            return !todayEntry || !todayEntry.completed;
          });

          const incompleteGoals = (goalsData || []).filter(
            (goal) =>
              goal.status === 'not_started' || goal.status === 'in_progress',
          );

          const habitItems = unmetHabits.map((habit) => ({
            type: 'habit' as const,
            id: habit.id,
            title: habit.title,
            priority: habit.priority,
            estimatedDuration: habit.dailyTimeCommitment || 30,
            item: habit,
          }));

          const goalItems = incompleteGoals.map((goal) => ({
            type: 'goal' as const,
            id: goal.id,
            title: goal.title,
            priority: goal.priority,
            estimatedDuration: goal.dailyTimeCommitment || 60,
            item: goal,
          }));

          const allItems = [...habitItems, ...goalItems];
          this.logger.info(
            `Frontend fallback scheduling: ${habitItems.length} habit items, ${goalItems.length} goal items, total: ${allItems.length}`,
            SchedulingOrchestratorService.name,
          );

          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          const sortedItems = allItems.sort((a, b) => {
            const aPriority =
              priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
            const bPriority =
              priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
            return aPriority - bPriority;
          });

          schedulingResult = await this.schedulingService.scheduleProvidedItems(
            sortedItems,
            busySlotsAsDate,
            workingHours,
            false,
            userId,
          );
        }
      } else {
        this.logger.info(
          'No frontend data provided, using database scheduling service',
          SchedulingOrchestratorService.name,
        );

        const unmetItems =
          await this.schedulingService.getUnmetItemsForScheduling(userId);
        this.logger.info(
          `Database check: Found ${unmetItems.length} unmet items for user ${userId}`,
          SchedulingOrchestratorService.name,
        );
        unmetItems.forEach(
          (
            item: {
              type: any;
              title: any;
              priority: any;
              estimatedDuration: any;
            },
            index: number,
          ) => {
            this.logger.info(
              `  Item ${index + 1}: ${item.type} - "${item.title}" (${item.priority}, ${item.estimatedDuration}min)`,
              SchedulingOrchestratorService.name,
            );
          },
        );

        schedulingResult = await this.schedulingService.previewSchedule(
          userId,
          busySlotsAsDate,
          workingHours,
          true,
        );
      }

      const scheduledEvents: calendar_v3.Schema$Event[] = [];

      for (const scheduledSlot of schedulingResult.scheduledItems) {
        const item = scheduledSlot.item;
        let eventSummary: string;
        let description: string;

        if (item.isSplit) {
          eventSummary = `${item.type === 'habit' ? '🔄' : '🎯'} ${item.title}`;
          description =
            item.type === 'habit'
              ? `Habit: ${item.item.description || ''} - Part ${item.partNumber} of ${item.totalParts} (${item.estimatedDuration} min of ${item.originalDuration} min total) - Scheduled by EnginEdge`
              : `Goal: ${item.item.description || ''} - Part ${item.partNumber} of ${item.totalParts} (${item.estimatedDuration} min of ${item.originalDuration} min total) - Scheduled by EnginEdge`;
        } else {
          eventSummary = `${item.type === 'habit' ? '🔄' : '🎯'} ${item.title}`;
          description =
            item.type === 'habit'
              ? `Habit: ${item.item.description || ''} - Scheduled by EnginEdge`
              : `Goal: ${item.item.description || ''} - Scheduled by EnginEdge`;
        }

        const event: calendar_v3.Schema$Event = {
          summary: eventSummary,
          description,
          start: { dateTime: scheduledSlot.startTime.toISOString() },
          end: { dateTime: scheduledSlot.endTime.toISOString() },
          extendedProperties: {
            private: {
              createdByEnginEdge: 'true',
              itemType: item.type,
              itemId: item.isSplit ? item.id.split('_part_')[0] : item.id,
              priority: item.priority,
              isSplit: item.isSplit ? 'true' : 'false',
              partNumber: item.partNumber?.toString() || '',
              totalParts: item.totalParts?.toString() || '',
              originalDuration: item.originalDuration?.toString() || '',
            },
          },
          colorId: item.type === 'habit' ? '9' : '10',
        };

        try {
          this.logger.info(
            `Creating event "${eventSummary}" from ${scheduledSlot.startTime.toISOString()} to ${scheduledSlot.endTime.toISOString()}`,
            SchedulingOrchestratorService.name,
          );
          const createdEvent =
            await this.googleCalendarApiService.createEventWithoutOverlapCheck(
              calendarId,
              event,
            );
          scheduledEvents.push(createdEvent);
        } catch (error) {
          this.logger.warn(
            `Failed to create calendar event for ${item.type}: ${item.title}`,
            SchedulingOrchestratorService.name,
          );
        }
      }

      const message =
        scheduledEvents.length > 0
          ? `Successfully scheduled ${scheduledEvents.length} out of ${schedulingResult.scheduledItems.length} items.${
              schedulingResult.unscheduledItems.length > 0
                ? ` ${schedulingResult.unscheduledItems.length} items could not be scheduled due to time constraints.`
                : ''
            }`
          : 'No items could be scheduled. Please check your available time slots.';

      return {
        scheduledEvents,
        unscheduledItems: schedulingResult.unscheduledItems,
        message,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error scheduling habits and goals: ${info.message}\n${info.stack || ''}`,
        SchedulingOrchestratorService.name,
      );
      throw error;
    }
  }
}
