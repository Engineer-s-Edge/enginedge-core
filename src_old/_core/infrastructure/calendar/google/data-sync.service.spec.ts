import { DataSyncService } from './data-sync.service';
import { MyLogger } from '../../../services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('DataSyncService', () => {
  let service: DataSyncService;
  let habits: any;
  let goals: any;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    habits = {
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ _id: 'H1' }),
    };
    goals = {
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ _id: 'G1' }),
    };
    service = new DataSyncService(habits, goals, logger as any);
  });

  it('creates new habit when not existing and maps priority', async () => {
    const res = await service.syncFrontendHabitsToDatabase(
      [
        {
          title: 'Hydrate',
          priority: 'urgent',
          dailyTimeCommitment: 10,
          status: 'active',
        },
      ],
      'U1',
    );
    expect(habits.create).toHaveBeenCalled();
    expect(res[0]).toEqual({ _id: 'H1' });
  });

  it('updates existing goal when found by title', async () => {
    goals.findAll.mockResolvedValueOnce([{ _id: 'G1', title: 'Ship' }]);
    goals.update.mockResolvedValueOnce({ _id: 'G1', title: 'Ship' });

    const res = await service.syncFrontendGoalsToDatabase(
      [{ title: 'Ship', priority: 'high' }],
      'U1',
    );
    expect(goals.update).toHaveBeenCalled();
    expect(res[0]._id).toBe('G1');
  });
});
