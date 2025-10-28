import { AuthMiddleware } from './auth.middleware';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MyLogger } from '../services/logger/logger.service';

describe('AuthMiddleware', () => {
  const jwt = {
    verify: jest.fn(() => ({ sub: 'u1', username: 'u1' })),
  } as any as JwtService;
  const config = {
    get: jest.fn((k: string) => (k === 'JWT_SECRET' ? 's' : undefined)),
  } as any as ConfigService;
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
  const mw = new AuthMiddleware(jwt, config, logger as any);

  it('passes with valid bearer token', () => {
    const req: any = { headers: { authorization: 'Bearer token' } };
    const res: any = {};
    const next = jest.fn();
    mw.use(req, res, next);
    expect(jwt.verify).toHaveBeenCalledWith('token', { secret: 's' });
    expect(req.user).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('throws when missing authorization header', () => {
    const req: any = { headers: {} };
    expect(() => mw.use(req, {} as any, jest.fn())).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when secret missing', () => {
    const mw2 = new AuthMiddleware(
      jwt,
      { get: () => undefined } as any,
      logger as any,
    );
    const req: any = { headers: { authorization: 'Bearer token' } };
    expect(() => mw2.use(req, {} as any, jest.fn())).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when token verify fails', () => {
    const badJwt = {
      verify: jest.fn(() => {
        throw new Error('bad');
      }),
    } as any;
    const mw3 = new AuthMiddleware(badJwt, config, logger as any);
    const req: any = { headers: { authorization: 'Bearer token' } };
    expect(() => mw3.use(req, {} as any, jest.fn())).toThrow(
      UnauthorizedException,
    );
  });
});
