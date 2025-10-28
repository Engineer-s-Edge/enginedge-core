import { Test, TestingModule } from '@nestjs/testing';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MyLogger } from '../../../services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('GoogleCalendarController', () => {
  let controller: GoogleCalendarController;
  let service: any;
  let config: any;

  beforeEach(async () => {
    service = {
      generateAuthUrl: jest.fn().mockReturnValue('http://auth'),
      getTokenFromCode: jest.fn().mockResolvedValue({ access_token: 't' }),
      setCredentials: jest.fn(),
      listEvents: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn().mockResolvedValue({ id: 'E' }),
      createLockedBlock: jest.fn().mockResolvedValue({ id: 'LB' }),
      updateEvent: jest.fn().mockResolvedValue({ id: 'U' }),
      updateEventEnhanced: jest.fn().mockResolvedValue({ id: 'UE' }),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      scheduleHabitsAndGoals: jest.fn().mockResolvedValue({
        scheduledEvents: [],
        unscheduledItems: [],
        message: 'ok',
      }),
    };
    config = { get: jest.fn().mockReturnValue('http://frontend') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleCalendarController],
      providers: [
        { provide: GoogleCalendarService, useValue: service },
        { provide: ConfigService, useValue: config },
        { provide: MyLogger, useValue: new MockLogger() },
      ],
    }).compile();

    controller = module.get(GoogleCalendarController);
  });

  it('auth redirect returns FOUND and URL', () => {
    const res = controller.authorize();
    expect(res).toEqual({ url: 'http://auth', statusCode: HttpStatus.FOUND });
  });

  it('auth callback redirects with tokens', async () => {
    const res = await controller.handleAuthCallback('code');
    expect(service.getTokenFromCode).toHaveBeenCalledWith('code');
    expect(res.statusCode).toBe(HttpStatus.FOUND);
    expect(String(res.url)).toContain('http://frontend/calendar-temp?');
  });

  it('listEvents requires Bearer token and delegates to service', async () => {
    await expect(
      controller.listEvents('primary', 5 as any, 'Bearer abc'),
    ).resolves.toEqual([]);
    expect(service.setCredentials).toHaveBeenCalledWith({
      access_token: 'abc',
    });
    expect(service.listEvents).toHaveBeenCalledWith('primary', 5);
  });

  it('createEvent passes token and body', async () => {
    await expect(
      controller.createEvent({ summary: 'x' }, 'primary', 'Bearer t'),
    ).resolves.toEqual({ id: 'E' });
    expect(service.setCredentials).toHaveBeenCalledWith({ access_token: 't' });
  });

  it('updateEventEnhanced delegates and returns result', async () => {
    await expect(
      controller.updateEventEnhanced('primary', 'E1', {}, 'Bearer t'),
    ).resolves.toEqual({ id: 'UE' });
  });

  it('deleteEvent delegates and returns success message', async () => {
    await expect(
      controller.deleteEvent('primary', 'E1', 'Bearer t'),
    ).resolves.toEqual({ message: 'Event deleted successfully' });
  });

  it('scheduleHabitsAndGoals delegates to service', async () => {
    const req = { busySlots: [], userId: 'U1' } as any;
    const res = await controller.scheduleHabitsAndGoals(
      req,
      'primary',
      'Bearer t',
    );
    expect(res.message).toBe('ok');
  });

  it('throws 401 when auth header is missing or invalid', async () => {
    await expect(
      controller.listEvents('primary', 5 as any, 'bad'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
