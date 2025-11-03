import { TimeManagementService } from './time-management.service';

describe('TimeManagementService', () => {
  const goalsService = {
    getTotalDailyTimeCommitment: jest.fn(),
    getGoalsByTimeCommitment: jest.fn(),
  } as any;
  const habitsService = {
    getTotalDailyTimeCommitment: jest.fn(),
    getHabitsByTimeCommitment: jest.fn(),
  } as any;
  const logger = { info: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getDailyTimeBreakdown aggregates totals and counts', async () => {
    const svc = new TimeManagementService(goalsService, habitsService, logger);
    goalsService.getTotalDailyTimeCommitment.mockResolvedValue(40);
    habitsService.getTotalDailyTimeCommitment.mockResolvedValue(20);
    goalsService.getGoalsByTimeCommitment.mockResolvedValue([{}, {}]);
    habitsService.getHabitsByTimeCommitment.mockResolvedValue([{}]);

    const res = await svc.getDailyTimeBreakdown('user-1');
    expect(res).toEqual({
      habits: 20,
      goals: 40,
      total: 60,
      habitsCount: 1,
      goalsCount: 2,
    });
  });

  it('getAllTimeCommitments merges and sorts by minutes desc', async () => {
    const svc = new TimeManagementService(goalsService, habitsService, logger);
    habitsService.getHabitsByTimeCommitment.mockResolvedValue([
      {
        _id: 'h1',
        title: 'H1',
        dailyTimeCommitment: 10,
        priority: 'high',
        status: 'active',
      },
      {
        _id: 'h2',
        title: 'H2',
        dailyTimeCommitment: 30,
        priority: 'low',
        status: 'active',
      },
    ]);
    goalsService.getGoalsByTimeCommitment.mockResolvedValue([
      {
        _id: 'g1',
        title: 'G1',
        dailyTimeCommitment: 20,
        priority: 'med',
        status: 'in_progress',
      },
    ]);

    const list = await svc.getAllTimeCommitments('user-1');
    expect(
      list.map((x) => `${x.type}:${x.id}:${x.dailyTimeCommitment}`),
    ).toEqual(['habit:h2:30', 'goal:g1:20', 'habit:h1:10']);
  });

  it('getTimeCommitmentsByRange passes filters through and sorts', async () => {
    const svc = new TimeManagementService(goalsService, habitsService, logger);
    habitsService.getHabitsByTimeCommitment.mockResolvedValue([
      {
        _id: 'h1',
        title: 'H1',
        dailyTimeCommitment: 15,
        priority: 'high',
        status: 'active',
      },
    ]);
    goalsService.getGoalsByTimeCommitment.mockResolvedValue([
      {
        _id: 'g1',
        title: 'G1',
        dailyTimeCommitment: 25,
        priority: 'med',
        status: 'in_progress',
      },
    ]);

    const list = await svc.getTimeCommitmentsByRange('user-1', 10, 30);
    expect(habitsService.getHabitsByTimeCommitment).toHaveBeenCalledWith(
      'user-1',
      10,
      30,
    );
    expect(goalsService.getGoalsByTimeCommitment).toHaveBeenCalledWith(
      'user-1',
      10,
      30,
    );
    expect(list.map((x) => x.dailyTimeCommitment)).toEqual([25, 15]);
  });

  it('validateDailyTimeLimit computes exceededBy', async () => {
    const svc = new TimeManagementService(goalsService, habitsService, logger);
    goalsService.getTotalDailyTimeCommitment.mockResolvedValue(50);
    habitsService.getTotalDailyTimeCommitment.mockResolvedValue(30);
    goalsService.getGoalsByTimeCommitment.mockResolvedValue([]);
    habitsService.getHabitsByTimeCommitment.mockResolvedValue([]);

    const over = await svc.validateDailyTimeLimit('user-1', 70);
    expect(over).toEqual({
      isValid: false,
      currentTotal: 80,
      maxLimit: 70,
      exceededBy: 10,
    });

    const ok = await svc.validateDailyTimeLimit('user-1', 90);
    expect(ok).toEqual({
      isValid: true,
      currentTotal: 80,
      maxLimit: 90,
      exceededBy: undefined,
    });
  });
});
