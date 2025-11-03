import { NotFoundException } from '@nestjs/common';
import { HabitsService } from './habits.service';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

const makeExec = <T>(value: T) => jest.fn().mockResolvedValue(value);
const makeSort = <T>(value: T) =>
  jest.fn().mockReturnValue({ exec: makeExec(value) });

describe('HabitsService', () => {
  let service: HabitsService;
  let habitModel: any;
  const userId = 'user-1';

  beforeEach(() => {
    const ctorMock: any = jest.fn().mockImplementation((data: any) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ _id: 'h1', ...data }),
    }));
    ctorMock.find = jest.fn();
    ctorMock.findOne = jest.fn();
    ctorMock.findOneAndUpdate = jest.fn();
    ctorMock.deleteOne = jest.fn();
    habitModel = ctorMock as any;

    service = new HabitsService(habitModel, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('create persists with date conversions', async () => {
    const dto = {
      title: 'Meditate',
      startDate: new Date('2025-01-01').toISOString(),
      endDate: new Date('2025-03-01').toISOString(),
      status: 'active',
      frequency: 'daily',
      priority: 'high',
      dailyTimeCommitment: 10,
    } as any;
    const res = await service.create(userId, dto);
    expect(habitModel).toHaveBeenCalledTimes(1);
    const arg = habitModel.mock.calls[0][0];
    expect(arg.userId).toBe(userId);
    expect(arg.startDate).toBeInstanceOf(Date);
    expect(arg.endDate).toBeInstanceOf(Date);
    expect(res._id).toBe('h1');
  });

  it('create logs and throws on error', async () => {
    const err = new Error('create failed');
    (habitModel as any).mockImplementationOnce((data: any) => ({
      ...data,
      save: jest.fn().mockRejectedValue(err),
    }));
    await expect(
      service.create(userId, {
        title: 'X',
        startDate: new Date().toISOString(),
        status: 'active',
        frequency: 'daily',
      } as any),
    ).rejects.toThrow('create failed');
    expect(logger.error).toHaveBeenCalled();
  });

  it('findAll returns docs', async () => {
    const docs = [{ _id: '1' }];
    habitModel.find.mockReturnValue({ exec: makeExec(docs) });
    const res = await service.findAll(userId);
    expect(habitModel.find).toHaveBeenCalledWith({ userId });
    expect(res).toEqual(docs);
  });

  it('findOne returns doc or throws NotFound', async () => {
    const doc = { _id: 'h1' };
    habitModel.findOne.mockReturnValue({ exec: makeExec(doc) });
    await expect(service.findOne('h1', userId)).resolves.toBe(doc);

    habitModel.findOne.mockReturnValue({ exec: makeExec(null) });
    await expect(service.findOne('nope', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update returns updated or throws NotFound', async () => {
    const updated = { _id: 'h1', title: 'new' };
    habitModel.findOneAndUpdate.mockReturnValue({ exec: makeExec(updated) });
    await expect(
      service.update('h1', userId, { title: 'new' } as any),
    ).resolves.toBe(updated);

    habitModel.findOneAndUpdate.mockReturnValue({ exec: makeExec(null) });
    await expect(
      service.update('nope', userId, { title: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove deletes or throws NotFound', async () => {
    habitModel.deleteOne.mockReturnValue({
      exec: makeExec({ deletedCount: 1 }),
    });
    await expect(service.remove('h1', userId)).resolves.toBeUndefined();
    habitModel.deleteOne.mockReturnValue({
      exec: makeExec({ deletedCount: 0 }),
    });
    await expect(service.remove('h2', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toggleEntry creates new entry when none exists for date', async () => {
    const save = jest.fn().mockResolvedValue({ _id: 'h1' });
    const existing: any = {
      _id: 'h1',
      userId,
      entries: [],
      updatedAt: undefined,
      save,
    };
    habitModel.findOne.mockReturnValue({ exec: makeExec(existing) });
    const dateIso = new Date('2025-01-02').toISOString();
    const res = await service.toggleEntry('h1', userId, {
      date: dateIso,
      completed: true,
      notes: 'done',
      mood: 'good',
    } as any);
    expect(existing.entries.length).toBe(1);
    expect(existing.entries[0].completed).toBe(true);
    expect(existing.updatedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalled();
    expect(res._id).toBe('h1');
  });

  it('toggleEntry updates existing entry for same date', async () => {
    const date = new Date('2025-01-03');
    const save = jest.fn().mockResolvedValue({ _id: 'h1' });
    const existing: any = {
      _id: 'h1',
      userId,
      entries: [{ date, completed: false, notes: '', createdAt: new Date() }],
      updatedAt: undefined,
      save,
    };
    habitModel.findOne.mockReturnValue({ exec: makeExec(existing) });
    await service.toggleEntry('h1', userId, {
      date: date.toISOString(),
      completed: true,
      notes: 'yay',
    } as any);
    expect(existing.entries[0].completed).toBe(true);
    expect(existing.entries[0].notes).toBe('yay');
    expect(save).toHaveBeenCalled();
  });

  describe('getUnmetHabits', () => {
    it('returns active habits that should be done today and not yet completed', async () => {
      // Today
      const today = new Date('2025-01-10T12:00:00Z');
      jest.useFakeTimers().setSystemTime(today);

      const entries = [
        // entry for yesterday
        { date: new Date('2025-01-09T00:00:00Z'), completed: true },
      ];
      const habits = [
        // Active daily, not yet done today -> unmet
        {
          _id: 'h1',
          status: 'active',
          frequency: 'daily',
          startDate: new Date('2025-01-01T00:00:00Z'),
          entries: [],
        },
        // Active weekly, started 7 days ago -> should be done today, but completed today -> not unmet
        {
          _id: 'h2',
          status: 'active',
          frequency: 'weekly',
          startDate: new Date('2025-01-03T00:00:00Z'),
          entries: [
            { date: new Date('2025-01-10T00:00:00Z'), completed: true },
          ],
        },
        // Inactive -> not included
        {
          _id: 'h3',
          status: 'paused',
          frequency: 'daily',
          startDate: new Date('2025-01-01T00:00:00Z'),
          entries,
        },
        // Active custom every 2 days, today is matching day but already completed -> not unmet
        {
          _id: 'h4',
          status: 'active',
          frequency: 'custom',
          customFrequency: 2,
          startDate: new Date('2025-01-08T00:00:00Z'),
          entries: [
            { date: new Date('2025-01-10T00:00:00Z'), completed: true },
          ],
        },
      ] as any;

      habitModel.find.mockReturnValue({ exec: makeExec(habits) });

      const res = await service.getUnmetHabits(userId);
      // Only h1 should be unmet
      expect(res.map((h: any) => h._id)).toEqual(['h1']);

      jest.useRealTimers();
    });
  });

  it('getHabitsByPriority filters and sorts', async () => {
    const docs = [{ _id: 'a' }];
    habitModel.find.mockImplementation((query: any) => {
      expect(query.priority.$in).toEqual(['high']);
      expect(query.status).toBe('active');
      return { sort: makeSort(docs) };
    });
    const res = await service.getHabitsByPriority(userId, ['high']);
    expect(res).toEqual(docs);
  });

  it('getTotalDailyTimeCommitment sums minutes', async () => {
    const docs = [
      { dailyTimeCommitment: 10 },
      { dailyTimeCommitment: 5 },
      { dailyTimeCommitment: 0 },
    ];
    habitModel.find.mockReturnValue({ exec: makeExec(docs) });
    const total = await service.getTotalDailyTimeCommitment(userId);
    expect(habitModel.find).toHaveBeenCalledWith({
      userId,
      status: 'active',
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    });
    expect(total).toBe(15);
  });

  it('getHabitsByTimeCommitment supports range filters', async () => {
    const docs = [{ dailyTimeCommitment: 15 }];
    habitModel.find.mockImplementation((query: any) => {
      expect(query.dailyTimeCommitment.$gte).toBe(10);
      expect(query.dailyTimeCommitment.$lte).toBe(20);
      return { sort: makeSort(docs) };
    });
    const res = await service.getHabitsByTimeCommitment(userId, 10, 20);
    expect(res).toEqual(docs);
  });
});
