import { CalendarEventPublisher } from './calendar-event.publisher';
import { MyLogger } from '../../services/logger/logger.service';

const makeLogger = (): Partial<MyLogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
});

describe('CalendarEventPublisher', () => {
  let publisher: CalendarEventPublisher;
  const kafkaService = {
    publishCalendarEvent: jest.fn(),
    publishUserActivity: jest.fn(),
    triggerMLPipeline: jest.fn(),
    getStatus: jest.fn().mockReturnValue({ connected: true, enabled: true }),
  } as any;
  const logger = makeLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new CalendarEventPublisher(kafkaService, logger as any);
  });

  it('publishes event and user activity; respects triggerMLPipeline=false', async () => {
    await publisher.publishEvent({
      userId: 'u1',
      eventType: 'event_created',
      eventData: { title: 't' },
      triggerMLPipeline: false,
    });

    expect(kafkaService.publishCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', eventType: 'event_created' }),
    );
    expect(kafkaService.publishUserActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', eventType: 'event_created' }),
    );
    expect(kafkaService.triggerMLPipeline).not.toHaveBeenCalled();
  });

  it('triggers ML pipeline when threshold reached and resets count', async () => {
    // Trigger 5 events for same user to reach threshold
    for (let i = 0; i < 5; i++) {
      await publisher.publishEvent({
        userId: 'u2',
        eventType: 'event_viewed',
        eventData: {},
      });
    }
    expect(kafkaService.triggerMLPipeline).toHaveBeenCalledTimes(1);
  });

  it('publishBatchEvents triggers one ML update per unique user after batch', async () => {
    const batch = [
      { userId: 'a', eventType: 'event_created', eventData: {} },
      { userId: 'a', eventType: 'event_updated', eventData: {} },
      { userId: 'b', eventType: 'event_deleted', eventData: {} },
    ];
    await publisher.publishBatchEvents(batch as any);

    // publishEvent is called for each with triggerMLPipeline=false
    expect(kafkaService.publishCalendarEvent).toHaveBeenCalledTimes(3);
    // Force-check path should cause a trigger per unique user
    expect(kafkaService.triggerMLPipeline).toHaveBeenCalledTimes(2);
  });

  it('healthCheck reports healthy based on kafka status', async () => {
    kafkaService.getStatus.mockReturnValueOnce({
      connected: true,
      enabled: true,
    });
    await expect(publisher.healthCheck()).resolves.toEqual(
      expect.objectContaining({ healthy: true }),
    );
    kafkaService.getStatus.mockReturnValueOnce({
      connected: false,
      enabled: true,
    });
    const hc = await publisher.healthCheck();
    expect(hc.healthy).toBe(false);
  });
});
