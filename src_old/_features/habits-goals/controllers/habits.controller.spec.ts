import { HabitsApiController, HabitsController } from './habits.controller';

describe('Habits Controllers', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    getUnmetHabits: jest.fn(),
    getTotalDailyTimeCommitment: jest.fn(),
    getHabitsByTimeCommitment: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    toggleEntry: jest.fn(),
    remove: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  describe('HabitsApiController (no auth)', () => {
    it('requires x-user-id and delegates', async () => {
      const api = new HabitsApiController(service);
      await expect(api.create(undefined as any, {} as any)).rejects.toThrow(
        'X-User-ID header is required',
      );
      service.create.mockResolvedValue({ id: 'h1' });
      const r = await api.create('user-1', { title: 't' } as any);
      expect(service.create).toHaveBeenCalledWith('user-1', { title: 't' });
      expect(r).toEqual({ id: 'h1' });

      await expect(api.findAll(undefined as any)).rejects.toThrow();
      service.findAll.mockResolvedValue(['a']);
      expect(await api.findAll('user-1')).toEqual(['a']);

      await expect(api.getUnmetHabits(undefined as any)).rejects.toThrow();
      service.getUnmetHabits.mockResolvedValue(['u']);
      expect(await api.getUnmetHabits('user-1')).toEqual(['u']);
    });
  });

  describe('HabitsController (auth)', () => {
    const req = (userId = 'user-1') => ({ user: { userId } });
    it('create/findAll/unmet delegate', async () => {
      const ctrl = new HabitsController(service);
      service.create.mockResolvedValue({ id: 'h' });
      expect(await ctrl.create(req(), { title: 't' } as any)).toEqual({
        id: 'h',
      });
      expect(service.create).toHaveBeenCalledWith('user-1', { title: 't' });

      service.findAll.mockResolvedValue(['x']);
      expect(await ctrl.findAll(req())).toEqual(['x']);
      expect(service.findAll).toHaveBeenCalledWith('user-1');

      service.getUnmetHabits.mockResolvedValue(['u']);
      expect(await ctrl.getUnmetHabits(req())).toEqual(['u']);
    });

    it('time commitment endpoints parse min/max and wrap total', async () => {
      const ctrl = new HabitsController(service);
      service.getTotalDailyTimeCommitment.mockResolvedValue(33);
      expect(await ctrl.getTotalDailyTimeCommitment(req())).toEqual({
        totalMinutes: 33,
      });

      service.getHabitsByTimeCommitment.mockResolvedValue(['h']);
      expect(await ctrl.getHabitsByTimeCommitment(req(), '5', '20')).toEqual([
        'h',
      ]);
      expect(service.getHabitsByTimeCommitment).toHaveBeenCalledWith(
        'user-1',
        5,
        20,
      );
    });

    it('findOne/update/toggleEntry/remove delegate correctly', async () => {
      const ctrl = new HabitsController(service);
      service.findOne.mockResolvedValue({ id: 'h1' });
      expect(await ctrl.findOne('h1', req())).toEqual({ id: 'h1' });
      expect(service.findOne).toHaveBeenCalledWith('h1', 'user-1');

      service.update.mockResolvedValue({ id: 'h1' });
      await ctrl.update('h1', req(), { title: 't' } as any);
      expect(service.update).toHaveBeenCalledWith('h1', 'user-1', {
        title: 't',
      });

      service.toggleEntry.mockResolvedValue({ id: 'h1' });
      await ctrl.toggleEntry('h1', req(), {
        date: new Date().toISOString(),
      } as any);
      expect(service.toggleEntry).toHaveBeenCalled();

      service.remove.mockResolvedValue(undefined);
      await ctrl.remove('h1', req());
      expect(service.remove).toHaveBeenCalledWith('h1', 'user-1');
    });
  });
});
