import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestContextMiddleware } from './infrastructure/logging/request-context.middleware';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfrastructureModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
