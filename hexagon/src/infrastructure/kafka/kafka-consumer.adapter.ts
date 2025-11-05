import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { IKafkaConsumer } from '@application/ports/kafka-consumer.port';

@Injectable()
export class KafkaConsumerAdapter
  implements IKafkaConsumer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaConsumerAdapter.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private connected = false;
  private subscriptions = new Map<string, (message: any) => Promise<void>>();
  private consumerRunning = false;

  constructor(private readonly configService: ConfigService) {
    const brokers = (
      this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092'
    ).split(',');
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'enginedge-hexagon',
    );
    const groupId = this.configService.get<string>(
      'KAFKA_GROUP_ID',
      'hexagon-orchestrator',
    );

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();
      this.connected = true;
      this.logger.log('Kafka consumer connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka consumer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.consumer.disconnect();
      this.connected = false;
      this.logger.log('Kafka consumer disconnected');
    }
  }

  async subscribe(
    topic: string,
    handler: (message: any) => Promise<void>,
  ): Promise<void> {
    if (this.subscriptions.has(topic)) {
      this.logger.warn(`Already subscribed to topic: ${topic}`);
      return;
    }

    try {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.subscriptions.set(topic, handler);

      // Start consumer if not already running
      if (!this.consumerRunning) {
        this.consumerRunning = true;
        await this.consumer.run({
          eachMessage: async (payload: EachMessagePayload) => {
            const handler = this.subscriptions.get(payload.topic);
            if (handler && payload.message.value) {
              try {
                const message = JSON.parse(payload.message.value.toString());
                await handler(message);
              } catch (error) {
                this.logger.error(
                  `Error processing message from topic ${payload.topic}`,
                  error,
                );
              }
            }
          },
        });
      }

      this.logger.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic ${topic}`, error);
      throw error;
    }
  }

  private consumerRunning = false;
}
