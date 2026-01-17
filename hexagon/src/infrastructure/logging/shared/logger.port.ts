/**
 * Logger Port
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  workerType?: string;
  serviceName?: string;
  [key: string]: unknown;
}

export interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  metadata?: Record<string, unknown>;
  source?: {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
  };
  trace?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface ILoggerPort {
  debug(message: string, context?: string | LogContext, metadata?: Record<string, unknown>): void;
  info(message: string, context?: string | LogContext, metadata?: Record<string, unknown>): void;
  warn(message: string, context?: string | LogContext, metadata?: Record<string, unknown>): void;
  error(
    message: string,
    error?: Error | unknown,
    context?: string | LogContext,
    metadata?: Record<string, unknown>
  ): void;
  fatal(
    message: string,
    error?: Error | unknown,
    context?: string | LogContext,
    metadata?: Record<string, unknown>
  ): void;
  verbose(message: string, context?: string | LogContext, metadata?: Record<string, unknown>): void;
  log(message: string, context?: string | LogContext, metadata?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  getLevel(): string;
}
