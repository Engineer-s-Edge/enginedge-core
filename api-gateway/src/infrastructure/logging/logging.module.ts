import { Global, Module } from '@nestjs/common';
import { KafkaLoggerService } from './kafka-logger.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  providers: [KafkaLoggerService, RequestContextService],
  exports: [KafkaLoggerService, RequestContextService],
})
export class LoggingModule {}
