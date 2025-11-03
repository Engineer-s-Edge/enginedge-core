import { TimeManagementController } from './time-management.controller';

describe('TimeManagementController', () => {
  const service = {
    getDailyTimeBreakdown: jest.fn(),
    getAllTimeCommitments: jest.fn(),
    getTimeCommitmentsByRange: jest.fn(),
    validateDailyTimeLimit: jest.fn(),
  } as any;
  const req = (userId = 'user-1') => ({ user: { userId } });

  beforeEach(() => jest.clearAllMocks());

  it('delegates to service methods and parses numbers', async () => {
    const ctrl = new TimeManagementController(service);
    service.getDailyTimeBreakdown.mockResolvedValue({ total: 5 });
    expect(await ctrl.getDailyTimeBreakdown(req())).toEqual({ total: 5 });
    expect(service.getDailyTimeBreakdown).toHaveBeenCalledWith('user-1');

    service.getAllTimeCommitments.mockResolvedValue(['a']);
    expect(await ctrl.getAllTimeCommitments(req())).toEqual(['a']);
    expect(service.getAllTimeCommitments).toHaveBeenCalledWith('user-1');

    service.getTimeCommitmentsByRange.mockResolvedValue(['r']);
    expect(await ctrl.getTimeCommitmentsByRange(req(), '10', '20')).toEqual([
      'r',
    ]);
    expect(service.getTimeCommitmentsByRange).toHaveBeenCalledWith(
      'user-1',
      10,
      20,
    );

    service.validateDailyTimeLimit.mockResolvedValue({ isValid: true });
    expect(await ctrl.validateDailyTimeLimit(req(), '90')).toEqual({
      isValid: true,
    });
    expect(service.validateDailyTimeLimit).toHaveBeenCalledWith('user-1', 90);
  });
});
