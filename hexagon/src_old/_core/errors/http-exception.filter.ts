import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MyLogger } from '../services/logger/logger.service';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: MyLogger) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let error: string | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObject = exceptionResponse as {
        message: string | string[];
        error?: string;
      };
      if (Array.isArray(responseObject.message)) {
        message = responseObject.message.join(', ');
      } else {
        message = responseObject.message;
      }
      error = responseObject.error;
    } else {
      message = 'Internal server error';
    }

    // Log expected HTTP exceptions: 4xx as warnings, 5xx as errors
    const logMessage = `[${request.method}] ${request.url}`;
    const context = {
      status,
      path: request.url,
      method: request.method,
      message,
      error,
    };
    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception.stack ?? 'No stack trace',
        HttpExceptionFilter.name,
      );
    } else if (status >= 400) {
      this.logger.warn(logMessage, HttpExceptionFilter.name);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
      error: error,
    });
  }
}
