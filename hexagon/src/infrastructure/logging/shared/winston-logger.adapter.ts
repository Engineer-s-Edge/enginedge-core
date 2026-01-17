import { Injectable, OnModuleInit, Scope, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';
import { ILoggerPort, LogLevel, LogContext } from './logger.port';
import { RequestContextService } from './request-context.service';
import { computeCallSite } from './utils/callsite.util';
import {
  makePrettyConsoleFormat,
  makeJsonFileFormat,
} from './winston-logger.formatters';

@Injectable({ scope: Scope.DEFAULT })
export class WinstonLoggerAdapter
  implements ILoggerPort, LoggerService, OnModuleInit
{
  private readonly logger: winston.Logger;
  private sentry?: any;
  private consoleEnabled = true;
  private static isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext?: RequestContextService,
  ) {
    const logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
    const logDir = this.configService.get<string>('LOG_DIR', 'logs');
    const appName = this.configService.get<string>('APP_NAME', 'enginedge');
    const enableConsole =
      this.configService.get<string>('LOG_ENABLE_CONSOLE', 'true') === 'true';
    this.consoleEnabled = enableConsole;
    const enableFiles =
      this.configService.get<string>('LOG_ENABLE_FILES', 'true') === 'true';

    try {
      const absDir = path.isAbsolute(logDir)
        ? logDir
        : path.join(process.cwd(), logDir);
      if (!fs.existsSync(absDir)) {
        fs.mkdirSync(absDir, { recursive: true });
      }
    } catch (e) {
      process.env.LOG_ENABLE_FILES = 'false';
    }

    const sentryDsn = this.configService.get<string>('SENTRY_DSN');
    if (sentryDsn) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.init({
          dsn: sentryDsn,
          environment: this.configService.get<string>(
            'NODE_ENV',
            'development',
          ),
          release:
            this.configService.get<string>('SENTRY_RELEASE') || undefined,
          tracesSampleRate: Number(
            this.configService.get<string>('SENTRY_TRACES_SAMPLE_RATE', '0'),
          ),
        });
        this.sentry = Sentry;
      } catch {}
    }

    const consoleTransport = new winston.transports.Console({
      level: logLevel,
      format: makePrettyConsoleFormat(this.requestContext),
      silent: !enableConsole,
    });

    const jsonFormat = makeJsonFileFormat(this.requestContext);

    const rotateFile = (filename: string, level?: string) =>
      new (winston.transports as any).DailyRotateFile({
        dirname: logDir,
        filename: `${appName}-%DATE%-${filename}.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: this.configService.get<string>('LOG_MAX_SIZE', '20m'),
        maxFiles: this.configService.get<string>('LOG_MAX_FILES', '14d'),
        level: level || logLevel,
        format: jsonFormat,
        silent: !enableFiles,
      });

    this.logger = winston.createLogger({
      level: logLevel,
      transports: [
        consoleTransport,
        rotateFile('combined'),
        rotateFile('error', 'error'),
      ],
      exceptionHandlers: WinstonLoggerAdapter.isInitialized
        ? []
        : [rotateFile('exceptions', 'error')],
      rejectionHandlers: WinstonLoggerAdapter.isInitialized
        ? []
        : [rotateFile('rejections', 'error')],
      exitOnError: false,
    });

    WinstonLoggerAdapter.isInitialized = true;
  }

  async onModuleInit() {}

  private buildMetaFromContext(context?: unknown): Record<string, any> {
    if (typeof context === 'undefined') return {};
    if (typeof context === 'string') return { context };
    try {
      return { context: JSON.stringify(context) };
    } catch {
      return { context: '[Unserializable Context]' };
    }
  }

  private buildWinstonMeta(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): any {
    const callsite = computeCallSite(
      this[level],
      typeof context === 'string' ? context : undefined,
    );
    const requestContext = this.requestContext?.getStore();

    let logContext: LogContext = {};
    if (requestContext) logContext = { ...requestContext };
    if (typeof context === 'object' && context)
      logContext = { ...logContext, ...context };
    else if (typeof context === 'string') logContext.context = context;

    const meta: any = {
      ...this.buildMetaFromContext(logContext),
      ...metadata,
      ...callsite,
    };

    if (error) {
      if (error instanceof Error) {
        meta.trace = error.stack;
        meta.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        meta.error = error;
      }
    }
    return meta;
  }

  log(
    message: string,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'info',
      message,
      undefined,
      context,
      metadata,
    );
    this.logger.info(message, meta);
  }
  info(
    message: string,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'info',
      message,
      undefined,
      context,
      metadata,
    );
    this.logger.info(message, meta);
  }
  debug(
    message: string,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'debug',
      message,
      undefined,
      context,
      metadata,
    );
    this.logger.debug(message, meta);
  }
  warn(
    message: string,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'warn',
      message,
      undefined,
      context,
      metadata,
    );
    this.logger.warn(message, meta);
  }
  error(
    message: string,
    error?: Error | unknown,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'error',
      message,
      error,
      context,
      metadata,
    );
    this.logger.error(message, meta);
  }
  fatal(
    message: string,
    error?: Error | unknown,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'fatal',
      message,
      error,
      context,
      metadata,
    );
    this.logger.error(message, meta);
  }
  verbose(
    message: string,
    context?: string | LogContext,
    metadata?: Record<string, unknown>,
  ): void {
    const meta = this.buildWinstonMeta(
      'debug',
      message,
      undefined,
      context,
      metadata,
    );
    this.logger.verbose(message, meta);
  }
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }
  getLevel(): string {
    return this.logger.level;
  }
}
