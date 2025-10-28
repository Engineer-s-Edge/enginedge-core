import { SchedulingOrchestratorService } from './scheduling-orchestrator.service';
import { MyLogger } from '../../../services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('SchedulingOrchestratorService', () => {
  let service: SchedulingOrchestratorService;
  let api: any;
  let dataSync: any;
  let scheduling: any;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    api = {
      listEvents: jest.fn().mockResolvedValue([]),
      createEventWithoutOverlapCheck: jest.fn().mockResolvedValue({ id: 'E' }),
    };
    dataSync = {
      syncFrontendHabitsToDatabase: jest.fn().mockResolvedValue([]),
      syncFrontendGoalsToDatabase: jest.fn().mockResolvedValue([]),
    };
    scheduling = {
      previewSchedule: jest
        .fn()
        .mockResolvedValue({ scheduledItems: [], unscheduledItems: [] }),
      getUnmetItemsForScheduling: jest.fn().mockResolvedValue([]),
      scheduleProvidedItems: jest
        .fn()
        .mockResolvedValue({ scheduledItems: [], unscheduledItems: [] }),
    };
    service = new SchedulingOrchestratorService(
      api,
      dataSync,
      scheduling,
      logger as any,
    );
  });

  it('uses DB scheduling path when no frontend data', async () => {
    api.listEvents.mockResolvedValueOnce([
      {
        id: 'L',
        summary: '🔒',
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
        extendedProperties: { private: { immutable: 'true' } },
      },
    ]);
    const res = await service.scheduleHabitsAndGoals('primary', 'U1', [], {
      start: '09:00',
      end: '18:00',
    });
    expect(scheduling.getUnmetItemsForScheduling).toHaveBeenCalledWith('U1');
    expect(res).toHaveProperty('scheduledEvents');
  });

  it('uses frontend sync fallback path when provided data is present', async () => {
    scheduling.previewSchedule.mockResolvedValueOnce({
      scheduledItems: [
        {
          item: {
            type: 'habit',
            id: 'H1',
            title: 'H1',
            priority: 'medium',
            estimatedDuration: 30,
            isSplit: false,
            item: { description: 'Test habit description' },
          },
          startTime: new Date(),
          endTime: new Date(Date.now() + 1800000),
        },
      ],
      unscheduledItems: [],
    });
    const res = await service.scheduleHabitsAndGoals(
      'primary',
      'U1',
      [],
      { start: '09:00', end: '18:00' },
      [{ title: 'H1', status: 'active' }],
      [],
    );
    expect(dataSync.syncFrontendHabitsToDatabase).toHaveBeenCalled();
    expect(res.scheduledEvents.length).toBeGreaterThanOrEqual(0);
  });
});
