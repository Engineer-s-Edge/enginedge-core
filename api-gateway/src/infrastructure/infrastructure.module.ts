import { Global, Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { ProxyModule } from '../proxy/proxy.module';
import { MetricsModule } from './metrics/metrics.module';
import { LoggingModule } from './logging/logging.module';
import { WsProxyModule } from '../ws/ws-proxy.module';

@Global()
@Module({
  imports: [
    MetricsModule,
    LoggingModule,
    HealthModule,
    AuthModule,
    RateLimitModule,
    ProxyModule,
    WsProxyModule,
  ],
  exports: [
    MetricsModule,
    LoggingModule,
    HealthModule,
    AuthModule,
    RateLimitModule,
    ProxyModule,
    WsProxyModule,
  ],
})
export class InfrastructureModule {}
