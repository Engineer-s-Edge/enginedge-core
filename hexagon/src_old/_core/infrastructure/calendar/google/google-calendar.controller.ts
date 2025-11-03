import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Redirect,
  HttpStatus,
  HttpException,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarService } from './google-calendar.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
  ) {}

  @Get('auth')
  @Redirect()
  authorize() {
    try {
      const url = this.googleCalendarService.generateAuthUrl();
      return { url, statusCode: HttpStatus.FOUND };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error generating auth URL: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to generate authorization URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('auth/callback')
  @Redirect()
  async handleAuthCallback(@Query('code') code: string) {
    try {
      const tokens = await this.googleCalendarService.getTokenFromCode(code);
      // Redirect to frontend with tokens in query params
      const params = new URLSearchParams();
      Object.entries(tokens).forEach(([k, v]) => {
        if (typeof v === 'string' || typeof v === 'number') {
          params.append(k, String(v));
        }
      });
      const frontendUrl = this.configService.get<string>('urls.frontendUrl');
      return {
        url: `${frontendUrl}/calendar?${params.toString()}`,
        statusCode: HttpStatus.FOUND,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error handling callback: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to handle authentication callback',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Lightweight config check (no secrets) to help diagnose invalid_client issues
  @Get('config')
  getConfigSummary() {
    const clientId = this.configService.get<string>('googleCalendar.clientId');
    const clientSecret = this.configService.get<string>(
      'googleCalendar.clientSecret',
    );
    const redirectUri =
      this.configService.get<string>('googleCalendar.redirectUri') ||
      this.configService.get<string>('urls.googleRedirectUri');
    const scopes = this.configService.get<string[]>('googleCalendar.scopes') || [];
    const frontendUrl = this.configService.get<string>('urls.frontendUrl');

    return {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      redirectUri,
      scopes,
      frontendUrl,
    };
  }

  @Get('events')
  async listEvents(
    @Query('calendarId') calendarId: string,
    @Query('maxResults') maxResults: number,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7); // Remove 'Bearer ' prefix
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.listEvents(
        calendarId || 'primary',
        maxResults ? parseInt(maxResults.toString(), 10) : 10,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error listing events: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to list events',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('events')
  async createEvent(
    @Body() eventData: any,
    @Query('calendarId') calendarId: string,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.createEvent(
        calendarId || 'primary',
        eventData,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating event: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to create event',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('events/locked-block')
  async createLockedBlock(
    @Body()
    blockData: {
      summary: string;
      startDateTime: string;
      endDateTime: string;
      description?: string;
    },
    @Query('calendarId') calendarId: string,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.createLockedBlock(
        calendarId || 'primary',
        blockData.summary,
        blockData.startDateTime,
        blockData.endDateTime,
        blockData.description,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating locked block: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to create locked block',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('events/:eventId')
  async updateEvent(
    @Query('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
    @Body() eventData: any,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.updateEvent(
        calendarId || 'primary',
        eventId,
        eventData,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating event: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to update event',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('events/:eventId/enhanced')
  async updateEventEnhanced(
    @Query('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
    @Body()
    updateData: { eventData?: any; newStartTime?: string; newEndTime?: string },
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.updateEventEnhanced(
        calendarId || 'primary',
        eventId,
        updateData.eventData || {},
        updateData.newStartTime,
        updateData.newEndTime,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating event enhanced: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to update event',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('events/:eventId/delete')
  async deleteEvent(
    @Query('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      await this.googleCalendarService.deleteEvent(
        calendarId || 'primary',
        eventId,
      );
      return { message: 'Event deleted successfully' };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting event: ${info.message}\n` + (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to delete event',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('schedule-habits-goals')
  async scheduleHabitsAndGoals(
    @Body()
    scheduleRequest: {
      busySlots: Array<{ start: string; end: string }>;
      workingHours?: { start: string; end: string };
      userId: string;
      habits?: any[]; // Optional: habits data from frontend
      goals?: any[]; // Optional: goals data from frontend
    },
    @Query('calendarId') calendarId: string,
    @Headers('authorization') authorization: string,
  ) {
    try {
      // Extract token from Authorization header
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new HttpException(
          'Missing or invalid authorization header',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accessToken = authorization.substring(7);
      this.googleCalendarService.setCredentials({ access_token: accessToken });

      return await this.googleCalendarService.scheduleHabitsAndGoals(
        calendarId || 'primary',
        scheduleRequest.userId,
        scheduleRequest.busySlots,
        scheduleRequest.workingHours,
        scheduleRequest.habits,
        scheduleRequest.goals,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error scheduling habits and goals: ${info.message}\n` +
          (info.stack || ''),
        GoogleCalendarController.name,
      );
      throw new HttpException(
        'Failed to schedule habits and goals',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
