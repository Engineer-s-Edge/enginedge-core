import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RequestContextService } from './request-context.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: FastifyRequest, _res: FastifyReply, next: () => void) {
    const reqId = (req.headers['x-request-id'] as string) || randomUUID();
    const corrId = (req.headers['x-correlation-id'] as string) || reqId;
    const userId = (req.headers['x-user-id'] as string) || undefined;
    const serviceName = process.env.SERVICE_NAME || 'api-gateway';

    this.requestContext.runWith(
      { requestId: reqId, correlationId: corrId, userId, serviceName },
      () => next(),
    );
  }
}
