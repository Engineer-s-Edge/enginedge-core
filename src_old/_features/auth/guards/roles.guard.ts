import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../core/infrastructure/auth/roles.decorator';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('RolesGuard initialized', RolesGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    this.logger.info('Checking role-based access control', RolesGuard.name);
    try {
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (!requiredRoles) {
        this.logger.info('No roles required, access granted', RolesGuard.name);
        return true;
      }

      const { user } = context.switchToHttp().getRequest();
      const hasRequiredRole = requiredRoles.some((role) => user.role === role);

      if (hasRequiredRole) {
        this.logger.info(
          `Access granted for user: ${user.username} with role: ${user.role}`,
          RolesGuard.name,
        );
      } else {
        this.logger.warn(
          `Access denied for user: ${user.username} with role: ${user.role}, required roles: ${requiredRoles.join(', ')}`,
          RolesGuard.name,
        );
      }

      return hasRequiredRole;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error in role-based access control check',
        e.stack,
        RolesGuard.name,
      );
      return false;
    }
  }
}
