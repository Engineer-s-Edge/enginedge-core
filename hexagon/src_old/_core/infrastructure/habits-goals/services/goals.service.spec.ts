import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GoalsService } from './goals.service';
import { Goal } from '../entities/goal.entity';
import { NotFoundException } from '@nestjs/common';
import { GoalStatus } from '../dto/goal.dto';

describe('GoalsService (core/infrastructure)', () => {
  let service: GoalsService;
  let goalModel: any;

  beforeEach(async () => {
    goalModel = jest.fn(); // acts as constructor for new this.goalModel()

    goalModel.find = jest.fn();
    goalModel.findOne = jest.fn();
    goalModel.findOneAndUpdate = jest.fn();
    goalModel.deleteOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        {
          provide: getModelToken(Goal.name),
          useValue: goalModel,
        },
      ],
    }).compile();

    service = module.get(GoalsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  function chainFind(result: any[]) {
    const exec = jest.fn().mockResolvedValue(result);
    const sort = jest.fn().mockReturnValue({ exec });
    return { sort, exec };
  }

  it('create should instantiate model, coerce dates, and save', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const dto = {
      title: 'Learn TS',
      status: GoalStatus.NOT_STARTED,
      priority: 'high',
      startDate: '2025-01-15T00:00:00.000Z',
      targetDate: '2025-02-01T00:00:00.000Z',
      dailyTimeCommitment: 45,
    } as any;

    const save = jest.fn().mockResolvedValue({
      _id: 'g1',
      ...dto,
      userId,
      startDate: new Date(dto.startDate),
      targetDate: new Date(dto.targetDate),
    });
    goalModel.mockImplementation((data: any) => ({ ...data, save }));

    const res = await service.create(userId, dto);
    expect(goalModel).toHaveBeenCalledWith({
      ...dto,
      userId,
      startDate: new Date(dto.startDate),
      targetDate: new Date(dto.targetDate),
    });
    expect(save).toHaveBeenCalled();
    expect(res._id).toBe('g1');
  });

  it('create should omit undefined targetDate', async () => {
    const userId = 'u1';
    const dto = {
      title: 'No target',
      status: GoalStatus.NOT_STARTED,
      priority: 'medium',
      startDate: '2025-01-01T00:00:00.000Z',
    } as any;
    const save = jest.fn().mockResolvedValue({ _id: 'g2' });
    goalModel.mockImplementation((data: any) => ({ ...data, save }));
    await service.create(userId, dto);
    expect(goalModel).toHaveBeenCalledWith({
      ...dto,
      userId,
      startDate: new Date(dto.startDate),
      targetDate: undefined,
    });
  });

  it('findAll should query by userId', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ exec });
    const res = await service.findAll('u1');
    expect(goalModel.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(exec).toHaveBeenCalled();
    expect(res).toHaveLength(1);
  });

  it('findOne should return goal when found', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'g1' });
    goalModel.findOne.mockReturnValue({ exec });
    const res = await service.findOne('g1', 'u1');
    expect(goalModel.findOne).toHaveBeenCalledWith({ _id: 'g1', userId: 'u1' });
    expect(res._id).toBe('g1');
  });

  it('findOne should throw NotFoundException when not found', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    goalModel.findOne.mockReturnValue({ exec });
    await expect(service.findOne('missing', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update should set updatedAt and return updated doc', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'g1', title: 'New' });
    goalModel.findOneAndUpdate.mockReturnValue({ exec });
    const res = await service.update('g1', 'u1', { title: 'New' } as any);
    expect(goalModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'g1', userId: 'u1' },
      expect.objectContaining({ title: 'New', updatedAt: expect.any(Date) }),
      { new: true },
    );
    expect(res._id).toBe('g1');
  });

  it('update should throw NotFound when doc missing', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    goalModel.findOneAndUpdate.mockReturnValue({ exec });
    await expect(
      service.update('g1', 'u1', { title: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateProgress should set status based on progress and update', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue({ _id: 'g1', progress: 50, status: 'in_progress' });
    goalModel.findOneAndUpdate.mockReturnValue({ exec });
    const res = await service.updateProgress('g1', 'u1', { progress: 50 });
    expect(goalModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'g1', userId: 'u1' },
      expect.objectContaining({
        progress: 50,
        status: 'in_progress',
        updatedAt: expect.any(Date),
      }),
      { new: true },
    );
    expect(res.status).toBe('in_progress');
  });

  it('updateProgress should mark completed at 100%', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue({ _id: 'g1', progress: 100, status: 'completed' });
    goalModel.findOneAndUpdate.mockReturnValue({ exec });
    await service.updateProgress('g1', 'u1', { progress: 100 });
    expect(goalModel.findOneAndUpdate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('remove should delete and not throw when deletedCount > 0', async () => {
    const exec = jest.fn().mockResolvedValue({ deletedCount: 1 });
    goalModel.deleteOne.mockReturnValue({ exec });
    await expect(service.remove('g1', 'u1')).resolves.toBeUndefined();
    expect(goalModel.deleteOne).toHaveBeenCalledWith({
      _id: 'g1',
      userId: 'u1',
    });
  });

  it('remove should throw NotFound when nothing deleted', async () => {
    const exec = jest.fn().mockResolvedValue({ deletedCount: 0 });
    goalModel.deleteOne.mockReturnValue({ exec });
    await expect(service.remove('g1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getUnmetGoals should filter by status and targetDate >= today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-03-10T09:00:00.000Z'));
    const { sort } = chainFind([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ sort });
    const res = await service.getUnmetGoals('u1');
    expect(goalModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        status: { $in: ['not_started', 'in_progress'] },
      }),
    );
    expect(sort).toHaveBeenCalledWith({ priority: 1, targetDate: 1 });
    expect(res).toHaveLength(1);
  });

  it('getGoalsByPriority should filter and sort', async () => {
    const { sort } = chainFind([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ sort });
    const res = await service.getGoalsByPriority('u1', ['high', 'critical']);
    expect(goalModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      priority: { $in: ['high', 'critical'] },
      status: { $in: ['not_started', 'in_progress'] },
    });
    expect(sort).toHaveBeenCalledWith({ priority: 1, targetDate: 1 });
    expect(res.length).toBe(1);
  });

  it('getOverdueGoals should filter by targetDate < today at midnight', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-03-10T12:34:56.000Z'));
    const { sort } = chainFind([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ sort });
    await service.getOverdueGoals('u1');
    const query = goalModel.find.mock.calls[0][0];
    expect(query.userId).toBe('u1');
    expect(query.status).toEqual({ $in: ['not_started', 'in_progress'] });
    // Compute expected midnight using the same local-midnight logic as the service
    const expectedMidnight = new Date('2025-03-10T12:34:56.000Z');
    expectedMidnight.setHours(0, 0, 0, 0);
    expect(query.targetDate.$lt.getTime()).toBe(expectedMidnight.getTime());
    expect(sort).toHaveBeenCalledWith({ targetDate: 1 });
  });

  it('getGoalsByStatus should filter by statuses and sort by updatedAt desc', async () => {
    const { sort } = chainFind([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ sort });
    await service.getGoalsByStatus('u1', ['completed', 'on_hold']);
    expect(goalModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      status: { $in: ['completed', 'on_hold'] },
    });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it('getTotalDailyTimeCommitment should sum active goals', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue([
        { dailyTimeCommitment: 25 },
        { dailyTimeCommitment: 35 },
        { dailyTimeCommitment: 0 },
      ]);
    goalModel.find.mockReturnValue({ exec });
    const total = await service.getTotalDailyTimeCommitment('u1');
    expect(goalModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      status: { $in: ['not_started', 'in_progress'] },
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    });
    expect(total).toBe(60);
  });

  it('getGoalsByTimeCommitment should filter by min/max and sort asc', async () => {
    const { sort } = chainFind([{ _id: 'g1' }]);
    goalModel.find.mockReturnValue({ sort });
    await service.getGoalsByTimeCommitment('u1', 15, 60);
    expect(goalModel.find).toHaveBeenCalledWith({
      userId: 'u1',
      status: { $in: ['not_started', 'in_progress'] },
      dailyTimeCommitment: expect.objectContaining({
        $exists: true,
        $gt: 0,
        $gte: 15,
        $lte: 60,
      }),
    });
    expect(sort).toHaveBeenCalledWith({ dailyTimeCommitment: 1 });
  });
});
