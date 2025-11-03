import { GoogleCalendarApiService } from './google-calendar-api.service';
import { GoogleAuthService } from './google-auth.service';
import { MyLogger } from '../../../services/logger/logger.service';

const eventsList = jest.fn();
const eventsInsert = jest.fn();
const eventsUpdate = jest.fn();
const eventsDelete = jest.fn();
const eventsGet = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn().mockImplementation(() => ({
      events: {
        list: eventsList,
        insert: eventsInsert,
        update: eventsUpdate,
        delete: eventsDelete,
        get: eventsGet,
      },
    })),
  },
}));

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GoogleCalendarApiService', () => {
  let service: GoogleCalendarApiService;
  let auth: Partial<GoogleAuthService>;
  let logger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new MockLogger();
    auth = { getOAuth2Client: jest.fn().mockReturnValue({}) } as any;
    service = new GoogleCalendarApiService(
      auth as GoogleAuthService,
      logger as any,
    );
  });

  it('lists events and enriches/locks external items', async () => {
    const items = [
      {
        id: '1',
        summary: 'External Meeting',
        extendedProperties: { private: {} },
      },
      {
        id: '2',
        summary: '🔒 Locked',
        extendedProperties: { private: { immutable: 'true' } },
      },
      { id: undefined, summary: 'no id' },
    ] as any;
    eventsList.mockResolvedValue({ data: { items } });

    const res = await service.listEvents('primary', 10);
    expect(res.length).toBe(2); // filters out item without id
    const [enriched, locked] = res;
    expect(enriched.summary?.startsWith('🔒')).toBe(true);
    expect(enriched.extendedProperties?.private?.lockedByEnginEdge).toBe(
      'true',
    );
    expect(locked.extendedProperties?.private?.immutable).toBe('true');
  });

  it('createEvent performs overlap check and inserts when safe', async () => {
    const locked = {
      id: 'L',
      summary: '🔒 Block',
      start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
      end: { dateTime: new Date(Date.now() + 7200000).toISOString() },
      extendedProperties: { private: { immutable: 'true' } },
    };
    eventsList.mockResolvedValue({ data: { items: [locked] } });
    eventsInsert.mockResolvedValue({ data: { id: 'E1' } });

    const event = {
      summary: 'Work',
      start: { dateTime: new Date(Date.now() + 7200000).toISOString() },
      end: { dateTime: new Date(Date.now() + 10800000).toISOString() },
    } as any;

    const created = await service.createEvent('primary', event);
    expect(eventsInsert).toHaveBeenCalled();
    expect(created).toEqual({ id: 'E1' });
  });

  it('createLockedBlock builds locked event and delegates to createEvent', async () => {
    jest
      .spyOn(service as any, 'createEvent')
      .mockResolvedValue({ id: 'LB' } as any);
    const res = await service.createLockedBlock(
      'primary',
      'Focus',
      '2025-01-01T10:00:00Z',
      '2025-01-01T11:00:00Z',
    );
    expect(res).toEqual({ id: 'LB' });
    (service as any).createEvent.mockRestore();
  });

  it('updateEvent and deleteEvent call google client', async () => {
    eventsUpdate.mockResolvedValue({ data: { id: 'U' } });
    eventsDelete.mockResolvedValue({});

    const updated = await service.updateEvent('primary', 'E1', {
      summary: 'x',
    } as any);
    expect(updated).toEqual({ id: 'U' });

    await service.deleteEvent('primary', 'E1');
    expect(eventsDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'E1',
    });
  });

  it('updateEventEnhanced fetches, validates times, checks overlaps, and updates', async () => {
    const now = new Date();
    const current = {
      id: 'E1',
      start: { dateTime: new Date(now.getTime() + 3600000).toISOString() },
      end: { dateTime: new Date(now.getTime() + 7200000).toISOString() },
    };
    eventsGet.mockResolvedValue({ data: current });
    eventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'X',
            start: {
              dateTime: new Date(now.getTime() + 10800000).toISOString(),
            },
            end: { dateTime: new Date(now.getTime() + 14400000).toISOString() },
          },
        ],
      },
    });
    eventsUpdate.mockResolvedValue({ data: { id: 'E1' } });

    const res = await service.updateEventEnhanced(
      'primary',
      'E1',
      { summary: 'new' },
      new Date(now.getTime() + 1800000).toISOString(),
      new Date(now.getTime() + 5400000).toISOString(),
    );
    expect(res).toEqual({ id: 'E1' });
  });
});
