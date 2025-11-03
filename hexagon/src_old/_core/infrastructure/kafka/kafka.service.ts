import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaConfigService } from './kafka-config.service';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { MyLogger } from '../../services/logger/logger.service';
import { MLPipelineTriggerHandler } from './handlers/ml-pipeline-trigger.handler';

// Calendar event types for Kafka messages
export interface CalendarEvent {
  eventId: string;
  userId: string;
  eventType:
    | 'event_created'
    | 'event_updated'
    | 'event_deleted'
    | 'event_viewed'
    | 'schedule_triggered'
    | 'habits_scheduled'
    | 'goals_scheduled';
  eventData: {
    title?: string;
    startTime?: string; // ISO string
    endTime?: string; // ISO string
    duration?: number;
    category?: string;
    priority?: 'low' | 'medium' | 'high';
    isRecurring?: boolean;
    source?: 'manual' | 'automatic' | 'suggestion';
  };
  userContext?: {
    timeOfDay?: number;
    dayOfWeek?: number;
    seasonality?: 'morning' | 'afternoon' | 'evening' | 'night';
    workingHours?: { start: string; end: string };
    busySlots?: number;
    freeTime?: number;
  };
  sessionData?: {
    sessionId: string;
    actionSequence: number;
    totalActionsInSession: number;
    timeSpentOnPage: number;
  };
  timestamp: string;
  metadata?: {
    version: string;
    source: string;
    correlationId?: string;
  };
}

export interface MLTriggerEvent {
  userId: string;
  triggerType:
    | 'retrain_model'
    | 'update_predictions'
    | 'refresh_recommendations';
  eventCount: number;
  lastEventTimestamp: string;
  metadata: {
    triggeredAt: string;
    reason: string;
    correlationId: string;
  };
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private isConnected = false;
  private topics: Record<string, string>;

  constructor(
    private readonly kafkaConfigService: KafkaConfigService,
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
    private readonly mlPipelineTriggerHandler: MLPipelineTriggerHandler,
  ) {
    this.logger.info('KafkaService initialized', KafkaService.name);
    this.topics = this.configService.get<Record<string, string>>(
      'kafka.topics',
    ) ?? {
      mlPipelineTriggers: 'ml-pipeline-triggers',
      results: 'results',
      workerStatus: 'worker-status',
    };
  }

