import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './infrastructure/health/health.module';
import { AuthModule } from './infrastructure/auth/auth.module';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module';
import { ProxyModule } from './infrastructure/proxy/proxy.module';
import { OrchestrationModule } from './infrastructure/orchestration/orchestration.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { KafkaModule } from './infrastructure/kafka/kafka.module';
import { WorkerRegistryModule } from './infrastructure/worker-registry/worker-registry.module';
import { EnhancedLoggerModule } from './infrastructure/logging/enhanced-logger.module';
import { LoggingInterceptor } from './infrastructure/logging/logging.interceptor';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { RequestContextMiddleware } from './infrastructure/logging/request-context.middleware';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MetricsModule,
    EnhancedLoggerModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    WorkerRegistryModule,
    HealthModule,
    AuthModule,
    RateLimitModule,
    ProxyModule,
    OrchestrationModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

