import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { IKafkaProducer } from '@application/ports/kafka-producer.port';
import { RequestContextService } from '../logging/shared/request-context.service';

@Injectable()
export class KafkaProducerAdapter implements IKafkaProducer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerAdapter.name);
  private kafka: Kafka;
  private producer: Producer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext?: RequestContextService,
  ) {
    const brokers = (this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092').split(',');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'enginedge-hexagon');

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
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
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.log('Kafka producer disconnected');
    }
  }

  async publish(topic: string, message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Kafka producer not connected');
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
              'x-service-name': (ctx.serviceName as any) || (process.env.SERVICE_NAME || 'hexagon'),
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

