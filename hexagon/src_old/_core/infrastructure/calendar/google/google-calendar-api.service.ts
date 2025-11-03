import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { GoogleAuthService } from './google-auth.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class GoogleCalendarApiService {
  constructor(
    private googleAuthService: GoogleAuthService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'GoogleCalendarApiService initialized',
      GoogleCalendarApiService.name,
    );
  }

  async listEvents(
    calendarId = 'primary',
    maxResults = 10,
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = google.calendar({
        version: 'v3',
        auth: this.googleAuthService.getOAuth2Client(),
      });
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      const processedEvents = events
        .filter((event) => {
          if (!event.id) {
            this.logger.warn('Event without ID found:', event);
            return false;
          }
          return true;
        })
        .map((event) => {
          const createdByEnginEdge =
            event.extendedProperties?.private?.createdByEnginEdge === 'true';
          const isAlreadyLocked =
            event.extendedProperties?.private?.immutable === 'true' ||
            (event.summary?.startsWith('🔒') ?? false);

          const shouldLockExternal = !createdByEnginEdge && !isAlreadyLocked;

          return {
            ...event,
            summary: shouldLockExternal
              ? `🔒 ${event.summary || 'Untitled Event'}`
              : event.summary || 'Untitled Event',
            immutable: isAlreadyLocked || shouldLockExternal,
            extendedProperties: shouldLockExternal
              ? {
                  ...event.extendedProperties,
                  private: {
                    ...event.extendedProperties?.private,
                    immutable: 'true',
                    lockedByEnginEdge: 'true',
                  },
                }
              : event.extendedProperties,
            colorId: shouldLockExternal ? '11' : event.colorId || '10',
          };
        });

      const externalEventsToLock = processedEvents.filter(
        (event) =>
          event.extendedProperties?.private?.lockedByEnginEdge === 'true',
      );

      if (externalEventsToLock.length > 0) {
        this.logger.info(
          `Loaded ${processedEvents.length} events (${externalEventsToLock.length} external events auto-locked)`,
          GoogleCalendarApiService.name,
        );
      } else {
        this.logger.info(
          `Loaded ${processedEvents.length} events`,
          GoogleCalendarApiService.name,
        );
      }

      return processedEvents;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error listing events: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  async createEvent(
    calendarId = 'primary',
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      if (!this.isEventLocked(event)) {
        const existingEvents = await this.listEvents(calendarId, 100);
        const overlapCheck = this.checkOverlapWithLockedBlocks(
          new Date(event.start?.dateTime || ''),
          new Date(event.end?.dateTime || ''),
          existingEvents,
        );

        if (overlapCheck.overlaps) {
          throw new HttpException(
            `Cannot create event that overlaps with locked time block "${overlapCheck.lockedEvent?.summary}"`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      return await this.createEventWithoutOverlapCheck(calendarId, event);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating event: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  async createEventWithoutOverlapCheck(
    calendarId = 'primary',
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({
        version: 'v3',
        auth: this.googleAuthService.getOAuth2Client(),
      });

      const eventWithMetadata = {
        ...event,
        extendedProperties: {
          ...event.extendedProperties,
          private: {
            ...event.extendedProperties?.private,
            createdByEnginEdge: 'true',
          },
        },
        colorId: event.colorId || '10',
      };

      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventWithMetadata,
      });

      return response.data;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating event: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  async createLockedBlock(
    calendarId = 'primary',
    summary: string,
    startDateTime: string,
    endDateTime: string,
    description?: string,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      const event: calendar_v3.Schema$Event = {
        summary: `🔒 ${summary}`,
        start: { dateTime: startDateTime },
        end: { dateTime: endDateTime },
        description:
          description ||
          'This is a locked time block and cannot be modified or deleted.',
        extendedProperties: {
          private: {
            immutable: 'true',
            createdByEnginEdge: 'true',
          },
        },
        colorId: '11',
      };

      return await this.createEvent(calendarId, event);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating locked block: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  async updateEvent(
    calendarId = 'primary',
    eventId: string,
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({
        version: 'v3',
        auth: this.googleAuthService.getOAuth2Client(),
      });
      const response = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: event,
      });

      return response.data;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating event: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  async deleteEvent(calendarId = 'primary', eventId: string): Promise<void> {
    try {
      const calendar = google.calendar({
        version: 'v3',
        auth: this.googleAuthService.getOAuth2Client(),
      });
      await calendar.events.delete({
        calendarId,
        eventId,
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting event: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }

  private isEventLocked(event: calendar_v3.Schema$Event): boolean {
    return (
      event.extendedProperties?.private?.immutable === 'true' ||
      (event.summary?.startsWith('🔒') ?? false)
    );
  }

  private checkOverlapWithLockedBlocks(
    startDate: Date,
    endDate: Date,
    eventsList: calendar_v3.Schema$Event[],
  ): { overlaps: boolean; lockedEvent?: calendar_v3.Schema$Event } {
    const lockedEvents = eventsList.filter((event) =>
      this.isEventLocked(event),
    );

    this.logger.info(
      `checkOverlapWithLockedBlocks: Checking event ${startDate.toISOString()} to ${endDate.toISOString()}`,
      GoogleCalendarApiService.name,
    );
    this.logger.info(
      `Found ${lockedEvents.length} locked events to check against`,
      GoogleCalendarApiService.name,
    );

    for (const lockedEvent of lockedEvents) {
      if (lockedEvent.start?.dateTime && lockedEvent.end?.dateTime) {
        const lockedStart = new Date(lockedEvent.start.dateTime);
        const lockedEnd = new Date(lockedEvent.end.dateTime);

        this.logger.info(
          `  Checking against locked event "${lockedEvent.summary}": ${lockedStart.toISOString()} to ${lockedEnd.toISOString()}`,
          GoogleCalendarApiService.name,
        );

        const overlaps = startDate < lockedEnd && endDate > lockedStart;
        this.logger.info(
          `    Overlap check: startDate < lockedEnd (${startDate < lockedEnd}) && endDate > lockedStart (${endDate > lockedStart}) = ${overlaps}`,
          GoogleCalendarApiService.name,
        );

        if (overlaps) {
          this.logger.info(
            `    ❌ OVERLAP DETECTED with "${lockedEvent.summary}"`,
            GoogleCalendarApiService.name,
          );
          return { overlaps: true, lockedEvent };
        } else {
          this.logger.info(
            `    ✅ No overlap with "${lockedEvent.summary}"`,
            GoogleCalendarApiService.name,
          );
        }
      }
    }

    this.logger.info(
      `checkOverlapWithLockedBlocks: No overlaps found`,
      GoogleCalendarApiService.name,
    );
    return { overlaps: false };
  }

  async updateEventEnhanced(
    calendarId = 'primary',
    eventId: string,
    eventData: Partial<calendar_v3.Schema$Event>,
    newStartTime?: string,
    newEndTime?: string,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({
        version: 'v3',
        auth: this.googleAuthService.getOAuth2Client(),
      });

      const currentEventResponse = await calendar.events.get({
        calendarId,
        eventId,
      });

      const currentEvent = currentEventResponse.data;

      let updatedEvent = { ...currentEvent, ...eventData };

      if (newStartTime || newEndTime) {
        const currentStart = currentEvent.start?.dateTime
          ? new Date(currentEvent.start.dateTime)
          : null;
        const currentEnd = currentEvent.end?.dateTime
          ? new Date(currentEvent.end.dateTime)
          : null;

        if (!currentStart || !currentEnd) {
          throw new HttpException(
            'Cannot update times for event without valid start/end times',
            HttpStatus.BAD_REQUEST,
          );
        }

        const newStart = newStartTime ? new Date(newStartTime) : currentStart;
        const newEnd = newEndTime ? new Date(newEndTime) : currentEnd;

        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
          throw new HttpException(
            'Invalid time format',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (newStart >= newEnd) {
          throw new HttpException(
            'Start time must be before end time',
            HttpStatus.BAD_REQUEST,
          );
        }

        const allEvents = await this.listEvents(calendarId, 100);
        const otherEvents = allEvents.filter((event) => event.id !== eventId);
        const overlapCheck = this.checkOverlapWithLockedBlocks(
          newStart,
          newEnd,
          otherEvents,
        );

        if (overlapCheck.overlaps && !this.isEventLocked(currentEvent)) {
          throw new HttpException(
            `Cannot update event to overlap with locked time block "${overlapCheck.lockedEvent?.summary}"`,
            HttpStatus.BAD_REQUEST,
          );
        }

        updatedEvent.start = { dateTime: newStart.toISOString() };
        updatedEvent.end = { dateTime: newEnd.toISOString() };
      }

      const response = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: updatedEvent,
      });

      return response.data;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating event: ${info.message}`,
        info.stack,
        GoogleCalendarApiService.name,
      );
      throw error;
    }
  }
}
