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
      // Suppress KafkaJS internal logging to prevent spam
      logLevel: 0, // 0 = nothing, 1 = error, 2 = warn, 3 = info, 4 = debug
      logCreator: () => {
        // Return a no-op logger to suppress all KafkaJS logs
        return ({ level, log }: { level: any; log: any }) => {
          // No-op: suppress all KafkaJS logs to prevent spam
        };
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
      // Log connection failure but don't throw - allow app to start without Kafka
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection')) {
        this.logger.warn('Kafka consumer not available - will retry periodically');
        // Start periodic reconnection attempts
        this.startReconnectionAttempts();
      } else {
        this.logger.error('Failed to connect Kafka consumer', error);
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
        await this.consumer.connect();
        this.connected = true;
        this.logger.log('Kafka consumer reconnected successfully');
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
}
