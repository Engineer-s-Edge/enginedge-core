import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService, ScheduleItem } from './scheduling.service';
import { HabitsService } from './habits.service';
import { GoalsService } from './goals.service';
import { MyLogger } from '../../../services/logger/logger.service';
import { GoalStatus } from '../dto/goal.dto';

describe('SchedulingService (core/infrastructure)', () => {
  let service: SchedulingService;
  const habitsService = {
    getUnmetHabits: jest.fn(),
    toggleEntry: jest.fn(),
  } as unknown as jest.Mocked<HabitsService>;
  const goalsService = {
    getUnmetGoals: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<GoalsService>;
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: HabitsService, useValue: habitsService },
        { provide: GoalsService, useValue: goalsService },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(SchedulingService);
    jest.useFakeTimers().setSystemTime(new Date('2025-03-10T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  function makeBusy(start: string, end: string) {
    return { start: new Date(start), end: new Date(end) };
  }

  it('getUnmetItemsForScheduling should merge and prioritize', async () => {
    (habitsService.getUnmetHabits as any).mockResolvedValue([
      {
        _id: '64c6b98b5b8f1b2a1c3d4e5f',
        title: 'Exercise',
        priority: 'critical',
        dailyTimeCommitment: 30,
      },
      {
        _id: '64c6b98b5b8f1b2a1c3d4e60',
        title: 'Read',
        priority: 'low',
        dailyTimeCommitment: 20,
      },
    ]);
    (goalsService.getUnmetGoals as any).mockResolvedValue([
      {
        _id: '64c6b98b5b8f1b2a1c3d4e61',
        title: 'Ship Feature',
        priority: 'high',
        dailyTimeCommitment: 120,
      },
    ]);
    const items = await service.getUnmetItemsForScheduling('u1');
    expect(items.map((i) => i.title)).toEqual([
      'Exercise',
      'Ship Feature',
      'Read',
    ]);
    expect(items[0].type).toBe('habit');
  });

  it('scheduleItemsForToday should find slots, fit items, and mark as met', async () => {
    (habitsService.getUnmetHabits as any).mockResolvedValue([
      {
        _id: '64c6b98b5b8f1b2a1c3d4e5f',
        title: 'Exercise',
        priority: 'high',
        dailyTimeCommitment: 60,
      },
    ]);
    (goalsService.getUnmetGoals as any).mockResolvedValue([
      {
        _id: '64c6b98b5b8f1b2a1c3d4e61',
        title: 'Write Report',
        priority: 'medium',
        dailyTimeCommitment: 60,
        status: 'not_started',
      },
    ]);
    const busy = [
      makeBusy('2025-03-10T12:00:00.000Z', '2025-03-10T13:00:00.000Z'),
      makeBusy('2025-03-10T15:30:00.000Z', '2025-03-10T16:00:00.000Z'),
    ];
    const slots = await service.scheduleItemsForToday('u1', busy);
    // Should schedule at least one item
    expect(slots.length).toBeGreaterThan(0);
    // markScheduledItemsAsMet is called internally; verify side-effects
    expect(habitsService.toggleEntry).toHaveBeenCalledTimes(1);
    expect(goalsService.update).toHaveBeenCalledWith(
      '64c6b98b5b8f1b2a1c3d4e61',
      'u1',
      { status: GoalStatus.IN_PROGRESS },
    );
  });

  it('previewSchedule should identify unscheduled items and optionally mark as met', async () => {
    const items: ScheduleItem[] = [
      {
        type: 'goal',
        id: '64c6b98b5b8f1b2a1c3d4e50',
        title: 'Long Goal',
        priority: 'medium',
        estimatedDuration: 180,
        item: { status: 'not_started' } as any,
      },
      {
        type: 'habit',
        id: '64c6b98b5b8f1b2a1c3d4e51',
        title: 'Short Habit',
        priority: 'high',
        estimatedDuration: 20,
        item: {} as any,
      },
    ];
    // mock unmet getters used by previewSchedule
    (habitsService.getUnmetHabits as any).mockResolvedValue([items[1]]);
    (goalsService.getUnmetGoals as any).mockResolvedValue([items[0]]);

    const busy = [
      makeBusy('2025-03-10T09:00:00.000Z', '2025-03-10T17:00:00.000Z'),
    ];
    const result = await service.previewSchedule(
      'u1',
      busy,
      { start: '09:00', end: '18:00' },
      true,
    );
    expect(
      result.scheduledItems.length + result.unscheduledItems.length,
    ).toBeGreaterThan(0);
  });

  it('scheduleProvidedItems should skip marking non-ObjectId IDs and still schedule', async () => {
    const items: ScheduleItem[] = [
      {
        type: 'habit',
        id: 'client-temp-1',
        title: 'Temp Habit',
        priority: 'low',
        estimatedDuration: 30,
        item: {} as any,
      },
      {
        type: 'goal',
        id: 'not-an-objectid',
        title: 'Temp Goal',
        priority: 'low',
        estimatedDuration: 45,
        item: { status: 'not_started' } as any,
      },
    ];
    const busy = [
      makeBusy('2025-03-10T10:00:00.000Z', '2025-03-10T12:00:00.000Z'),
    ];
    const result = await service.scheduleProvidedItems(
      items,
      busy,
      { start: '09:00', end: '18:00' },
      true,
      'u1',
    );
    expect(result.scheduledItems.length).toBeGreaterThan(0);
    // ensure no DB mutations for non-ObjectId identifiers
    expect(habitsService.toggleEntry).not.toHaveBeenCalled();
    expect(goalsService.update).not.toHaveBeenCalled();
  });

  it('should split large items into chunks when needed (indirectly via schedule)', async () => {
    const largeItem: ScheduleItem = {
      type: 'goal',
      id: '64c6b98b5b8f1b2a1c3d4f00',
      title: 'Large Goal',
      priority: 'high',
      estimatedDuration: 180,
      item: { status: 'not_started' } as any,
    };
    // Build busy slots using local time to avoid timezone issues
    const today = new Date();
    const d = (h: number, m: number) => {
      const t = new Date(today);
      t.setHours(h, m, 0, 0);
      return t;
    };
    // Busy: 09:45-10:00, 10:30-11:00 -> Available: 09:00-09:45 (45m), 10:00-10:30 (30m), 11:00-12:00 (60m)
    const result = await service.scheduleProvidedItems(
      [largeItem],
      [
        { start: d(9, 45), end: d(10, 0) },
        { start: d(10, 30), end: d(11, 0) },
      ],
      { start: '09:00', end: '12:00' },
      false,
    );
    expect(result.scheduledItems.length).toBeGreaterThan(1);
    expect(result.scheduledItems[0].item.isSplit || false).toBe(true);
  });
});
