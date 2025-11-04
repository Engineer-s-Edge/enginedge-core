import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createLogger, format, transports, Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  workflow?: string;
  workerType?: string;
  [key: string]: any;
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'LOGGER',
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');

        const logger = createLogger({
          level: logLevel,
          format: format.combine(
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            format.errors({ stack: true }),
            format.splat(),
            format.json()
          ),
          defaultMeta: {
            service: 'hexagon',
            environment: nodeEnv,
          },
          transports: [
            new transports.Console({
              format: nodeEnv === 'development'
                ? format.combine(
                    format.colorize(),
                    format.printf(({ timestamp, level, message, ...meta }) => {
                      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                      return `${timestamp} [${level}]: ${message} ${metaStr}`;
                    })
                  )
                : format.json(),
            }),
          ],
        });

        return logger;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['LOGGER'],
})
export class LoggerModule {}

export class HexagonLogger {
  constructor(private readonly logger: Logger, private context: LogContext = {}) {}

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  private enrichMeta(meta?: LogContext): LogContext {
    return {
      ...this.context,
      ...meta,
      correlationId: meta?.correlationId || this.context.correlationId || uuidv4(),
    };
  }

  log(message: string, meta?: LogContext): void {
    this.logger.info(message, this.enrichMeta(meta));
  }

  error(message: string, error?: Error | unknown, meta?: LogContext): void {
    const enrichedMeta = this.enrichMeta(meta);
    if (error instanceof Error) {
      enrichedMeta.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    } else if (error) {
      enrichedMeta.error = error;
    }
    this.logger.error(message, enrichedMeta);
  }

  warn(message: string, meta?: LogContext): void {
    this.logger.warn(message, this.enrichMeta(meta));
  }

  debug(message: string, meta?: LogContext): void {
    this.logger.debug(message, this.enrichMeta(meta));
  }

  info(message: string, meta?: LogContext): void {
    this.logger.info(message, this.enrichMeta(meta));
  }
}

