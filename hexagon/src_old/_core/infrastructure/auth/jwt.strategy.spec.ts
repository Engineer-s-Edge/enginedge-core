import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { MyLogger } from '@core/services/logger/logger.service';

class MockLogger implements Partial<MyLogger> {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let config: Partial<ConfigService>;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
  });

  it('constructs with JWT secret and maps payload in validate()', async () => {
    config = { get: jest.fn().mockReturnValue('testsecret') } as any;

    strategy = new JwtStrategy(config as ConfigService, logger as any);

    const payload = { sub: '123', username: 'alice', role: 'admin' };
    const user = await strategy.validate(payload);

    expect(user).toEqual({ userId: '123', username: 'alice', role: 'admin' });
    expect(logger.info).toHaveBeenCalled();
  });

  it('throws if JWT_SECRET is missing', () => {
    config = { get: jest.fn().mockReturnValue(undefined) } as any;

    expect(
      () => new JwtStrategy(config as ConfigService, logger as any),
    ).toThrow('JWT_SECRET is not set in the environment variables.');
  });
});
