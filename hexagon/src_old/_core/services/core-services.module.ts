import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { MyLogger } from './logger/logger.service';
import { HttpExceptionFilter } from '../errors/http-exception.filter';
import { AllExceptionsFilter } from '../errors/all-exceptions.filter';
import { RequestContextService } from './logger/request-context.service';
import { HttpLoggerMiddleware } from './logger/http-logger.middleware';

@Module({
  providers: [
    MyLogger,
    HttpExceptionFilter,
    AllExceptionsFilter,
    RequestContextService,
  ],
  exports: [
    MyLogger,
    HttpExceptionFilter,
    AllExceptionsFilter,
    RequestContextService,
  ],
})
export class CoreServicesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
