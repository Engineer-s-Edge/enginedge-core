import { NotFoundException } from '@nestjs/common';
import { GoalsService } from './goals.service';

// Simple logger mock
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

// Helpers to build mongoose-like chained mocks
const makeExec = <T>(value: T) => jest.fn().mockResolvedValue(value);
const makeSort = <T>(value: T) =>
  jest.fn().mockReturnValue({ exec: makeExec(value) });

describe('GoalsService', () => {
  let service: GoalsService;
  let goalModel: any;

  const userId = 'user-1';
  const now = new Date();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);

    // Fresh model mock per test
    goalModel = {
      // constructor used via `new this.goalModel(data)`
      // we simulate a class by making this a new-able function
    } as any;

    const ctorMock: any = jest.fn().mockImplementation((data: any) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ _id: 'g1', ...data }),
    }));

    // attach static-like methods used by service
    ctorMock.find = jest.fn();
    ctorMock.findOne = jest.fn();
    ctorMock.findOneAndUpdate = jest.fn();
    ctorMock.deleteOne = jest.fn();

    goalModel = ctorMock as any;

    service = new GoalsService(goalModel, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('creates a goal with date conversions', async () => {
    const dto = {
      title: 'Learn NestJS',
      description: 'Get good',
      priority: 'high',
      startDate: new Date('2025-01-01').toISOString(),
      targetDate: new Date('2025-02-01').toISOString(),
      dailyTimeCommitment: 30,
      status: 'not_started',
    } as any;

    const result = await service.create(userId, dto);

    // constructor called once with merged data
    expect(goalModel).toHaveBeenCalledTimes(1);
    const callArg = goalModel.mock.calls[0][0];
    expect(callArg.userId).toBe(userId);
    expect(callArg.title).toBe(dto.title);
    expect(callArg.startDate).toBeInstanceOf(Date);
    expect(callArg.targetDate).toBeInstanceOf(Date);

    expect(result._id).toBe('g1');
    expect(result.title).toBe(dto.title);
  });

  it('create propagates errors and logs', async () => {
    const err = new Error('save failed');
    (goalModel as any).mockImplementationOnce((data: any) => ({
      ...data,
      save: jest.fn().mockRejectedValue(err),
    }));
    await expect(
      service.create(userId, {
        title: 'T',
        startDate: new Date().toISOString(),
        status: 'not_started',
      } as any),
    ).rejects.toThrow('save failed');
    expect(logger.error).toHaveBeenCalled();
  });

  it('findAll returns user goals', async () => {
    const docs = [{ _id: '1' }, { _id: '2' }];
    goalModel.find.mockReturnValue({ exec: makeExec(docs) });

    const res = await service.findAll(userId);
    expect(goalModel.find).toHaveBeenCalledWith({ userId });
    expect(res).toEqual(docs);
  });

  it('findOne returns document when found', async () => {
    const doc = { _id: 'g1' };
    goalModel.findOne.mockReturnValue({ exec: makeExec(doc) });

    const res = await service.findOne('g1', userId);
    expect(goalModel.findOne).toHaveBeenCalledWith({ _id: 'g1', userId });
    expect(res).toBe(doc);
  });

  it('findOne throws NotFound when missing', async () => {
    goalModel.findOne.mockReturnValue({ exec: makeExec(null) });
    await expect(service.findOne('nope', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update returns updated doc and throws when not found', async () => {
    const updated = { _id: 'g1', title: 'new' };
    // happy
    goalModel.findOneAndUpdate.mockReturnValue({ exec: makeExec(updated) });
    const res = await service.update('g1', userId, { title: 'new' } as any);
    expect(goalModel.findOneAndUpdate).toHaveBeenCalled();
    expect(res).toBe(updated);

    // not found
    goalModel.findOneAndUpdate.mockReturnValue({ exec: makeExec(null) });
    await expect(
      service.update('missing', userId, { title: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateProgress auto-updates status', async () => {
    // progress 100 -> completed
    goalModel.findOneAndUpdate.mockReturnValue({
      exec: makeExec({ _id: 'g1', progress: 100, status: 'completed' }),
    });
    const res1 = await service.updateProgress('g1', userId, {
      progress: 100,
    } as any);
    expect(res1.status).toBe('completed');

    // progress 50 -> in_progress
    goalModel.findOneAndUpdate.mockReturnValue({
      exec: makeExec({ _id: 'g1', progress: 50, status: 'in_progress' }),
    });
    const res2 = await service.updateProgress('g1', userId, {
      progress: 50,
    } as any);
    expect(res2.status).toBe('in_progress');

    // not found
    goalModel.findOneAndUpdate.mockReturnValue({ exec: makeExec(null) });
    await expect(
      service.updateProgress('missing', userId, { progress: 10 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove deletes and throws when nothing removed', async () => {
    // success
    goalModel.deleteOne.mockReturnValue({
      exec: makeExec({ deletedCount: 1 }),
    });
    await expect(service.remove('g1', userId)).resolves.toBeUndefined();

    // missing
    goalModel.deleteOne.mockReturnValue({
      exec: makeExec({ deletedCount: 0 }),
    });
    await expect(service.remove('g2', userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getUnmetGoals builds correct query and sorts', async () => {
    const docs = [{ _id: 'a' }];
    goalModel.find.mockImplementation((query: any) => {
      expect(query.userId).toBe(userId);
      expect(query.status.$in).toEqual(['not_started', 'in_progress']);
      // verify $or structure exists
      expect(Array.isArray(query.$or)).toBe(true);
      return { sort: makeSort(docs) };
    });

    const res = await service.getUnmetGoals(userId);
    expect(res).toEqual(docs);
  });

  it('getGoalsByPriority filters and sorts', async () => {
    const docs = [{ _id: 'a' }];
    goalModel.find.mockImplementation((query: any) => {
      expect(query.priority.$in).toEqual(['high', 'medium']);
      expect(query.status.$in).toEqual(['not_started', 'in_progress']);
      return { sort: makeSort(docs) };
    });
    const res = await service.getGoalsByPriority(userId, ['high', 'medium']);
    expect(res).toEqual(docs);
  });

  it('getOverdueGoals filters by targetDate < today', async () => {
    const docs = [{ _id: 'a' }];
    goalModel.find.mockImplementation((query: any) => {
      expect(query.status.$in).toEqual(['not_started', 'in_progress']);
      expect(query.targetDate.$lt).toBeInstanceOf(Date);
      return { sort: makeSort(docs) };
    });
    const res = await service.getOverdueGoals(userId);
    expect(res).toEqual(docs);
  });

  it('getGoalsByStatus filters and sorts', async () => {
    const docs = [{ _id: 'a' }];
    goalModel.find.mockImplementation((query: any) => {
      expect(query.status.$in).toEqual(['completed', 'in_progress']);
      return { sort: makeSort(docs) };
    });
    const res = await service.getGoalsByStatus(userId, [
      'completed',
      'in_progress',
    ]);
    expect(res).toEqual(docs);
  });

  it('getTotalDailyTimeCommitment sums minutes of active goals', async () => {
    const docs = [
      { dailyTimeCommitment: 15 },
      { dailyTimeCommitment: 10 },
      { dailyTimeCommitment: 0 },
    ];
    goalModel.find.mockReturnValue({ exec: makeExec(docs) });
    const total = await service.getTotalDailyTimeCommitment(userId);
    expect(goalModel.find).toHaveBeenCalledWith({
      userId,
      status: { $in: ['not_started', 'in_progress'] },
      dailyTimeCommitment: { $exists: true, $gt: 0 },
    });
    expect(total).toBe(25);
  });

  it('getGoalsByTimeCommitment supports min and max filters and sorts ascending', async () => {
    const docs = [
      { dailyTimeCommitment: 5 },
      { dailyTimeCommitment: 15 },
      { dailyTimeCommitment: 10 },
    ];
    goalModel.find.mockImplementation((query: any) => {
      expect(query.dailyTimeCommitment.$gte).toBe(5);
      expect(query.dailyTimeCommitment.$lte).toBe(20);
      return { sort: makeSort(docs) };
    });
    const res = await service.getGoalsByTimeCommitment(userId, 5, 20);
    expect(res).toEqual(docs);
  });
});
