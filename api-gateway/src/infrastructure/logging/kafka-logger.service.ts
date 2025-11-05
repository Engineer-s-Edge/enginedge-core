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

    this.kafka = new Kafka({
      clientId: `${clientId}-${this.serviceName}`,
      brokers,
      retry: { initialRetryTime: 300, retries: 3 },
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
    } catch {
      this.connected = false;
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

  private async emit(level: string, message: any, meta?: Record<string, unknown>) {
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
    if (this.enableConsole) {
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
    this.emit('log', message, this.meta(optionalParams));
  }
  error(message: any, trace?: string, context?: string) {
    this.emit(
      'error',
      message,
      this.meta([trace ? { trace } : undefined, context ? { context } : undefined])
    );
  }
  warn(message: any, ...optionalParams: any[]) {
    this.emit('warn', message, this.meta(optionalParams));
  }
  debug?(message: any, ...optionalParams: any[]) {
    this.emit('debug', message, this.meta(optionalParams));
  }
  verbose?(message: any, ...optionalParams: any[]) {
    this.emit('debug', message, this.meta(optionalParams));
  }

  private meta(params: any[]): Record<string, unknown> | undefined {
    const parts = (params || []).filter(Boolean);
    if (parts.length === 0) return undefined;
    return Object.assign({}, ...parts);
  }
}
