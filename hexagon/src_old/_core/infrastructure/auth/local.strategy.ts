import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../features/auth/auth.service';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private readonly logger: MyLogger,
  ) {
    super();
    this.logger.info('LocalStrategy initialized', LocalStrategy.name);
  }

  async validate(username: string, password: string): Promise<any> {
    this.logger.info(
      `Validating local credentials for user: ${username}`,
      LocalStrategy.name,
    );

    try {
      const user = await this.authService.validateUser(username, password);
      if (!user) {
        this.logger.warn(
          `Local authentication failed for user: ${username}`,
          LocalStrategy.name,
        );
        throw new UnauthorizedException();
      }

      this.logger.info(
        `Local authentication successful for user: ${username}`,
        LocalStrategy.name,
      );
      return user;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Local authentication error for user: ${username}\n${info.stack || ''}`,
        LocalStrategy.name,
      );
      throw error;
    }
  }
}
