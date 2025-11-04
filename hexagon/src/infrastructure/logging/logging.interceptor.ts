import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Inject } from '@nestjs/common';
import { Logger } from 'winston';
import { HexagonLogger } from './logger.module';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private hexagonLogger: HexagonLogger;

  constructor(@Inject('LOGGER') private readonly logger: Logger) {
    this.hexagonLogger = new HexagonLogger(this.logger);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params, headers } = request;
    const correlationId = headers['x-correlation-id'] || headers['x-request-id'] || undefined;
    const userId = request.user?.sub || request.user?.userId || undefined;

    this.hexagonLogger.setContext({
      correlationId,
      userId,
      method,
      url,
    });

    const startTime = Date.now();

    this.hexagonLogger.debug('Request received', {
      method,
      url,
      body: this.sanitizeBody(body),
      query,
      params,
    });

    return next.handle().pipe(
      tap((response) => {
        const duration = Date.now() - startTime;
        this.hexagonLogger.log('Request completed', {
          method,
          url,
          statusCode: context.switchToHttp().getResponse().statusCode,
          duration,
        });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.hexagonLogger.error('Request failed', error, {
          method,
          url,
          statusCode: error.status || 500,
          duration,
        });
        return throwError(() => error);
      })
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    const sanitized = { ...body };
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }
}

