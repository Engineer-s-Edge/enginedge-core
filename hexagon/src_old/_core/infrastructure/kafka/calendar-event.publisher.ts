import { Injectable } from '@nestjs/common';
import { KafkaService, CalendarEvent, MLTriggerEvent } from './kafka.service';
import { MyLogger } from '../../services/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';

interface CalendarEventPublishOptions {
  userId: string;
  eventType:
    | 'event_created'
    | 'event_updated'
    | 'event_deleted'
    | 'event_viewed'
    | 'schedule_triggered'
    | 'habits_scheduled'
    | 'goals_scheduled';
  eventId?: string;
  eventData: {
    title?: string;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    category?: string;
    priority?: 'low' | 'medium' | 'high';
    isRecurring?: boolean;
    source?: 'manual' | 'automatic' | 'suggestion';
  };
  userContext?: {
    timeOfDay?: number;
    dayOfWeek?: number;
    seasonality?: 'morning' | 'afternoon' | 'evening' | 'night';
    workingHours?: { start: string; end: string };
    busySlots?: number;
    freeTime?: number;
  };
  sessionData?: {
    sessionId: string;
    actionSequence: number;
    totalActionsInSession: number;
    timeSpentOnPage: number;
  };
  triggerMLPipeline?: boolean;
}

@Injectable()
export class CalendarEventPublisher {
  // Track events per user to determine when to trigger ML pipeline updates
  private userEventCounts = new Map<
    string,
    { count: number; lastEvent: Date }
  >();
  private readonly ML_TRIGGER_THRESHOLD = 5; // Trigger ML update every 5 events
  private readonly ML_TRIGGER_TIME_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      `Initializing CalendarEventPublisher with ML trigger threshold: ${this.ML_TRIGGER_THRESHOLD}`,
      this.constructor.name,
    );
  }

  /**
   * Publish a calendar event to Kafka and potentially trigger ML pipeline updates
   */
  async publishEvent(options: CalendarEventPublishOptions): Promise<void> {
    const eventId = options.eventId || uuidv4();
    const correlationId = uuidv4();
    const timestamp = new Date().toISOString();

    try {
      // Convert the event to Kafka format
      const calendarEvent: CalendarEvent = {
        eventId,
        userId: options.userId,
        eventType: options.eventType,
        eventData: {
          title: options.eventData.title,
          startTime: options.eventData.startTime?.toISOString(),
          endTime: options.eventData.endTime?.toISOString(),
          duration: options.eventData.duration,
          category: options.eventData.category,
          priority: options.eventData.priority,
          isRecurring: options.eventData.isRecurring,
          source: options.eventData.source,
        },
        userContext: options.userContext,
        sessionData: options.sessionData,
        timestamp,
        metadata: {
          version: '1.0',
          source: 'calendar-ml-controller',
          correlationId,
        },
      };

      // Publish the calendar event
      await this.kafkaService.publishCalendarEvent(calendarEvent);

      // Publish as user activity for broader analytics
      await this.kafkaService.publishUserActivity({
        userId: options.userId,
        eventType: options.eventType,
        eventId,
        timestamp,
        correlationId,
      });

      // Update event count for this user
      this.updateUserEventCount(options.userId);

      // Check if we should trigger ML pipeline updates
      if (
        options.triggerMLPipeline !== false &&
        this.shouldTriggerMLPipeline(options.userId)
      ) {
        await this.triggerMLPipelineUpdate(options.userId, correlationId);
      }

      this.logger.info(
        `Successfully published calendar event: ${options.eventType} for user ${options.userId}`,
        this.constructor.name,
      );
      this.logger.debug(
        `Event details: ${JSON.stringify({ eventId, correlationId, eventType: options.eventType })}`,
        this.constructor.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to publish calendar event: ${options.eventType} for user ${options.userId}`,
        e.stack,
        this.constructor.name,
      );
      throw e;
    }
  }

  /**
   * Explicitly trigger ML pipeline updates
   */
  async triggerMLUpdate(
    userId: string,
    triggerType:
      | 'retrain_model'
      | 'update_predictions'
      | 'refresh_recommendations' = 'retrain_model',
    reason: string = 'manual_trigger',
  ): Promise<void> {
    const correlationId = uuidv4();
    await this.triggerMLPipelineUpdate(
      userId,
      correlationId,
      triggerType,
      reason,
    );
  }

  /**
   * Bulk publish multiple calendar events (useful for batch operations)
   */
  async publishBatchEvents(
    events: CalendarEventPublishOptions[],
  ): Promise<void> {
    const batchPromises = events.map((event) =>
      this.publishEvent({
        ...event,
        triggerMLPipeline: false, // Don't trigger ML for each event in batch
      }),
    );

    try {
      await Promise.all(batchPromises);

      // Trigger ML pipeline once for each unique user after batch completion
      const uniqueUserIds = [...new Set(events.map((event) => event.userId))];
      for (const userId of uniqueUserIds) {
        if (this.shouldTriggerMLPipeline(userId, true)) {
          // Force check for batch operations
          await this.triggerMLPipelineUpdate(
            userId,
            uuidv4(),
            'update_predictions',
            'batch_operation',
          );
        }
      }

      this.logger.info(
        `Successfully published batch of ${events.length} calendar events for ${uniqueUserIds.length} users`,
        this.constructor.name,
      );
      this.logger.debug(
        `Batch details: ${JSON.stringify({ eventCount: events.length, userCount: uniqueUserIds.length, userIds: uniqueUserIds })}`,
        this.constructor.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to publish batch calendar events',
        e.stack,
        this.constructor.name,
      );
      throw e;
    }
  }

  /**
   * Get Kafka service status
   */
  getStatus() {
    return {
      kafkaService: this.kafkaService.getStatus(),
      userEventCounts: Object.fromEntries(this.userEventCounts.entries()),
      mlTriggerThreshold: this.ML_TRIGGER_THRESHOLD,
      mlTriggerTimeThreshold: this.ML_TRIGGER_TIME_THRESHOLD / (60 * 1000), // in minutes
    };
  }

  private updateUserEventCount(userId: string): void {
    const currentCount = this.userEventCounts.get(userId) || {
      count: 0,
      lastEvent: new Date(),
    };
    const newCount = currentCount.count + 1;
    this.userEventCounts.set(userId, {
      count: newCount,
      lastEvent: new Date(),
    });
    this.logger.debug(
      `Updated event count for user ${userId}: ${newCount}`,
      this.constructor.name,
    );
  }

  private shouldTriggerMLPipeline(userId: string, forceCheck = false): boolean {
    const userStats = this.userEventCounts.get(userId);
    if (!userStats) {
      this.logger.debug(
        `No user stats found for ${userId}, skipping ML trigger check`,
        this.constructor.name,
      );
      return false;
    }

    // Force trigger for batch operations or manual requests
    if (forceCheck) {
      this.logger.debug(
        `Force check requested for user ${userId}, triggering ML pipeline`,
        this.constructor.name,
      );
      return true;
    }

    // Trigger based on event count threshold
    if (userStats.count >= this.ML_TRIGGER_THRESHOLD) {
      this.logger.debug(
        `Event count threshold reached for user ${userId}: ${userStats.count}/${this.ML_TRIGGER_THRESHOLD}`,
        this.constructor.name,
      );
      return true;
    }

    // Trigger based on time threshold (if user has been active)
    const timeSinceLastEvent = Date.now() - userStats.lastEvent.getTime();
    if (
      userStats.count >= 2 &&
      timeSinceLastEvent >= this.ML_TRIGGER_TIME_THRESHOLD
    ) {
      this.logger.debug(
        `Time threshold reached for user ${userId}: ${timeSinceLastEvent}ms since last event`,
        this.constructor.name,
      );
      return true;
    }

    this.logger.debug(
      `ML trigger conditions not met for user ${userId}: count=${userStats.count}, timeSince=${timeSinceLastEvent}ms`,
      this.constructor.name,
    );
    return false;
  }

  private async triggerMLPipelineUpdate(
    userId: string,
    correlationId: string,
    triggerType:
      | 'retrain_model'
      | 'update_predictions'
      | 'refresh_recommendations' = 'retrain_model',
    reason: string = 'event_threshold_reached',
  ): Promise<void> {
    const userStats = this.userEventCounts.get(userId);
    if (!userStats) return;

    const mlTrigger: MLTriggerEvent = {
      userId,
      triggerType,
      eventCount: userStats.count,
      lastEventTimestamp: userStats.lastEvent.toISOString(),
      metadata: {
        triggeredAt: new Date().toISOString(),
        reason,
        correlationId,
      },
    };

    try {
      await this.kafkaService.triggerMLPipeline(mlTrigger);

      // Reset the event count for this user after triggering ML update
      this.userEventCounts.set(userId, { count: 0, lastEvent: new Date() });

      this.logger.info(
        `Triggered ML pipeline update: ${triggerType} for user ${userId} (reason: ${reason})`,
        this.constructor.name,
      );
      this.logger.debug(
        `ML trigger details: ${JSON.stringify({ userId, triggerType, eventCount: userStats.count, reason, correlationId })}`,
        this.constructor.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to trigger ML pipeline update for user ${userId}`,
        e.stack,
        this.constructor.name,
      );
      throw e;
    }
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const kafkaStatus = this.kafkaService.getStatus();
      return {
        healthy: kafkaStatus.connected && kafkaStatus.enabled,
        details: {
          kafka: kafkaStatus,
          publisher: {
            activeUsers: this.userEventCounts.size,
            totalEvents: Array.from(this.userEventCounts.values()).reduce(
              (sum, stats) => sum + stats.count,
              0,
            ),
          },
        },
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      return {
        healthy: false,
        details: { error: e.message },
      };
    }
  }
}
