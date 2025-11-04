import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse();
    const request = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? (exception as HttpException).getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttp ? (exception as HttpException).message : 'Internal Server Error';

    const payload = {
      statusCode: status,
      error: HttpStatus[status] || 'Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId: request.headers['x-correlation-id'] || undefined,
    };

    reply.status(status).send(payload);
  }
}

