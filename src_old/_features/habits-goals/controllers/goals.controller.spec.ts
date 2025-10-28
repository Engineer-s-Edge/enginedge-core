import { GoalsApiController, GoalsController } from './goals.controller';

describe('Goals Controllers', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    getUnmetGoals: jest.fn(),
    getOverdueGoals: jest.fn(),
    getTotalDailyTimeCommitment: jest.fn(),
    getGoalsByTimeCommitment: jest.fn(),
    getGoalsByStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateProgress: jest.fn(),
    remove: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  describe('GoalsApiController (no auth)', () => {
    it('requires x-user-id and delegates create', async () => {
      const api = new GoalsApiController(service);
      await expect(api.create(undefined as any, {} as any)).rejects.toThrow(
        'X-User-ID header is required',
      );

      service.create.mockResolvedValue({ id: 'g1' });
      const res = await api.create('user-1', { title: 't' } as any);
      expect(service.create).toHaveBeenCalledWith('user-1', { title: 't' });
      expect(res).toEqual({ id: 'g1' });
    });

    it('findAll and getUnmetGoals require header and delegate', async () => {
      const api = new GoalsApiController(service);
      await expect(api.findAll(undefined as any)).rejects.toThrow(
        'X-User-ID header is required',
      );
      await expect(api.getUnmetGoals(undefined as any)).rejects.toThrow(
        'X-User-ID header is required',
      );

      service.findAll.mockResolvedValue(['a']);
      expect(await api.findAll('user-2')).toEqual(['a']);
      expect(service.findAll).toHaveBeenCalledWith('user-2');

      service.getUnmetGoals.mockResolvedValue(['u']);
      expect(await api.getUnmetGoals('user-3')).toEqual(['u']);
      expect(service.getUnmetGoals).toHaveBeenCalledWith('user-3');
    });
  });

  describe('GoalsController (with auth)', () => {
    const req = (userId = 'user-1') => ({ user: { userId } });
    it('create delegates to service with userId', async () => {
      const ctrl = new GoalsController(service);
      service.create.mockResolvedValue({ id: 'g1' });
      const res = await ctrl.create(req(), { title: 't' } as any);
      expect(service.create).toHaveBeenCalledWith('user-1', { title: 't' });
      expect(res).toEqual({ id: 'g1' });
    });

    it('findAll uses status query to call getGoalsByStatus', async () => {
      const ctrl = new GoalsController(service);
      service.getGoalsByStatus.mockResolvedValue(['s']);
      const res = await ctrl.findAll(req(), 'completed,in_progress');
      expect(service.getGoalsByStatus).toHaveBeenCalledWith('user-1', [
        'completed',
        'in_progress',
      ]);
      expect(res).toEqual(['s']);
    });

    it('findAll without status delegates to findAll', async () => {
      const ctrl = new GoalsController(service);
      service.findAll.mockResolvedValue(['a']);
      const res = await ctrl.findAll(req());
      expect(service.findAll).toHaveBeenCalledWith('user-1');
      expect(res).toEqual(['a']);
    });

    it('getUnmetGoals and getOverdueGoals delegate', async () => {
      const ctrl = new GoalsController(service);
      service.getUnmetGoals.mockResolvedValue(['u']);
      expect(await ctrl.getUnmetGoals(req())).toEqual(['u']);
      expect(service.getUnmetGoals).toHaveBeenCalledWith('user-1');

      service.getOverdueGoals.mockResolvedValue(['o']);
      expect(await ctrl.getOverdueGoals(req())).toEqual(['o']);
      expect(service.getOverdueGoals).toHaveBeenCalledWith('user-1');
    });

    it('time commitment endpoints parse numbers and wrap total', async () => {
      const ctrl = new GoalsController(service);
      service.getTotalDailyTimeCommitment.mockResolvedValue(42);
      expect(await ctrl.getTotalDailyTimeCommitment(req())).toEqual({
        totalMinutes: 42,
      });

      service.getGoalsByTimeCommitment.mockResolvedValue(['x']);
      const list = await ctrl.getGoalsByTimeCommitment(req(), '5', '15');
      expect(service.getGoalsByTimeCommitment).toHaveBeenCalledWith(
        'user-1',
        5,
        15,
      );
      expect(list).toEqual(['x']);
    });

    it('findOne/update/updateProgress/remove delegate with params', async () => {
      const ctrl = new GoalsController(service);
      service.findOne.mockResolvedValue({ id: 'g' });
      expect(await ctrl.findOne('g', req())).toEqual({ id: 'g' });
      expect(service.findOne).toHaveBeenCalledWith('g', 'user-1');

      service.update.mockResolvedValue({ id: 'g' });
      await ctrl.update('g', req(), { title: 't' } as any);
      expect(service.update).toHaveBeenCalledWith('g', 'user-1', {
        title: 't',
      });

      service.updateProgress.mockResolvedValue({ id: 'g' });
      await ctrl.updateProgress('g', req(), { progress: 50 } as any);
      expect(service.updateProgress).toHaveBeenCalledWith('g', 'user-1', {
        progress: 50,
      });

      service.remove.mockResolvedValue(undefined);
      await ctrl.remove('g', req());
      expect(service.remove).toHaveBeenCalledWith('g', 'user-1');
    });
  });
});
