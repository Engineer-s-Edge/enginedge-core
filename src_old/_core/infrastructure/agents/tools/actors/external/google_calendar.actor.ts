import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, ToolCall } from '../../toolkit.interface';

type GCalOp = 'list' | 'create' | 'update' | 'delete';

interface GoogleCalendarArgs {
  op: GCalOp;
  calendarId?: string;
  eventId?: string;
  event?: calendar_v3.Schema$Event;
  maxResults?: number;
}

interface GoogleCalendarOutput extends ToolOutput {
  data: any;
}

export class GoogleCalendarActor extends BaseActor<
  GoogleCalendarArgs,
  GoogleCalendarOutput
> {
  _id: ToolIdType = 't_000000000000000000000202' as unknown as ToolIdType;
  name = 'gcal.actor';
  description =
    'Google Calendar operations: list, create, update, delete events.';
  useCase = 'Manage events for scheduling and automation.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
      calendarId: { type: 'string', default: 'primary' },
      eventId: { type: 'string' },
      event: { type: 'object' },
      maxResults: { type: 'number', default: 10 },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'gcal.actor', args: { op: 'list', maxResults: 5 } } as ToolCall,
  ];
  retries = 1;
  errorEvent = [
    {
      name: 'GoogleError',
      guidance: 'Verify OAuth credentials and scopes.',
      retryable: true,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private getClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error(
        'Google OAuth credentials missing for Calendar Actor',
        undefined,
        this.constructor.name,
      );
      throw new Error('Google OAuth credentials missing');
    }

    this.logger.debug(
      'Creating Google Calendar OAuth2 client for Actor',
      this.constructor.name,
    );
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  protected async act(args: GoogleCalendarArgs): Promise<GoogleCalendarOutput> {
    this.logger.info(
      `Executing Google Calendar operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Google Calendar args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const auth = this.getClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = args.calendarId || 'primary';
    this.logger.debug(`Calendar ID: ${calendarId}`, this.constructor.name);

    switch (args.op) {
      case 'list': {
        this.logger.debug(
          `Listing calendar events (maxResults: ${args.maxResults || 10})`,
          this.constructor.name,
        );
        const res = await calendar.events.list({
          calendarId,
          maxResults: args.maxResults || 10,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: new Date().toISOString(),
        });
        this.logger.info(
          `Calendar events listed: ${res.data.items?.length || 0} events`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data.items || [] } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'create': {
        if (!args.event) {
          this.logger.error(
            'event required for create operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('event required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Creating calendar event: ${args.event.summary || 'untitled'}`,
          this.constructor.name,
        );
        const res = await calendar.events.insert({
          calendarId,
          requestBody: args.event,
        });
        this.logger.info(
          `Calendar event created successfully: ${res.data.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'update': {
        if (!args.eventId || !args.event) {
          this.logger.error(
            'eventId and event required for update operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('eventId and event required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Updating calendar event: ${args.eventId}`,
          this.constructor.name,
        );
        const res = await calendar.events.update({
          calendarId,
          eventId: args.eventId,
          requestBody: args.event,
        });
        this.logger.info(
          `Calendar event updated successfully: ${args.eventId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.data } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete': {
        if (!args.eventId) {
          this.logger.error(
            'eventId required for delete operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('eventId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Deleting calendar event: ${args.eventId}`,
          this.constructor.name,
        );
        await calendar.events.delete({ calendarId, eventId: args.eventId });
        this.logger.info(
          `Calendar event deleted successfully: ${args.eventId}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      default:
        this.logger.error(
          `Unsupported Google Calendar operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
    }
  }
}

export default GoogleCalendarActor;
