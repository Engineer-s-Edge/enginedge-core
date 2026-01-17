import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from './shared/request-context.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const reqId = (req.headers['x-request-id'] as string) || randomUUID();
    const corrId = (req.headers['x-correlation-id'] as string) || reqId;
    const userId = (req.headers['x-user-id'] as string) || undefined;
    const serviceName = process.env.SERVICE_NAME || 'hexagon';

    this.requestContext.runWith(
      { requestId: reqId, correlationId: corrId, userId, serviceName },
      () => next(),
    );
  }
}
