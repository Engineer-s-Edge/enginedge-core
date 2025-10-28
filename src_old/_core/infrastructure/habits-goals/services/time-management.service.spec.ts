import { Test, TestingModule } from '@nestjs/testing';
import { TimeManagementService } from './time-management.service';
import { GoalsService } from './goals.service';
import { HabitsService } from './habits.service';

describe('TimeManagementService (core/infrastructure)', () => {
  let service: TimeManagementService;
  const goalsService = {
    getTotalDailyTimeCommitment: jest.fn(),
    getGoalsByTimeCommitment: jest.fn(),
  } as unknown as jest.Mocked<GoalsService>;
  const habitsService = {
    getTotalDailyTimeCommitment: jest.fn(),
    getHabitsByTimeCommitment: jest.fn(),
  } as unknown as jest.Mocked<HabitsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeManagementService,
        { provide: GoalsService, useValue: goalsService },
        { provide: HabitsService, useValue: habitsService },
      ],
    }).compile();

    service = module.get(TimeManagementService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('getDailyTimeBreakdown should aggregate totals and counts', async () => {
    (habitsService.getTotalDailyTimeCommitment as any).mockResolvedValue(40);
    (goalsService.getTotalDailyTimeCommitment as any).mockResolvedValue(60);
    (habitsService.getHabitsByTimeCommitment as any).mockResolvedValue([
      { id: 'h1' },
      { id: 'h2' },
    ]);
    (goalsService.getGoalsByTimeCommitment as any).mockResolvedValue([
      { id: 'g1' },
    ]);

    const res = await service.getDailyTimeBreakdown('u1');
    expect(res).toEqual({
      habits: 40,
      goals: 60,
      total: 100,
      habitsCount: 2,
      goalsCount: 1,
    });
  });

  it('getAllTimeCommitments should combine and sort by dailyTimeCommitment desc', async () => {
    (habitsService.getHabitsByTimeCommitment as any).mockResolvedValue([
      {
        _id: 'h1',
        title: 'A',
        dailyTimeCommitment: 15,
        priority: 'low',
        status: 'active',
      },
    ]);
    (goalsService.getGoalsByTimeCommitment as any).mockResolvedValue([
      {
        _id: 'g1',
        title: 'B',
        dailyTimeCommitment: 45,
        priority: 'high',
        status: 'in_progress',
      },
    ]);
    const res = await service.getAllTimeCommitments('u1');
    expect(res.map((r) => r.title)).toEqual(['B', 'A']);
    expect(res[0].type).toBe('goal');
    expect(res[1].type).toBe('habit');
  });

  it('getTimeCommitmentsByRange should delegate min/max and sort desc', async () => {
    (habitsService.getHabitsByTimeCommitment as any).mockResolvedValue([
      {
        _id: 'h1',
        title: 'A',
        dailyTimeCommitment: 20,
        priority: 'low',
        status: 'active',
      },
    ]);
    (goalsService.getGoalsByTimeCommitment as any).mockResolvedValue([
      {
        _id: 'g1',
        title: 'B',
        dailyTimeCommitment: 30,
        priority: 'high',
        status: 'in_progress',
      },
    ]);
    const res = await service.getTimeCommitmentsByRange('u1', 10, 40);
    expect(habitsService.getHabitsByTimeCommitment).toHaveBeenCalledWith(
      'u1',
      10,
      40,
    );
    expect(goalsService.getGoalsByTimeCommitment).toHaveBeenCalledWith(
      'u1',
      10,
      40,
    );
    expect(res.map((r) => r.dailyTimeCommitment)).toEqual([30, 20]);
  });

  it('validateDailyTimeLimit should compute exceededBy correctly', async () => {
    jest.spyOn(service, 'getDailyTimeBreakdown').mockResolvedValue({
      habits: 50,
      goals: 60,
      total: 110,
      habitsCount: 2,
      goalsCount: 1,
    });
    const r1 = await service.validateDailyTimeLimit('u1', 120);
    expect(r1).toEqual({
      isValid: true,
      currentTotal: 110,
      maxLimit: 120,
      exceededBy: undefined,
    });
    const r2 = await service.validateDailyTimeLimit('u1', 100);
    expect(r2).toEqual({
      isValid: false,
      currentTotal: 110,
      maxLimit: 100,
      exceededBy: 10,
    });
  });
});
