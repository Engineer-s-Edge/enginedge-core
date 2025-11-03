import { GoogleCalendarService } from './google-calendar.service';
import { MyLogger } from '../../../services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let auth: any;
  let api: any;
  let orchestrator: any;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    auth = {
      generateAuthUrl: jest.fn().mockReturnValue('http://auth'),
      getTokenFromCode: jest.fn(),
      setCredentials: jest.fn(),
    };
    api = {
      listEvents: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn().mockResolvedValue({ id: 'E' }),
      createLockedBlock: jest.fn().mockResolvedValue({ id: 'LB' }),
      updateEvent: jest.fn().mockResolvedValue({ id: 'U' }),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      updateEventEnhanced: jest.fn().mockResolvedValue({ id: 'UE' }),
    };
    orchestrator = {
      scheduleHabitsAndGoals: jest.fn().mockResolvedValue({
        scheduledEvents: [],
        unscheduledItems: [],
        message: 'ok',
      }),
    };
    service = new GoogleCalendarService(auth, api, orchestrator, logger as any);
  });

  it('generates auth URL via GoogleAuthService', () => {
    expect(service.generateAuthUrl()).toBe('http://auth');
    expect(auth.generateAuthUrl).toHaveBeenCalled();
  });

  it('lists events via API service', async () => {
    const res = await service.listEvents('primary', 5);
    expect(res).toEqual([]);
    expect(api.listEvents).toHaveBeenCalledWith('primary', 5);
  });

  it('creates event via API service', async () => {
    const ev = await service.createEvent('primary', { summary: 'x' } as any);
    expect(ev).toEqual({ id: 'E' });
    expect(api.createEvent).toHaveBeenCalled();
  });

  it('creates locked block via API service', async () => {
    const lb = await service.createLockedBlock('primary', 'Focus', 's', 'e');
    expect(lb).toEqual({ id: 'LB' });
  });

  it('updates and deletes events via API service', async () => {
    const up = await service.updateEvent('primary', 'E1', {
      summary: 'y',
    } as any);
    expect(up).toEqual({ id: 'U' });
    await service.deleteEvent('primary', 'E1');
    expect(api.deleteEvent).toHaveBeenCalledWith('primary', 'E1');
  });

  it('updateEventEnhanced delegates to API', async () => {
    const res = await service.updateEventEnhanced(
      'primary',
      'E1',
      {},
      's',
      'e',
    );
    expect(res).toEqual({ id: 'UE' });
    expect(api.updateEventEnhanced).toHaveBeenCalled();
  });

  it('scheduleHabitsAndGoals delegates to orchestrator', async () => {
    const result = await service.scheduleHabitsAndGoals('primary', 'U1', [], {
      start: '09:00',
      end: '18:00',
    });
    expect(result.message).toBe('ok');
    expect(orchestrator.scheduleHabitsAndGoals).toHaveBeenCalled();
  });
});
