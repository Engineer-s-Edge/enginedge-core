/**
 * Kafka Log Consumer Service
 *
 * Consumes logs from Kafka topics and writes them to Winston logger.
 * Uses a concurrent worker pool (75% of CPU cores) for processing.
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IKafkaConsumer } from '@application/ports/kafka-consumer.port';
import { WinstonLoggerAdapter } from './shared/winston-logger.adapter';
import { LogMessage } from './shared/logger.port';
import * as os from 'os';

interface QueuedLog {
  log: LogMessage;
  resolve: () => void;
  reject: (err: Error) => void;
}

@Injectable()
export class KafkaLogConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaLogConsumerService.name);
  private workerPoolSize: number;
  private processingQueue: QueuedLog[] = [];
  private workers: Promise<void>[] = [];
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    @Inject('IKafkaConsumer:Logging')
    private readonly kafkaConsumer: IKafkaConsumer,
    private readonly winstonLogger: WinstonLoggerAdapter,
  ) {
    // Use 75% of CPU cores, minimum 1
    const cpuCount = os.cpus().length;
    this.workerPoolSize = Math.max(1, Math.floor(cpuCount * 0.75));
    this.logger.log(
      `Initializing log consumer with ${this.workerPoolSize} workers (${cpuCount} CPU cores available)`,
    );
  }

  async onModuleInit() {
    await this.startConsuming();
  }

  async onModuleDestroy() {
    await this.stopConsuming();
  }

  private async startConsuming() {
    this.running = true;

    // Start worker pool
    for (let i = 0; i < this.workerPoolSize; i++) {
      this.workers.push(this.worker(i));
    }

    // Subscribe to all worker log topics
    // In production, you might want to discover topics dynamically
    const workerTypes = this.configService
      .get<string>(
        'LOG_WORKER_TYPES',
        'assistant-worker,agent-tool-worker,data-processing-worker,identity-worker,interview-worker,latex-worker,news-worker,resume-worker,scheduling-worker',
      )
      .split(',');

    // Subscribe to all topics first
    for (const workerType of workerTypes) {
      const topic = `enginedge.logs.worker.${workerType.trim()}`;
      try {
        await this.kafkaConsumer.subscribe(topic, (message: LogMessage) => {
          return this.processLog(message);
        });
        this.logger.log(`Subscribed to log topic: ${topic}`);
      } catch (error) {
        this.logger.error(`Failed to subscribe to topic ${topic}`, error);
      }
    }

    // Now start the consumer to begin processing messages
    try {
      await this.kafkaConsumer.startConsumer();
      this.logger.log('Log consumer started and running');
    } catch (error) {
      this.logger.error('Failed to start log consumer', error);
    }
  }

  private async stopConsuming() {
    this.running = false;

    // Wait for all workers to finish
    await Promise.all(this.workers);

    this.logger.log('Log consumer stopped');
  }

  private async worker(workerId: number): Promise<void> {
    this.logger.debug(`Worker ${workerId} started`);

    while (this.running) {
      const item = this.processingQueue.shift();

      if (item) {
        try {
          await this.writeLogToWinston(item.log);
          item.resolve();
        } catch (error) {
          this.logger.error(`Worker ${workerId} failed to process log`, error);
          item.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      } else {
        // No items in queue, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.logger.debug(`Worker ${workerId} stopped`);
  }

  private processLog(log: LogMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.processingQueue.push({ log, resolve, reject });
    });
  }

  private async writeLogToWinston(log: LogMessage): Promise<void> {
    // Convert LogMessage to Winston format
    const level = log.level;
    const message = log.message;
    const context: any = log.context || {};
    const metadata: any = log.metadata || {};

    // Add source information if available
    if (log.source) {
      metadata.source = log.source;
    }

    // Add error information if available
    if (log.error) {
      const error = new Error(log.error.message);
      error.name = log.error.name;
      error.stack = log.error.stack;

      switch (level) {
        case 'error':
          this.winstonLogger.error(message, error, context, metadata);
          break;
        case 'fatal':
          this.winstonLogger.fatal(message, error, context, metadata);
          break;
        default:
          this.winstonLogger[level](message, context, metadata);
      }
    } else {
      // No error, just log normally
      switch (level) {
        case 'debug':
          this.winstonLogger.debug(message, context, metadata);
          break;
        case 'info':
          this.winstonLogger.info(message, context, metadata);
          break;
        case 'warn':
          this.winstonLogger.warn(message, context, metadata);
          break;
        case 'error':
          this.winstonLogger.error(message, undefined, context, metadata);
          break;
        case 'fatal':
          this.winstonLogger.fatal(message, undefined, context, metadata);
          break;
        default:
          this.winstonLogger.info(message, context, metadata);
      }
    }
  }
}
