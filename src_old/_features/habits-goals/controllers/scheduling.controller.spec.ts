import { SchedulingController } from './scheduling.controller';

describe('SchedulingController', () => {
  const service = {
    getUnmetItemsForScheduling: jest.fn(),
    previewSchedule: jest.fn(),
    scheduleItemsForToday: jest.fn(),
  } as any;
  const req = (userId = 'user-1') => ({ user: { userId } });

  beforeEach(() => jest.clearAllMocks());

  it('getUnmetItems delegates to service', async () => {
    const ctrl = new SchedulingController(service);
    service.getUnmetItemsForScheduling.mockResolvedValue(['a']);
    expect(await ctrl.getUnmetItems(req())).toEqual(['a']);
    expect(service.getUnmetItemsForScheduling).toHaveBeenCalledWith('user-1');
  });

  it('previewSchedule maps busySlots to Date and delegates', async () => {
    const ctrl = new SchedulingController(service);
    const payload = {
      busySlots: [
        { start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' },
      ],
      workingHours: { start: '09:00', end: '17:00' },
    } as any;

    service.previewSchedule.mockResolvedValue({ ok: true });
    const res = await ctrl.previewSchedule(req(), payload);
    expect(service.previewSchedule).toHaveBeenCalled();
    const args = service.previewSchedule.mock.calls[0];
    expect(args[0]).toBe('user-1');
    expect(args[1][0].start).toBeInstanceOf(Date);
    expect(args[1][0].end).toBeInstanceOf(Date);
    expect(args[2]).toEqual(payload.workingHours);
    expect(res).toEqual({ ok: true });
  });

  it('scheduleForToday maps busySlots to Date and delegates', async () => {
    const ctrl = new SchedulingController(service);
    const payload = {
      busySlots: [
        { start: '2025-01-02T10:00:00Z', end: '2025-01-02T11:00:00Z' },
      ],
      workingHours: { start: '09:00', end: '17:00' },
    } as any;

    service.scheduleItemsForToday.mockResolvedValue({ ok: true });
    const res = await ctrl.scheduleForToday(req(), payload);
    expect(service.scheduleItemsForToday).toHaveBeenCalled();
    const args = service.scheduleItemsForToday.mock.calls[0];
    expect(args[0]).toBe('user-1');
    expect(args[1][0].start).toBeInstanceOf(Date);
    expect(args[1][0].end).toBeInstanceOf(Date);
    expect(args[2]).toEqual(payload.workingHours);
    expect(res).toEqual({ ok: true });
  });
});
