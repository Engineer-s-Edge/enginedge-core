import { LocalStrategy } from './local.strategy';
import { AuthService } from '../../../features/auth/auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: Partial<AuthService>;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    authService = {
      validateUser: jest.fn(),
    } as any;
    strategy = new LocalStrategy(authService as AuthService, logger as any);
  });

  it('returns user on successful validation', async () => {
    const user = { id: 'u1', username: 'alice', role: 'user' };
    (authService.validateUser as jest.Mock).mockResolvedValue(user);

    await expect(strategy.validate('alice', 'pw')).resolves.toEqual(user);
    expect(authService.validateUser).toHaveBeenCalledWith('alice', 'pw');
    expect(logger.info).toHaveBeenCalled();
  });

  it('throws UnauthorizedException when validateUser returns null', async () => {
    (authService.validateUser as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate('bob', 'bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rethrows errors from AuthService and logs error', async () => {
    const err = new Error('boom');
    (authService.validateUser as jest.Mock).mockRejectedValue(err);

    await expect(strategy.validate('carl', 'pw')).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });
});
