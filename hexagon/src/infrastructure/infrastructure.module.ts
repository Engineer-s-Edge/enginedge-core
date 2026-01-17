import { Global, Module } from '@nestjs/common';
import { MetricsModule } from './metrics/metrics.module';
import { EnhancedLoggerModule } from './logging/enhanced-logger.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { WorkerRegistryModule } from './worker-registry/worker-registry.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ProxyModule } from './proxy/proxy.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { WsProxyModule } from './ws/ws-proxy.module';

@Global()
@Module({
  imports: [
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
    WsProxyModule,
  ],
  exports: [
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
    WsProxyModule,
  ],
})
export class InfrastructureModule {}
