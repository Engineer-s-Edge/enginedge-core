/**
 * Enhanced Logger Module
 *
 * Provides Winston logger with Kafka log consumption for centralized logging.
 * 
 * This module composes the base LoggerModule to provide the 'LOGGER' token
 * and additional enhanced logging capabilities.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '../kafka/kafka.module';
import { LoggerModule } from './logger.module';
import { WinstonLoggerAdapter } from './shared/winston-logger.adapter';
import { RequestContextService } from './shared/request-context.service';
import { KafkaLogConsumerService } from './kafka-log-consumer.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    KafkaModule,
    LoggerModule, // Import base logger module to provide 'LOGGER' token
  ],
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
    LoggerModule, // Re-export LoggerModule to make 'LOGGER' available
    KafkaModule, // Re-export KafkaModule to make 'IKafkaConsumer' available for KafkaLogConsumerService
    'ILoggerPort',
    WinstonLoggerAdapter,
    RequestContextService,
    KafkaLogConsumerService,
  ],
})
export class EnhancedLoggerModule {}
