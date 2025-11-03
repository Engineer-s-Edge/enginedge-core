import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HabitsService } from './habits.service';
import { Habit } from '../entities/habit.entity';
import { NotFoundException } from '@nestjs/common';
import { MyLogger } from '../../../services/logger/logger.service';

describe('HabitsService (core/infrastructure)', () => {
  let service: HabitsService;
  let habitModel: any;
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;

  beforeEach(async () => {
    habitModel = jest.fn(); // constructor
    habitModel.find = jest.fn();
    habitModel.findOne = jest.fn();
    habitModel.findOneAndUpdate = jest.fn();
    habitModel.deleteOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HabitsService,
        { provide: getModelToken(Habit.name), useValue: habitModel },
        { provide: MyLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(HabitsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('create should coerce dates and save', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const dto: any = {
      title: 'Meditate',
      frequency: 'daily',
      status: 'active',
      priority: 'high',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-31T00:00:00.000Z',
      dailyTimeCommitment: 20,
    };
    const save = jest.fn().mockResolvedValue({ _id: 'h1' });
    habitModel.mockImplementation((data: any) => ({ ...data, save }));
    const res = await service.create(userId, dto);
    expect(habitModel).toHaveBeenCalledWith({
      ...dto,
      userId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });
    expect(res._id).toBe('h1');
  });

  it('findAll should query by userId', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'h1' }]);
    habitModel.find.mockReturnValue({ exec });
    const res = await service.findAll('u1');
    expect(habitModel.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(res).toHaveLength(1);
  });

  it('findOne should return when found, else NotFound', async () => {
    let exec = jest.fn().mockResolvedValue({ _id: 'h1', entries: [] });
    habitModel.findOne.mockReturnValue({ exec });
    const ok = await service.findOne('h1', 'u1');
    expect(ok._id).toBe('h1');

    exec = jest.fn().mockResolvedValue(null);
    habitModel.findOne.mockReturnValue({ exec });
    await expect(service.findOne('missing', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update should set updatedAt and return updated doc or throw', async () => {
    let exec = jest.fn().mockResolvedValue({ _id: 'h1' });
    habitModel.findOneAndUpdate.mockReturnValue({ exec });
    await service.update('h1', 'u1', { title: 'x' } as any);
    expect(habitModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'h1', userId: 'u1' },
      expect.objectContaining({ title: 'x', updatedAt: expect.any(Date) }),
      { new: true },
    );

    exec = jest.fn().mockResolvedValue(null);
    habitModel.findOneAndUpdate.mockReturnValue({ exec });
    await expect(
      service.update('h1', 'u1', { title: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove should delete or throw NotFound', async () => {
    let exec = jest.fn().mockResolvedValue({ deletedCount: 1 });
    habitModel.deleteOne.mockReturnValue({ exec });
    await expect(service.remove('h1', 'u1')).resolves.toBeUndefined();

    exec = jest.fn().mockResolvedValue({ deletedCount: 0 });
    habitModel.deleteOne.mockReturnValue({ exec });
    await expect(service.remove('h1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toggleEntry should update existing matching date entry', async () => {
    const save = jest.fn().mockResolvedValue({
      entries: [{ date: new Date('2025-03-10'), completed: true }],
    });
    const doc: any = {
      entries: [
        { date: new Date('2025-03-10T09:00:00Z'), completed: false, notes: '' },
      ],
      save,
    };
    const exec = jest.fn().mockResolvedValue(doc);
    habitModel.findOne.mockReturnValue({ exec });
    const res = await service.toggleEntry('h1', 'u1', {
      date: '2025-03-10T15:00:00Z',
      completed: true,
      notes: 'good',
      mood: 8,
    });
    expect(res.entries[0].completed).toBe(true);
  });

  it('toggleEntry should create new entry if none for date', async () => {
    const save = jest.fn().mockResolvedValue({
      entries: [{ date: new Date('2025-03-11'), completed: true }],
    });
    const doc: any = { entries: [], save };
    const exec = jest.fn().mockResolvedValue(doc);
    habitModel.findOne.mockReturnValue({ exec });
    const res = await service.toggleEntry('h1', 'u1', {
      date: '2025-03-11T00:00:00Z',
      completed: true,
    });
    expect(save).toHaveBeenCalled();
    expect(res.entries.length).toBe(1);
  });

  it('getUnmetHabits should return active habits due today and not completed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-03-10T10:00:00Z'));
    const exec = jest.fn().mockResolvedValue([
      // daily active habit without today completion
      {
        title: 'Daily',
        status: 'active',
        frequency: 'daily',
        startDate: new Date('2025-01-01'),
        entries: [],
      },
      // weekly active habit due exactly every 7 days from start
      {
        title: 'Weekly',
        status: 'active',
        frequency: 'weekly',
        startDate: new Date('2025-03-10'),
        entries: [],
      },
      // monthly not due (diff day)
      {
        title: 'Monthly',
        status: 'active',
        frequency: 'monthly',
        startDate: new Date('2025-03-05'),
        entries: [],
      },
      // completed today should be excluded
      // completed today should be excluded (date may be stored without time; align with toDateString in service)
      {
        title: 'Done',
        status: 'active',
        frequency: 'daily',
        startDate: new Date('2025-01-01'),
        entries: [{ date: new Date('2025-03-10T08:00:00Z'), completed: true }],
      },
      // paused should be excluded
      {
        title: 'Paused',
        status: 'paused',
        frequency: 'daily',
        startDate: new Date('2025-01-01'),
        entries: [],
      },
    ]);
    habitModel.find.mockReturnValue({ exec });
    const list = await service.getUnmetHabits('u1');
    const titles = list.map((h: any) => h.title).sort();
    expect(titles).toEqual(['Daily', 'Weekly'].sort());
  });

  it('getHabitsByPriority should filter active and sort', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'h1' }]);
    const sort = jest.fn().mockReturnValue({ exec });
    habitModel.find.mockReturnValue({ sort });
    await service.getHabitsByPriority('u1', ['high']);
    expect(habitModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      priority: { $in: ['high'] },
      status: 'active',
    });
    expect(sort).toHaveBeenCalledWith({ priority: 1 });
  });

  it('getTotalDailyTimeCommitment should sum active habits', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue([
        { dailyTimeCommitment: 10 },
        { dailyTimeCommitment: 25 },
      ]);
    habitModel.find.mockReturnValue({ exec });
    const total = await service.getTotalDailyTimeCommitment('u1');
    expect(habitModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      status: 'active',
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    });
    expect(total).toBe(35);
  });

  it('getHabitsByTimeCommitment should filter by min/max and sort', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'h1' }]);
    const sort = jest.fn().mockReturnValue({ exec });
    habitModel.find.mockReturnValue({ sort });
    await service.getHabitsByTimeCommitment('u1', 5, 40);
    expect(habitModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      status: 'active',
      dailyTimeCommitment: expect.objectContaining({
        $exists: true,
        $gt: 0,
        $gte: 5,
        $lte: 40,
      }),
    });
    expect(sort).toHaveBeenCalledWith({ dailyTimeCommitment: 1 });
  });

  it('getCombinedDailyTimeCommitment should return habits sum with goals=0', async () => {
    jest.spyOn(service, 'getTotalDailyTimeCommitment').mockResolvedValue(30);
    const res = await service.getCombinedDailyTimeCommitment('u1');
    expect(res).toEqual({ habits: 30, goals: 0, total: 30 });
  });
});
