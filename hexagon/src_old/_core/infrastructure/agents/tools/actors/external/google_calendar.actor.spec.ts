jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

// Mock googleapis Calendar client
const listMock = jest.fn();
const insertMock = jest.fn();
const updateMock = jest.fn();
const deleteMock = jest.fn();
const setCredsMock = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest
        .fn()
        .mockImplementation(() => ({ setCredentials: setCredsMock })),
    },
    calendar: jest.fn(() => ({
      events: {
        list: listMock,
        insert: insertMock,
        update: updateMock,
        delete: deleteMock,
      },
    })),
  },
}));

import { GoogleCalendarActor } from './google_calendar.actor';

describe('GoogleCalendarActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    listMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    setCredsMock.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation for unsupported args', async () => {
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { foo: 'bar' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('fails when OAuth env missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'list' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success)
      expect(res.error.message).toMatch(/Google OAuth credentials missing/);
  });

  it('list: uses defaults and returns events', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    listMock.mockImplementation(async (opts: any) => {
      expect(opts.calendarId).toBe('primary');
      expect(opts.maxResults).toBe(10); // default
      expect(opts.singleEvents).toBe(true);
      expect(opts.orderBy).toBe('startTime');
      expect(typeof opts.timeMin).toBe('string');
      return { data: { items: [{ id: 'e1' }, { id: 'e2' }] } };
    });
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({ name: tool.name, args: { op: 'list' } });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data.length).toBe(2);
      expect(setCredsMock).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    }
  });

  it('create: requires event and returns created event', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    insertMock.mockImplementation(async (opts: any) => {
      expect(opts.calendarId).toBe('primary');
      expect(opts.requestBody.summary).toBe('Meet');
      return { data: { id: 'newEv' } };
    });
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'create', event: { summary: 'Meet' } as any },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.data.id).toBe('newEv');
    }
  });

  it('create: throws validation error when event missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'create' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('update: requires eventId and event; returns updated event', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    updateMock.mockImplementation(async (opts: any) => {
      expect(opts.calendarId).toBe('primary');
      expect(opts.eventId).toBe('e123');
      expect(opts.requestBody.summary).toBe('Changed');
      return { data: { id: 'e123' } };
    });
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'update',
        eventId: 'e123',
        event: { summary: 'Changed' } as any,
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data.id).toBe('e123');
    }
  });

  it('update: throws validation error when missing eventId or event', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'update', eventId: 'e123' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('delete: requires eventId and returns ok', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    deleteMock.mockResolvedValueOnce(undefined);
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete', eventId: 'e1' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
    }
  });

  it('delete: throws validation error when eventId missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when Calendar API throws', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh';
    listMock.mockRejectedValueOnce(new Error('calendar down'));
    const tool = new GoogleCalendarActor();
    const res = await tool.execute({ name: tool.name, args: { op: 'list' } });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/calendar down/);
  });
});
