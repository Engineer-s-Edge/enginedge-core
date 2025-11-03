import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrchestrationModule } from './infrastructure/orchestration.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    OrchestrationModule,
    HealthModule,
  ],
})
export class AppModule {}