  async onModuleInit() {
    if (!this.isKafkaEnabled()) {
      this.logger.warn(
        'Kafka is disabled. Set KAFKA_ENABLED=true to enable Kafka integration.',
        KafkaService.name,
      );
      this.logger.info(
        'To start with Kafka: 1) Run launch-kafka-dev.ps1, 2) Set KAFKA_ENABLED=true, 3) Restart app',
        KafkaService.name,
      );
      return;
    }

    try {
      await this.initializeKafka();
      await this.setupTopics();
      await this.startConsumer();
      this.logger.info(
        'Kafka service initialized successfully',
        KafkaService.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to initialize Kafka service:',
        e.message,
        KafkaService.name,
      );
      const kafkaCfg = this.kafkaConfigService.getKafkaConfig?.();
      const brokersConfig = kafkaCfg && (kafkaCfg as any).brokers;
      const brokersStr = Array.isArray(brokersConfig)
        ? brokersConfig.join(',')
        : '<dynamic brokers resolver>';
      this.logger.warn(
        `Application will continue without Kafka integration. To enable Kafka, ensure the broker is reachable at: ${brokersStr}`,
        KafkaService.name,
      );
      this.isConnected = false;
      // Don't throw error to allow app to start without Kafka
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private isKafkaEnabled(): boolean {
    return this.configService.get<string>('KAFKA_ENABLED', 'false') === 'true';
  }

  private async initializeKafka() {
    // Capture configured brokers early for clearer error messages
    const kafkaCfg = this.kafkaConfigService.getKafkaConfig?.();
    const brokersConfig = kafkaCfg && (kafkaCfg as any).brokers;
    const configuredBrokers = Array.isArray(brokersConfig)
      ? brokersConfig.join(',')
      : '<dynamic brokers resolver>';

    try {
      // Import KafkaJS dynamically
      const kafkaModule = await import('kafkajs');
      const { Kafka } = kafkaModule;
      const kafkaConfig =
        this.kafkaConfigService.getKafkaConfig?.() ?? ({} as any);

      this.kafka = new Kafka(kafkaConfig);

      if (this.kafka) {
        this.producer = this.kafka.producer(
          this.kafkaConfigService.getProducerConfig(),
        );
        this.consumer = this.kafka.consumer(
          this.kafkaConfigService.getConsumerConfig(),
        );

        // Connect with timeout protection using Promise.race so timeout rejection is caught below
        await Promise.race([
          Promise.all([this.producer.connect(), this.consumer.connect()]),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Kafka connection timeout - ensure Kafka broker(s) are reachable at: ${configuredBrokers}`,
                  ),
                ),
              10000, // 10 second timeout
            ),
          ),
        ]);

        this.isConnected = true;
        this.logger.info('Connected to Kafka successfully', KafkaService.name);
      }
    } catch (error: unknown) {
      this.isConnected = false;
      const e = error instanceof Error ? error : new Error(String(error));
      if (
        e.message?.includes('ECONNREFUSED') ||
        e.message?.includes('Connection error') ||
        e.message?.toLowerCase().includes('timeout') ||
        e.message?.toLowerCase().includes('timed out')
      ) {
        throw new Error(
          `Unable to connect to Kafka broker(s) at ${configuredBrokers}. Please ensure the broker is running and network settings match.`,
        );
      }
      this.logger.error(
        'Failed to initialize Kafka:',
        e.stack,
        KafkaService.name,
      );
      throw e;
    }
  }

  private async setupTopics() {
    if (!this.kafka) return;

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const existingTopics = await admin.listTopics();
      const topicsToCreate = Object.values(this.topics).filter(
        (topic) => !existingTopics.includes(topic),
      );

      // Add DLQ topics for topics that need them
      const dlqTopicsToCreate = [
        `${this.topics.mlPipelineTriggers}-dlq`,
      ].filter((topic) => !existingTopics.includes(topic));

      const allTopicsToCreate = [...topicsToCreate, ...dlqTopicsToCreate];

      if (allTopicsToCreate.length > 0) {
        await admin.createTopics({
          topics: allTopicsToCreate.map((topic) => ({
            topic,
            numPartitions: 3, // Partitioned for scalability
            replicationFactor: 1, // Adjust based on your Kafka cluster
          })),
        });

        this.logger.info(
          `Created Kafka topics: ${topicsToCreate.join(', ')}`,
          KafkaService.name,
        );
      } else {
        this.logger.info(
          'All required Kafka topics already exist',
          KafkaService.name,
        );
      }

      await admin.disconnect();
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to setup Kafka topics:',
        e.stack,
        KafkaService.name,
      );
      throw e;
    }
  }

  private async startConsumer() {
    if (!this.consumer) return;

    try {
      await this.consumer.subscribe({
        topic: this.topics.mlPipelineTriggers,
        fromBeginning: false,
      });
      await this.consumer.subscribe({
        topic: this.topics.results,
        fromBeginning: false,
      });
      await this.consumer.subscribe({
        topic: this.topics.workerStatus,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({
          topic,
          partition,
          message,
        }: EachMessagePayload) => {
          try {
            await this.handleMessage(topic, partition, message);
          } catch (error: unknown) {
            this.logger.error(
              `Failed to process message from topic ${topic}:`,
              error instanceof Error ? error.stack : undefined,
              KafkaService.name,
            );
            const e = error instanceof Error ? error : new Error(String(error));
            // Rethrow normalized error so caller can decide about DLQ
            throw e;
          }
        },
      });

      this.logger.info(
        'Kafka consumer started and listening for messages',
        KafkaService.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to start Kafka consumer:',
        e.stack,
        KafkaService.name,
      );
      throw e;
    }
  }

  private async handleMessage(topic: string, partition: number, message: any) {
    if (!message.value) return;

    const messageValue = message.value.toString();
    this.logger.info(
      `Received message from topic ${topic}, partition ${partition}: ${messageValue}`,
      KafkaService.name,
    );

    const MAX_RETRIES = 3;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        await this.processMessage(topic, messageValue);
        return; // Success
      } catch (error: unknown) {
        retries++;
        if (retries >= MAX_RETRIES) {
          this.logger.error(
            `Message failed after ${MAX_RETRIES} retries. Sending to DLQ.`,
            error instanceof Error ? error.stack : undefined,
            KafkaService.name,
          );
          const e = error instanceof Error ? error : new Error(String(error));
          await this.publishToDLQ(topic, messageValue, e);
          return;
        }
        this.logger.warn(
          `Message processing failed. Retrying (${retries}/${MAX_RETRIES})...`,
          KafkaService.name,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries)); // Exponential backoff
      }
    }
  }

  private async processMessage(topic: string, messageValue: string) {
    switch (topic) {
      case this.topics.mlPipelineTriggers:
        const mlTrigger: MLTriggerEvent = JSON.parse(messageValue);
        await this.mlPipelineTriggerHandler.handle(mlTrigger);
        break;
      case this.topics.results:
        this.logger.log(`Received result: ${messageValue}`, KafkaService.name);
        // Here you would typically update a database or notify a user
        break;
      case this.topics.workerStatus:
        this.logger.log(
          `Received worker status: ${messageValue}`,
          KafkaService.name,
        );
        // Here you might update a list of active workers
        break;
      default:
        this.logger.warn(`Unhandled topic: ${topic}`, KafkaService.name);
    }
  }

  async sendCommand(command: any): Promise<void> {
    if (!this.isConnected || !this.producer) {
      this.logger.warn(
        'Kafka not connected, skipping command sending',
        KafkaService.name,
      );
      return;
    }

    try {
      await this.producer.send({
        topic: this.topics.commands,
        messages: [{ value: JSON.stringify(command) }],
        acks: -1,
        timeout: 30000,
      });

      this.logger.info(
        `Sent command: ${command.taskType} for task ${command.taskId}`,
        KafkaService.name,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send command:',
        error instanceof Error ? error.stack : undefined,
        KafkaService.name,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async publishToDLQ(
    originalTopic: string,
    messageValue: string,
    error: Error,
  ) {
    if (!this.isConnected || !this.producer) {
      this.logger.error(
        'Kafka not connected, cannot send to DLQ',
        undefined,
        KafkaService.name,
      );
      return;
    }

    const dlqTopic = `${originalTopic}-dlq`;
    try {
      await this.producer.send({
        topic: dlqTopic,
        messages: [
          {
            value: JSON.stringify({
              originalMessage: messageValue,
              error: {
                message: error.message,
                stack: error.stack,
              },
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      this.logger.info(
        `Message sent to DLQ topic: ${dlqTopic}`,
        KafkaService.name,
      );
    } catch (dlqError: unknown) {
      this.logger.error(
        `Failed to send message to DLQ topic ${dlqTopic}:`,
        dlqError instanceof Error ? dlqError.stack : undefined,
        KafkaService.name,
      );
    }
  }

  /**
   * Publish a calendar event to Kafka
   */
  async publishCalendarEvent(event: CalendarEvent): Promise<void> {
    if (!this.isConnected || !this.producer) {
      this.logger.warn(
        'Kafka not connected, skipping event publication',
        KafkaService.name,
      );
      return;
    }

    try {
      await this.producer.send({
        topic: this.topics.calendarEvents,
        messages: [
          {
            key: `${event.userId}-${event.eventId}`,
            value: JSON.stringify(event),
          },
        ],
        acks: -1,
        timeout: 30000,
      });

      this.logger.info(
        `Published calendar event: ${event.eventType} for user ${event.userId}`,
        KafkaService.name,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to publish calendar event:',
        error instanceof Error ? error.stack : undefined,
        KafkaService.name,
      );
      // In a real-world scenario, we might save the failed message to a database for later retry.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Trigger ML pipeline updates
   */
  async triggerMLPipeline(trigger: MLTriggerEvent): Promise<void> {
    if (!this.isConnected || !this.producer) {
      this.logger.warn(
        'Kafka not connected, skipping ML pipeline trigger',
        KafkaService.name,
      );
      return;
    }

    try {
      await this.producer.send({
        topic: this.topics.mlPipelineTriggers,
        messages: [{ key: trigger.userId, value: JSON.stringify(trigger) }],
        acks: -1,
        timeout: 30000,
      });

      this.logger.info(
        `Triggered ML pipeline: ${trigger.triggerType} for user ${trigger.userId}`,
        KafkaService.name,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to trigger ML pipeline:',
        error instanceof Error ? error.stack : undefined,
        KafkaService.name,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Publish user activity tracking data
   */
  async publishUserActivity(activity: any): Promise<void> {
    if (!this.isConnected || !this.producer) {
      this.logger.warn(
        'Kafka not connected, skipping activity publication',
        KafkaService.name,
      );
      return;
    }

    try {
      await this.producer.send({
        topic: this.topics.userActivity,
        messages: [{ key: activity.userId, value: JSON.stringify(activity) }],
        acks: -1,
        timeout: 30000,
      });

      this.logger.info(
        `Published user activity: ${activity.eventType} for user ${activity.userId}`,
        KafkaService.name,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to publish user activity:',
        error instanceof Error ? error.stack : undefined,
        KafkaService.name,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Check if Kafka is connected and ready
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      topics: Object.values(this.topics),
      enabled: this.isKafkaEnabled(),
    };
  }

  private async disconnect() {
    if (!this.isConnected) return;

    try {
      if (this.producer) {
        await this.producer.disconnect();
      }
      if (this.consumer) {
        await this.consumer.disconnect();
      }
      this.isConnected = false;
      this.logger.info('Disconnected from Kafka', KafkaService.name);
    } catch (error: unknown) {
      this.logger.error(
        'Error disconnecting from Kafka:',
        error instanceof Error ? error.stack : undefined,
        KafkaService.name,
      );
    }
  }
}
