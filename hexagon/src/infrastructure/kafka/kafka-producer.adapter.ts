import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { IKafkaProducer } from '@application/ports/kafka-producer.port';
import { RequestContextService } from '../logging/shared/request-context.service';

@Injectable()
export class KafkaProducerAdapter
  implements IKafkaProducer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaProducerAdapter.name);
  private kafka: Kafka;
  private producer: Producer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext?: RequestContextService,
  ) {
    const brokers = (
      this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092'
    ).split(',');
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'enginedge-hexagon',
    );

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
      // Suppress KafkaJS internal logging to prevent spam
      logLevel: 0, // 0 = nothing, 1 = error, 2 = warn, 3 = info, 4 = debug
      logCreator: () => {
        // Return a no-op logger to suppress all KafkaJS logs
        return ({ level, log }: { level: any; log: any }) => {
          // No-op: suppress all KafkaJS logs to prevent spam
        };
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (error) {
      // Log connection failure but don't throw - allow app to start without Kafka
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection')) {
        this.logger.warn('Kafka producer not available - will retry periodically');
        // Start periodic reconnection attempts
        this.startReconnectionAttempts();
      } else {
        this.logger.error('Failed to connect Kafka producer', error);
      }
      // Don't throw - allow application to start without Kafka
    }
  }

  private reconnectionInterval: NodeJS.Timeout | null = null;

  private startReconnectionAttempts() {
    if (this.reconnectionInterval) {
      return;
    }

    this.reconnectionInterval = setInterval(async () => {
      if (this.connected) {
        if (this.reconnectionInterval) {
          clearInterval(this.reconnectionInterval);
          this.reconnectionInterval = null;
        }
        return;
      }

      try {
        await this.producer.connect();
        this.connected = true;
        this.logger.log('Kafka producer reconnected successfully');
        if (this.reconnectionInterval) {
          clearInterval(this.reconnectionInterval);
          this.reconnectionInterval = null;
        }
      } catch (error) {
        // Silently retry - connection failed, will try again
      }
    }, 10000); // Check every 10 seconds
  }

  async onModuleDestroy() {
    if (this.reconnectionInterval) {
      clearInterval(this.reconnectionInterval);
      this.reconnectionInterval = null;
    }
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.log('Kafka producer disconnected');
    }
  }

  async publish(topic: string, message: any): Promise<void> {
    if (!this.connected) {
      // Don't throw - just log warning if Kafka is not available
      this.logger.warn(`Kafka producer not connected - message to ${topic} not sent`);
      return;
    }

    try {
      const ctx = this.requestContext?.getStore() || {};
      await this.producer.send({
        topic,
        messages: [
          {
            value: JSON.stringify(message),
            timestamp: Date.now().toString(),
            headers: {
              'x-request-id': (ctx.requestId as any) || '',
              'x-correlation-id': (ctx.correlationId as any) || '',
              'x-user-id': (ctx.userId as any) || '',
              'x-service-name':
                (ctx.serviceName as any) ||
                process.env.SERVICE_NAME ||
                'hexagon',
            },
          },
        ],
      });
      this.logger.debug(`Published message to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}`, error);
      throw error;
    }
  }
}
