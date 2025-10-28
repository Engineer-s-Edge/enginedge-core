import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../services/logger/logger.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('AuthMiddleware initialized', AuthMiddleware.name);
  }

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.info(
      `Authenticating request: ${req.method} ${req.url}`,
      AuthMiddleware.name,
    );
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Missing or invalid authorization token for ${req.method} ${req.url}`,
        AuthMiddleware.name,
      );
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authHeader.split(' ')[1];

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.error(
          'JWT_SECRET is not configured.',
          '',
          AuthMiddleware.name,
        );
        throw new UnauthorizedException('Internal server configuration error.');
      }
      const decoded = this.jwtService.verify(token, { secret });
      req['user'] = decoded;
      this.logger.info(
        `Authentication successful for user: ${decoded.username || decoded.sub}`,
        AuthMiddleware.name,
      );
      next();
    } catch (error) {
      this.logger.warn(
        `Invalid token for ${req.method} ${req.url}`,
        AuthMiddleware.name,
      );
      throw new UnauthorizedException('Invalid token');
    }
  }
}
