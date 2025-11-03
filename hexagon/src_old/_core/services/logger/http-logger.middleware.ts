import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';
import { MyLogger } from './logger.service';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware<Request, Response> {
  constructor(
    private readonly context: RequestContextService,
    private readonly logger: MyLogger,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();
    const existingId = (req.headers['x-request-id'] ||
      req.headers['x-correlation-id']) as string | undefined;
    const requestId = existingId || randomUUID();

    this.context.runWith({ requestId }, () => {
      res.setHeader('x-request-id', requestId);
      const method = req.method;
      const url = req.originalUrl || req.url;
      const ip = req.ip || req.socket.remoteAddress;

      this.logger.info(`→ ${method} ${url}`, {
        context: 'HTTP',
        ip,
        userAgent: req.get('user-agent'),
      });

      res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const statusCode = res.statusCode;
        const level =
          statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        (this.logger as any)[level](
          `← ${method} ${url} ${statusCode} ${durationMs}ms`,
          {
            context: 'HTTP',
            ip,
            contentLength: res.getHeader('content-length'),
          },
        );
      });

      next();
    });
  }
}
