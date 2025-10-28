import { Injectable } from '@nestjs/common';
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '@core/services/logger/logger.service';

const PassportJwtStrategy: new (...args: any[]) => AbstractStrategy & Strategy =
  PassportStrategy(Strategy);

@Injectable()
export class JwtStrategy extends PassportJwtStrategy {
  constructor(
    private configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set in the environment variables.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });

    this.logger.info(
      'JwtStrategy initialized with JWT configuration',
      JwtStrategy.name,
    );
  }

  async validate(payload: any) {
    this.logger.info(
      `Validating JWT payload for user: ${payload.username || payload.sub}`,
      JwtStrategy.name,
    );

    const user = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    this.logger.info(
      `JWT validation successful for user: ${user.username} (role: ${user.role})`,
      JwtStrategy.name,
    );
    return user;
  }
}
