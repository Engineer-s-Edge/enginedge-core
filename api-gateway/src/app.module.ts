import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaLoggerService } from './infrastructure/logging/kafka-logger.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ProxyService } from './proxy/proxy.service';
import { AssistantProxyController } from './proxy/assistant.controller';
import { SchedulingProxyController, CalendarProxyController } from './proxy/scheduling.controller';
import { ResumeProxyController } from './proxy/resume.controller';
import { InterviewProxyController } from './proxy/interview.controller';
import { DataProxyController } from './proxy/data.controller';
import { LatexProxyController } from './proxy/latex.controller';
import { ToolsProxyController } from './proxy/tools.controller';
import { DatalakeProxyController } from './proxy/datalake.controller';
import { RolesGuard } from './auth/roles.guard';
import { RequestContextService } from './infrastructure/logging/request-context.service';
import { RequestContextMiddleware } from './infrastructure/logging/request-context.middleware';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, AuthModule, RateLimitModule],
  controllers: [
    AssistantProxyController,
    SchedulingProxyController,
    CalendarProxyController,
    ResumeProxyController,
    InterviewProxyController,
    DataProxyController,
    LatexProxyController,
    ToolsProxyController,
    DatalakeProxyController,
  ],
  providers: [ProxyService, RolesGuard, KafkaLoggerService, RequestContextService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
