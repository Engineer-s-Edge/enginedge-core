import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ userId: '123', roles: [] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ userId: '123', roles: ['admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has one of multiple required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'moderator']);
    const context = createMockContext({ userId: '123', roles: ['moderator'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ userId: '123', roles: ['user'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });

  it('should deny access when user has no roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ userId: '123', roles: [] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny access when user is not authenticated', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('User not authenticated');
  });

  it('should deny access when user object exists but roles property is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ userId: '123' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should handle multiple roles correctly', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ 
      userId: '123', 
      roles: ['user', 'admin', 'moderator'] 
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
