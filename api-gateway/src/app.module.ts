import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [HealthModule, AuthModule, RateLimitModule],
})
export class AppModule {}


