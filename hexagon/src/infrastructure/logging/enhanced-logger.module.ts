/**
 * Enhanced Logger Module
 *
 * Provides Winston logger with Kafka log consumption for centralized logging.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '../kafka/kafka.module';
import { WinstonLoggerAdapter } from './shared/winston-logger.adapter';
import { RequestContextService } from './shared/request-context.service';
import { KafkaLogConsumerService } from './kafka-log-consumer.service';
import { ILoggerPort } from './shared/logger.port';

@Global()
@Module({
  imports: [ConfigModule, KafkaModule],
  providers: [
    RequestContextService,
    {
      provide: 'ILoggerPort',
      useClass: WinstonLoggerAdapter,
    },
    WinstonLoggerAdapter,
    KafkaLogConsumerService,
  ],
  exports: [
    'ILoggerPort',
    WinstonLoggerAdapter,
    RequestContextService,
    KafkaLogConsumerService,
  ],
})
export class EnhancedLoggerModule {}
