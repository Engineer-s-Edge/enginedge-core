import { Injectable } from '@nestjs/common';
import { calendar_v3 } from 'googleapis';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import { SchedulingOrchestratorService } from './scheduling-orchestrator.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class GoogleCalendarService {
  constructor(
    private googleAuthService: GoogleAuthService,
    private googleCalendarApiService: GoogleCalendarApiService,
    private schedulingOrchestratorService: SchedulingOrchestratorService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'GoogleCalendarService initialized',
      GoogleCalendarService.name,
    );
  }

  generateAuthUrl(): string {
    this.logger.info(
      'Generating Google Calendar auth URL',
      GoogleCalendarService.name,
    );
    const authUrl = this.googleAuthService.generateAuthUrl();
    this.logger.info(
      'Google Calendar auth URL generated successfully',
      GoogleCalendarService.name,
    );
    return authUrl;
  }

  async getTokenFromCode(code: string): Promise<any> {
    this.logger.info(
      'Exchanging authorization code for tokens',
      GoogleCalendarService.name,
    );
    try {
      const tokens = await this.googleAuthService.getTokenFromCode(code);
      this.logger.info(
        'Successfully exchanged code for tokens',
        GoogleCalendarService.name,
      );
      return tokens;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to exchange code for tokens: ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

  setCredentials(tokens: any): void {
    this.logger.info(
      'Setting Google Calendar credentials',
      GoogleCalendarService.name,
    );
    this.googleAuthService.setCredentials(tokens);
    this.logger.info(
      'Google Calendar credentials set successfully',
      GoogleCalendarService.name,
    );
  }

  async listEvents(
    calendarId = 'primary',
    maxResults = 10,
  ): Promise<calendar_v3.Schema$Event[]> {
    this.logger.info(
      `Listing events from calendar: ${calendarId}, maxResults: ${maxResults}`,
      GoogleCalendarService.name,
    );
    try {
      const events = await this.googleCalendarApiService.listEvents(
        calendarId,
        maxResults,
      );
      this.logger.info(
        `Successfully listed ${events.length} events from calendar: ${calendarId}`,
        GoogleCalendarService.name,
      );
      return events;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to list events from calendar: ${calendarId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

  async createEvent(
    calendarId = 'primary',
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    this.logger.info(
      `Creating event in calendar: ${calendarId}, title: ${event.summary || 'Untitled'}`,
      GoogleCalendarService.name,
    );
    try {
      const createdEvent = await this.googleCalendarApiService.createEvent(
        calendarId,
        event,
      );
      this.logger.info(
        `Successfully created event: ${createdEvent.id} in calendar: ${calendarId}`,
        GoogleCalendarService.name,
      );
      return createdEvent;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create event in calendar: ${calendarId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
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
    this.logger.info(
      `Creating locked block: ${summary} in calendar: ${calendarId}`,
      GoogleCalendarService.name,
    );
    try {
      const lockedBlock = await this.googleCalendarApiService.createLockedBlock(
        calendarId,
        summary,
        startDateTime,
        endDateTime,
        description,
      );
      this.logger.info(
        `Successfully created locked block: ${lockedBlock.id}`,
        GoogleCalendarService.name,
      );
      return lockedBlock;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create locked block: ${summary} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

  async updateEvent(
    calendarId = 'primary',
    eventId: string,
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    this.logger.info(
      `Updating event: ${eventId} in calendar: ${calendarId}`,
      GoogleCalendarService.name,
    );
    try {
      const updatedEvent = await this.googleCalendarApiService.updateEvent(
        calendarId,
        eventId,
        event,
      );
      this.logger.info(
        `Successfully updated event: ${eventId}`,
        GoogleCalendarService.name,
      );
      return updatedEvent;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to update event: ${eventId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

  async deleteEvent(calendarId = 'primary', eventId: string): Promise<void> {
    this.logger.info(
      `Deleting event: ${eventId} from calendar: ${calendarId}`,
      GoogleCalendarService.name,
    );
    try {
      await this.googleCalendarApiService.deleteEvent(calendarId, eventId);
      this.logger.info(
        `Successfully deleted event: ${eventId}`,
        GoogleCalendarService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to delete event: ${eventId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

  async updateEventEnhanced(
    calendarId = 'primary',
    eventId: string,
    eventData: Partial<calendar_v3.Schema$Event>,
    newStartTime?: string,
    newEndTime?: string,
  ): Promise<calendar_v3.Schema$Event> {
    this.logger.info(
      `Updating event enhanced: ${eventId} in calendar: ${calendarId}`,
      GoogleCalendarService.name,
    );
    try {
      const updatedEvent =
        await this.googleCalendarApiService.updateEventEnhanced(
          calendarId,
          eventId,
          eventData,
          newStartTime,
          newEndTime,
        );
      this.logger.info(
        `Successfully updated event enhanced: ${eventId}`,
        GoogleCalendarService.name,
      );
      return updatedEvent;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to update event enhanced: ${eventId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }

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
    this.logger.info(
      `Scheduling habits and goals for user: ${userId} in calendar: ${calendarId}`,
      GoogleCalendarService.name,
    );
    try {
      const result =
        await this.schedulingOrchestratorService.scheduleHabitsAndGoals(
          calendarId,
          userId,
          busySlots,
          workingHours,
          habitsData,
          goalsData,
        );
      this.logger.info(
        `Successfully scheduled ${result.scheduledEvents.length} events for user: ${userId}`,
        GoogleCalendarService.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to schedule habits and goals for user: ${userId} - ${info.message}\n${info.stack || ''}`,
        GoogleCalendarService.name,
      );
      throw error;
    }
  }
}
