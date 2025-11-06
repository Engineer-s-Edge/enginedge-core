import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';
import { Kafka, Producer } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable({ scope: Scope.DEFAULT })
export class KafkaLoggerService implements LoggerService {
  private kafka: Kafka;
  private producer: Producer;
  private connected = false;
  private reconnectTimer?: NodeJS.Timeout;
  private bufferFilePath: string;
  private connectionWarningShown = false;
  private levelOrder = ['debug', 'log', 'warn', 'error', 'fatal'] as const;
  private levelMap: Record<string, number> = { debug: 0, log: 1, warn: 2, error: 3, fatal: 4 };
  private minLevel: string;
  private serviceName: string;
  private enableConsole: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly requestContext: RequestContextService
  ) {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const clientId = process.env.KAFKA_CLIENT_ID || 'enginedge-api-gateway';
    this.serviceName = process.env.SERVICE_NAME || 'api-gateway';
    this.enableConsole = (process.env.LOG_ENABLE_CONSOLE || 'true') === 'true';
    this.minLevel = process.env.LOG_LEVEL || 'info';

    // Suppress KafkaJS verbose logging to reduce spam when Kafka is unavailable
    // Set KAFKA_LOG_LEVEL=DEBUG to see all logs, or KAFKA_LOG_LEVEL=ERROR for errors only
    const kafkaLogLevel = process.env.KAFKA_LOG_LEVEL || 'NOTHING';
    const logCreator = () => {
      return () => {
        // No-op: suppress all KafkaJS logs by default
        // This prevents connection retry spam when Kafka is unavailable
      };
    };

    // Map log level strings to KafkaJS log levels (0 = NOTHING, 4 = ERROR, 5 = WARN, etc.)
    const logLevelMap: Record<string, number> = {
      NOTHING: 0,
      ERROR: 4,
      WARN: 5,
      INFO: 6,
      DEBUG: 7,
    };

    this.kafka = new Kafka({
      clientId: `${clientId}-${this.serviceName}`,
      brokers,
      retry: { initialRetryTime: 300, retries: 3 },
      logLevel: logLevelMap[kafkaLogLevel] ?? 0,
      logCreator: kafkaLogLevel === 'NOTHING' ? logCreator : undefined,
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      maxInFlightRequests: 1,
      idempotent: true,
    });

    const dir = process.env.LOG_BUFFER_DIR || 'logs';
    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
    this.bufferFilePath = path.join(absDir, `${this.serviceName}-buffer.log`);

    this.connect().catch(() => {});
  }

  private should(level: string): boolean {
    const map: Record<string, number> = { debug: 0, info: 1, log: 1, warn: 2, error: 3, fatal: 4 };
    const current = map[this.minLevel] ?? 1;
    return (map[level] ?? 1) >= current;
  }

  private async connect() {
    try {
      await this.producer.connect();
      this.connected = true;
      if (this.connectionWarningShown) {
        console.log('[KafkaLogger] Connected to Kafka broker');
        this.connectionWarningShown = false; // Reset so we warn again if it disconnects
      }
    } catch (error: any) {
      this.connected = false;
      // Show warning only once to avoid spam
      if (!this.connectionWarningShown) {
        console.warn(
          `[KafkaLogger] Cannot connect to Kafka at ${process.env.KAFKA_BROKERS || 'localhost:9092'}. ` +
            `Logs will be buffered to disk. Connection retries will be silent. ` +
            `Set KAFKA_LOG_LEVEL=ERROR to see retry attempts.`
        );
        this.connectionWarningShown = true;
      }
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => {});
    }, 5000);
  }

  private async emit(
    level: string,
    message: any,
    meta?: Record<string, unknown>,
    logToConsole = true
  ) {
    if (!this.should(level)) return;
    const ctx = this.requestContext.getStore() || {};
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      service: this.serviceName,
      requestId: (ctx.requestId as any) || undefined,
      correlationId: (ctx.correlationId as any) || undefined,
      userId: (ctx.userId as any) || undefined,
      ...meta,
    };
    // Only format with timestamp if explicitly requested (for direct emits, not NestJS logs)
    if (this.enableConsole && logToConsole) {
      const line = `[${entry.timestamp}] [${level.toUpperCase()}] ${entry.message}`;
      if (level === 'error' || level === 'fatal') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    }
    const topic = `enginedge.logs.worker.${this.serviceName}`;
    try {
      if (!this.connected) throw new Error('Kafka not connected');
      await this.producer.send({
        topic,
        messages: [
          { key: this.serviceName, value: JSON.stringify(entry), timestamp: Date.now().toString() },
        ],
      });
    } catch {
      try {
        fs.appendFileSync(this.bufferFilePath, JSON.stringify(entry) + '\n', 'utf-8');
      } catch {}
      this.scheduleReconnect();
    }
  }

  log(message: any, ...optionalParams: any[]) {
    // Preserve NestJS default format for console output
    if (this.enableConsole) {
      console.log(message, ...optionalParams);
    }
    // Send structured version to Kafka
    this.emit('log', message, this.meta(optionalParams), false); // false = don't log to console again
  }
  error(message: any, trace?: string, context?: string) {
    // Preserve NestJS default format for console output
    if (this.enableConsole) {
      console.error(message, trace, context);
    }
    // Send structured version to Kafka
    this.emit(
      'error',
      message,
      this.meta([trace ? { trace } : undefined, context ? { context } : undefined]),
      false // false = don't log to console again
    );
  }
  warn(message: any, ...optionalParams: any[]) {
    // Preserve NestJS default format for console output
    if (this.enableConsole) {
      console.warn(message, ...optionalParams);
    }
    // Send structured version to Kafka
    this.emit('warn', message, this.meta(optionalParams), false); // false = don't log to console again
  }
  debug?(message: any, ...optionalParams: any[]) {
    // Preserve NestJS default format for console output
    if (this.enableConsole) {
      console.debug(message, ...optionalParams);
    }
    // Send structured version to Kafka
    this.emit('debug', message, this.meta(optionalParams), false); // false = don't log to console again
  }
  verbose?(message: any, ...optionalParams: any[]) {
    // Preserve NestJS default format for console output
    if (this.enableConsole) {
      console.debug(message, ...optionalParams);
    }
    // Send structured version to Kafka
    this.emit('debug', message, this.meta(optionalParams), false); // false = don't log to console again
  }

  private meta(params: any[]): Record<string, unknown> | undefined {
    const parts = (params || []).filter(Boolean);
    if (parts.length === 0) return undefined;
    return Object.assign({}, ...parts);
  }
}
