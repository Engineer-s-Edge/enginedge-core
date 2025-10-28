import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('Auth Guards', () => {
  describe('RolesGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let logger: MyLogger;
    let guard: RolesGuard;

    const mockContext = (user?: any): ExecutionContext => {
      return {
        switchToHttp: () => ({ getRequest: () => ({ user }) }) as any,
        getHandler: () => ({}) as any,
        getClass: () => ({}) as any,
        // ...unused methods
      } as unknown as ExecutionContext;
    };

    beforeEach(() => {
      reflector = { getAllAndOverride: jest.fn() } as any;
      logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
      guard = new RolesGuard(reflector as any, logger);
    });

    it('allows when no roles metadata', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const can = guard.canActivate(mockContext({ role: 'user' }));
      expect(can).toBe(true);
    });

    it('allows when user has required role', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin', 'user']);
      const can = guard.canActivate(
        mockContext({ username: 'a', role: 'user' }),
      );
      expect(can).toBe(true);
    });

    it('denies when user lacks required role', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin']);
      const can = guard.canActivate(
        mockContext({ username: 'a', role: 'user' }),
      );
      expect(can).toBe(false);
    });

    it('returns false on thrown errors', () => {
      reflector.getAllAndOverride.mockImplementation(() => {
        throw new Error('boom');
      });
      const can = guard.canActivate(mockContext({ role: 'user' }));
      expect(can).toBe(false);
    });
  });

  describe('Passport guards', () => {
    it('JwtAuthGuard should extend AuthGuard("jwt") behavior (instantiation smoke test)', () => {
      const guard = new JwtAuthGuard();
      expect(guard).toBeInstanceOf(JwtAuthGuard);
    });

    it('LocalAuthGuard should extend AuthGuard("local") behavior (instantiation smoke test)', () => {
      const guard = new LocalAuthGuard();
      expect(guard).toBeInstanceOf(LocalAuthGuard);
    });
  });
});
