import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface GCalRetrieveArgs {
  calendarId?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
}

interface GCalRetrieveOutput extends ToolOutput {
  data: any;
}

export class GoogleCalendarRetriever extends BaseRetriever<
  GCalRetrieveArgs,
  GCalRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000304' as unknown as ToolIdType;
  name = 'gcal.retrieve';
  description = 'Retrieve upcoming Google Calendar events.';
  useCase = 'Fetch events for planning and scheduling.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 10,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      calendarId: { type: 'string', default: 'primary' },
      maxResults: { type: 'number' },
      timeMin: { type: 'string' },
      timeMax: { type: 'string' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'gcal.retrieve', args: { maxResults: 5 } } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
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
        'Google OAuth credentials missing for Calendar',
        undefined,
        this.constructor.name,
      );
      throw new Error('Google OAuth credentials missing');
    }

    this.logger.debug(
      'Creating Google Calendar OAuth2 client',
      this.constructor.name,
    );
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  protected async retrieve(
    args: GCalRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<GCalRetrieveOutput> {
    this.logger.info(
      `Retrieving Google Calendar events from calendar: ${args.calendarId || 'primary'}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Google Calendar args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const auth = this.getClient();
      const calendar = google.calendar({ version: 'v3', auth });

      const listOptions = {
        calendarId: args.calendarId || 'primary',
        timeMin: args.timeMin || new Date().toISOString(),
        timeMax: args.timeMax,
        maxResults: args.maxResults || args.ragConfig.top_k || 10,
        singleEvents: true,
        orderBy: 'startTime',
      };

      this.logger.debug(
        `Calendar list options: ${JSON.stringify(listOptions)}`,
        this.constructor.name,
      );
      this.logger.debug(
        'Fetching calendar events from Google Calendar API',
        this.constructor.name,
      );

      const res = await calendar.events.list(listOptions);
      this.logger.info(
        `Google Calendar events retrieved: ${res.data.items?.length || 0} events`,
        this.constructor.name,
      );
      this.logger.debug(
        `Calendar ID: ${args.calendarId || 'primary'}, time range: ${listOptions.timeMin} to ${listOptions.timeMax || 'no limit'}`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data: res.data.items || [] } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Google Calendar retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default GoogleCalendarRetriever;
