jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

// Mock googleapis before importing retriever
const eventsListMock = jest.fn();
const setCredsMock = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest
        .fn()
        .mockImplementation(() => ({ setCredentials: setCredsMock })),
    },
    calendar: jest.fn(() => ({ events: { list: eventsListMock } })),
  },
}));

import { google } from 'googleapis';
import { GoogleCalendarRetriever } from './google_calendar.retriever';

describe('GoogleCalendarRetriever (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    eventsListMock.mockReset();
    (google.calendar as unknown as jest.Mock).mockClear?.();
    (google.auth.OAuth2 as unknown as jest.Mock).mockClear?.();
    setCredsMock.mockClear();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation when passing unknown property', async () => {
    const tool = new GoogleCalendarRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { nope: true } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('uses env OAuth creds, assembles options with defaults and ragConfig.maxResults', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost';

    eventsListMock.mockImplementation(async (opts: any) => {
      expect(opts.calendarId).toBe('primary');
      // timeMin default should be an ISO string near now
      expect(typeof opts.timeMin).toBe('string');
      expect(opts.timeMax).toBeUndefined();
      expect(opts.maxResults).toBe(7); // from ragConfig.top_k
      expect(opts.singleEvents).toBe(true);
      expect(opts.orderBy).toBe('startTime');
      return { data: { items: [{ id: 'e1' }, { id: 'e2' }] } };
    });

    const tool = new GoogleCalendarRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { ragConfig: { top_k: 7 } as any } as any,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.mimeType).toBe('application/json');
      expect(out.data.ok).toBe(true);
      expect(Array.isArray(out.data.data)).toBe(true);
      expect(out.data.data.length).toBe(2);
      expect(setCredsMock).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    }
  });

  it('allows overriding calendarId, time range, and maxResults via args', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    const now = new Date();
    const later = new Date(now.getTime() + 3600_000);

    eventsListMock.mockImplementation(async (opts: any) => {
      expect(opts.calendarId).toBe('work');
      expect(opts.timeMin).toBe(now.toISOString());
      expect(opts.timeMax).toBe(later.toISOString());
      expect(opts.maxResults).toBe(3); // arg overrides ragConfig
      return { data: { items: [{ id: 'x' }] } };
    });

    const tool = new GoogleCalendarRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: {
        calendarId: 'work',
        timeMin: now.toISOString(),
        timeMax: later.toISOString(),
        maxResults: 3,
        ragConfig: { top_k: 9 } as any,
      } as any,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.data[0].id).toBe('x');
    }
  });

  it('fails when OAuth env missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;

    const tool = new GoogleCalendarRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { ragConfig: { top_k: 1 } as any } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success)
      expect(res.error.message).toMatch(/Google OAuth credentials missing/);
  });

  it('returns failure when Calendar API throws', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';

    eventsListMock.mockRejectedValue(new Error('calendar down'));

    const tool = new GoogleCalendarRetriever();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/calendar down/);
  });
});
