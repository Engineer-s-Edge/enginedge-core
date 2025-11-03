import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KafkaConfig,
  ConsumerConfig,
  ProducerConfig,
  Partitioners,
  logLevel,
} from 'kafkajs';
import { MyLogger } from '../../services/logger/logger.service';

export interface KafkaModuleOptions {
  clientId: string;
  brokers: string[];
  groupId: string;
  retry?: {
    initialRetryTime?: number;
    retries?: number;
  };
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

@Injectable()
export class KafkaConfigService {
  constructor(
    private configService: ConfigService,
    private readonly logger: MyLogger,
  ) {}

  /**
   * Creates a custom log creator that integrates kafkajs logs with Winston
   * This ensures kafkajs logs are written to files instead of console
   */
  private createKafkaLogCreator() {
    return () => {
      return ({ level, log }: { level: logLevel; log: any }) => {
        const { timestamp, logger, message, ...extra } = log;

        // Map kafkajs log levels to Winston levels
        const winstonLevel = this.mapKafkaLogLevel(level);

        // Log to Winston (which will write to files)
        this.logger.log(message || 'Kafka operation', 'KafkaJS');
      };
    };
  }

  /**
   * Maps kafkajs log levels to Winston log levels
   */
  private mapKafkaLogLevel(level: logLevel): string {
    switch (level) {
      case logLevel.ERROR:
        return 'error';
      case logLevel.WARN:
        return 'warn';
      case logLevel.INFO:
        return 'info';
      case logLevel.DEBUG:
        return 'debug';
      default:
        return 'info';
    }
  }

  createKafkaOptions(): KafkaModuleOptions {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', 'localhost:9092')
      .split(',');
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'enginedge-main-node',
    );
    const groupId = this.configService.get<string>(
      'KAFKA_GROUP_ID',
      'enginedge-calendar-ml',
    );

    // SSL/SASL configuration for production
    const ssl =
      this.configService.get<string>('KAFKA_SSL_ENABLED', 'false') === 'true';
    const saslMechanism = this.configService.get<string>(
      'KAFKA_SASL_MECHANISM',
    );
    const saslUsername = this.configService.get<string>('KAFKA_SASL_USERNAME');
    const saslPassword = this.configService.get<string>('KAFKA_SASL_PASSWORD');

    const options: KafkaModuleOptions = {
      clientId,
      brokers,
      groupId,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    };

    if (ssl) {
      options.ssl = true;
    }

    if (saslMechanism && saslUsername && saslPassword) {
      options.sasl = {
        mechanism: saslMechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
        username: saslUsername,
        password: saslPassword,
      };
    }

    this.logger.info(
      `Kafka configuration: ${JSON.stringify({
        clientId,
        brokers,
        groupId,
        ssl,
        sasl: !!options.sasl,
      })}`,
      KafkaConfigService.name,
    );

    return options;
  }

  getKafkaConfig(): KafkaConfig {
    const options = this.createKafkaOptions();

    // Get log level from environment or default to INFO
    const kafkaLogLevel = this.configService.get<string>(
      'KAFKA_LOG_LEVEL',
      'INFO',
    );
    const logLevelValue = this.getKafkaLogLevel(kafkaLogLevel);

    const config: KafkaConfig = {
      clientId: options.clientId,
      brokers: options.brokers,
      retry: options.retry,
      // Configure kafkajs to use our Winston logger
      logLevel: logLevelValue,
      logCreator: this.createKafkaLogCreator(),
    };

    if (options.ssl) {
      config.ssl = true;
    }

    if (options.sasl) {
      // Type-safe SASL configuration
      if (options.sasl.mechanism === 'plain') {
        config.sasl = {
          mechanism: 'plain',
          username: options.sasl.username,
          password: options.sasl.password,
        };
      } else if (options.sasl.mechanism === 'scram-sha-256') {
        config.sasl = {
          mechanism: 'scram-sha-256',
          username: options.sasl.username,
          password: options.sasl.password,
        };
      } else if (options.sasl.mechanism === 'scram-sha-512') {
        config.sasl = {
          mechanism: 'scram-sha-512',
          username: options.sasl.username,
          password: options.sasl.password,
        };
      }
    }

    this.logger.info(
      `Kafka config with Winston logging enabled (level: ${kafkaLogLevel})`,
      KafkaConfigService.name,
    );

    return config;
  }

  /**
   * Maps string log level to kafkajs logLevel enum
   */
  private getKafkaLogLevel(level: string): logLevel {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return logLevel.ERROR;
      case 'WARN':
        return logLevel.WARN;
      case 'INFO':
        return logLevel.INFO;
      case 'DEBUG':
        return logLevel.DEBUG;
      case 'NOTHING':
        return logLevel.NOTHING;
      default:
        return logLevel.INFO;
    }
  }

  getProducerConfig(): ProducerConfig {
    return {
      maxInFlightRequests: 1,
      idempotent: true,
      retry: {
        retries: 5,
        initialRetryTime: 100,
      },
      // Use legacy partitioner to maintain compatibility and silence v2.0.0 warning
      createPartitioner: Partitioners.LegacyPartitioner,
    };
  }

  getConsumerConfig(groupId?: string): ConsumerConfig {
    const options = this.createKafkaOptions();

    return {
      groupId: groupId || options.groupId,
      sessionTimeout: 25000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576,
      allowAutoTopicCreation: true,
      retry: {
        retries: 5,
        initialRetryTime: 100,
      },
    };
  }
}
