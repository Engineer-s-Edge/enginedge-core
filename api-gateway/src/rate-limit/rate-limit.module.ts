import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { HttpErrorFilter } from '../common/http-exception.filter';

@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class RateLimitModule {}


