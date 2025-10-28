import { Injectable, Scope, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContextService } from './request-context.service';

// Console pretty-print format with colors, timestamps, level padding, and context
const levelIcon: Record<string, string> = {
  error: '⛔',
  warn: '⚠',
  info: 'ℹ',
  http: '🌐',
  verbose: '🔍',
  debug: '🐞',
  silly: '✨',
};

const redactKeys = new Set([
  'password',
  'pass',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'apiKey',
  'apikey',
  'client_secret',
  'secret',
  'cookie',
  'set-cookie',
]);

function deepRedact(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v));
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) {
      if (redactKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = deepRedact(v);
      }
    }
    return result;
  }
  return value;
}

const redactFormat = winston.format((info) => {
  const { message, ...rest } = info as any;
  const redacted = deepRedact(rest);
  return { ...info, ...redacted, message } as winston.Logform.TransformableInfo;
});

function makeAttachRequestContextFormat(ctx?: RequestContextService) {
  return winston.format((info) => {
    if (ctx) {
      const requestId = ctx.getRequestId();
      if (requestId && !info.requestId) {
        (info as any).requestId = requestId;
      }
    }
    return info;
  });
}

function formatJsonString(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function humanizeValueInline(value: any): string {
  if (value == null) return String(value);
  if (Array.isArray(value)) return value.map(humanizeValueInline).join(', ');
  if (typeof value === 'object') return humanizeObjectInline(value);
  return String(value);
}

function humanizeObjectInline(obj: Record<string, any>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    parts.push(`${k}=${humanizeValueInline(v)}`);
  }
  return parts.join(' ');
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function visibleLength(str: string): number {
  return (str || '').replace(ANSI_REGEX, '').length;
}

function wrapWithIndent(
  content: string,
  prefix: string,
  maxWidth = 300,
  indentWidthOverride?: number,
): string {
  const tokens = (content || '').split(/\s+/).filter(Boolean);
  const indentWidth =
    typeof indentWidthOverride === 'number'
      ? indentWidthOverride
      : visibleLength(prefix);
  const indent = ' '.repeat(indentWidth);
  let lines: string[] = [];
  let current = '';
  let currentLen = 0;
  const firstLineWidth = maxWidth - visibleLength(prefix);
  const placeOnFirstLine = firstLineWidth > 10; // if too small, move all content to next line
  if (!placeOnFirstLine) {
    lines.push(''); // placeholder for first line content (none)
  }

  for (const token of tokens) {
    const tokenLen = visibleLength(token);
    const needsSpace = currentLen > 0 ? 1 : 0;
    const limit = lines.length === 0 ? firstLineWidth : maxWidth - indentWidth;
    if (currentLen + needsSpace + tokenLen <= limit) {
      current += (needsSpace ? ' ' : '') + token;
      currentLen += needsSpace + tokenLen;
    } else {
      if (currentLen > 0) lines.push(current);
      current = token; // start new line with token
      currentLen = tokenLen; // allow token to exceed limit rather than breaking words
    }
  }
  if (current) lines.push(current);

  if (lines.length === 0) return prefix; // nothing to add
  const [first, ...rest] = lines;
  const wrapped = [prefix + first, ...rest.map((l) => indent + l)].join('\n');
  return wrapped;
}

// Extract the first external callsite (file:line:column) outside the logger itself
function computeCallSite(skipUntil?: Function, hint?: string) {
  const err = new Error();
  if ((Error as any).captureStackTrace && skipUntil) {
    (Error as any).captureStackTrace(err, skipUntil as any);
  }
  const stack = err.stack || '';
  const lines = stack.split('\n').slice(1); // drop "Error"
  const loggerFileHints = [
    `${path.sep}logger.service.ts`,
    `${path.sep}logger.service.js`,
  ];
  // Skip frames from node internals, node_modules, winston, and this logger file
  const isInternal = (p: string) =>
    !p ||
    p.includes(`${path.sep}node_modules${path.sep}`) ||
    p.startsWith('node:') ||
    p.includes(`${path.sep}winston${path.sep}`) ||
    loggerFileHints.some((h) => p.includes(h));
  const isExcludedMain = (p: string) => {
    const n = p.replace(/\\/g, '/');
    return (
      /\/src\/main\.(t|j)s$/i.test(n) ||
      /\/dist(\/src)?\/main\.(t|j)s$/i.test(n)
    );
  };
  const isProjectFrame = (p: string) => {
    const cwd = process.cwd().replace(/\\/g, '/');
    const n = p.replace(/\\/g, '/');
    return n.startsWith(cwd + '/') && !isInternal(p);
  };
  const matchesHint = (p: string, fn?: string) => {
    if (!hint) return false;
    const h = hint.toLowerCase();
    const n = p.toLowerCase();
    const fnn = (fn || '').toLowerCase();
    // Also try common suffix removals
    const base = h.replace(/(service|controller|module|resolver)$/i, '');
    return (
      n.includes(h) || n.includes(base) || fnn.includes(h) || fnn.includes(base)
    );
  };
  const shouldPrefer = (p: string) => {
    const n = p.replace(/\\/g, '/');
    return (
      (n.includes('/src/') || n.includes('/dist/src/')) && !isExcludedMain(p)
    );
  };

  let fallback: Record<string, any> | undefined;
  let firstProjectFrame: Record<string, any> | undefined;
  let firstHintMatch: Record<string, any> | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    // Patterns: "at FunctionName (path:line:column)" or "at path:line:column"
    const match = line.match(/^at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const functionName = match[1];
    const absPath = match[2];
    const lineNum = Number(match[3]);
    const colNum = Number(match[4]);
    if (isInternal(absPath)) continue;

    const cwd = process.cwd();
    const relPath = path.relative(cwd, absPath).replace(/\\/g, '/');
    const source = `${relPath}:${lineNum}:${colNum}`;
    const sourceAbs = `${absPath}:${lineNum}:${colNum}`;
    const frame = {
      source,
      sourceAbs,
      file: relPath,
      line: lineNum,
      column: colNum,
      function: functionName,
    } as Record<string, any>;

    if (
      !firstHintMatch &&
      matchesHint(absPath, functionName) &&
      !isExcludedMain(absPath)
    ) {
      firstHintMatch = frame;
    }
    if (shouldPrefer(absPath)) {
      return frame;
    }
    if (
      !firstProjectFrame &&
      isProjectFrame(absPath) &&
      !isExcludedMain(absPath)
    ) {
      firstProjectFrame = frame;
    }
    // Save first acceptable frame as fallback if no preferred frame found
    if (!fallback) fallback = frame;
  }

  return (
    firstHintMatch ||
    firstProjectFrame ||
    fallback ||
    ({} as Record<string, any>)
  );
}

function makePrettyConsoleFormat(ctx?: RequestContextService) {
  return winston.format.combine(
    makeAttachRequestContextFormat(ctx)(),
    redactFormat(),
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf((info) => {
      const { timestamp, level, message } = info as any;
      const requestPart = (info as any).requestId
        ? ` [req:${(info as any).requestId}]`
        : '';

      let processedMessage = message as string;
      let detailsPart = '';
      let contextLabel = '';
      const sourceLabel = (info as any).source
        ? ` (${(info as any).source})`
        : '';

      // Handle context from the context field
      if ((info as any).context) {
        const context = (info as any).context;
        if (
          typeof context === 'string' &&
          context.startsWith('{') &&
          context.endsWith('}')
        ) {
          // Treat JSON context as detail key=value list (no braces/quotes)
          try {
            const parsed = JSON.parse(context);
            detailsPart += ` ${humanizeObjectInline(parsed)}`;
          } catch {
            detailsPart += ` ${context}`;
          }
        } else {
          contextLabel = ` [${context}]`;
        }
      }

      // Also check if message contains JSON patterns and format them
      if (typeof processedMessage === 'string') {
        // Look for JSON objects in the message itself
        const jsonMatch = processedMessage.match(
          /(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/,
        );
        if (jsonMatch) {
          const jsonStr = jsonMatch[1];
          try {
            const parsed = JSON.parse(jsonStr);
            const human = humanizeObjectInline(parsed);
            processedMessage = processedMessage.replace(jsonStr, human);
          } catch {
            // leave as is if not parseable
          }
        }
      }

      const icon = levelIcon[(info as any).level] || '•';
      const tracePart = (info as any).trace ? `\n${(info as any).trace}` : '';
      const extra: Record<string, any> = { ...info } as any;
      delete extra.timestamp;
      delete extra.level;
      delete extra.message;
      delete extra.context;
      delete extra.trace;
      delete extra.requestId;
      // Hide callsite/meta fields from console "rest" output
      delete (extra as any).source;
      delete (extra as any).sourceAbs;
      delete (extra as any).file;
      delete (extra as any).line;
      delete (extra as any).column;
      delete (extra as any).function;
      const restPart = Object.keys(extra).length
        ? ` ${humanizeObjectInline(extra)}`
        : '';
      const line = `${timestamp} ${icon} ${level.toUpperCase().padEnd(7)}${requestPart}${contextLabel}${sourceLabel}: ${`${processedMessage}${detailsPart}${restPart}`.trim()}`;
      return `${line}${tracePart}`.trimEnd();
    }),
  );
}

@Injectable({ scope: Scope.DEFAULT })
export class MyLogger implements LoggerService {
  private readonly logger: winston.Logger;
  private sentry?: any;
  private consoleEnabled = true;
  private static instance: MyLogger;
  private static isInitialized = false;

  constructor(private readonly requestContext?: RequestContextService) {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logDir = process.env.LOG_DIR || 'logs';
    const appName = process.env.APP_NAME || 'enginedge';
    const enableConsole = (process.env.LOG_ENABLE_CONSOLE || 'true') === 'true';
    this.consoleEnabled = enableConsole;
    const enableFiles = (process.env.LOG_ENABLE_FILES || 'true') === 'true';

    // Ensure log directory exists
    try {
      const absDir = path.isAbsolute(logDir)
        ? logDir
        : path.join(process.cwd(), logDir);
      if (!fs.existsSync(absDir)) {
        fs.mkdirSync(absDir, { recursive: true });
      }
    } catch (e) {
      // If creating directory fails, disable file logging to avoid crashes
      process.env.LOG_ENABLE_FILES = 'false';
    }

    // Optional Sentry setup
    const sentryDsn = process.env.SENTRY_DSN;
    if (sentryDsn) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.init({
          dsn: sentryDsn,
          environment: process.env.NODE_ENV || 'development',
          release: process.env.SENTRY_RELEASE || undefined,
          tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
        });
        this.sentry = Sentry;
      } catch (e) {
        // If Sentry package is not installed, skip silently
      }
    }

    const consoleTransport = new winston.transports.Console({
      level: logLevel,
      format: makePrettyConsoleFormat(this.requestContext),
      silent: !enableConsole,
    });

    // Remove verbose callsite fields from file logs while keeping sourceAbs
    const pruneFileMetaFormat = winston.format((info) => {
      const keepSourceAbs = (info as any).sourceAbs;
      delete (info as any).source;
      delete (info as any).file;
      delete (info as any).line;
      delete (info as any).column;
      delete (info as any).function;
      if (keepSourceAbs) (info as any).sourceAbs = keepSourceAbs;
      return info;
    });

    const jsonFormat = winston.format.combine(
      makeAttachRequestContextFormat(this.requestContext)(),
      redactFormat(),
      pruneFileMetaFormat(),
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const rotateFile = (filename: string, level?: string) =>
      new (winston.transports as any).DailyRotateFile({
        dirname: logDir,
        filename: `${appName}-%DATE%-${filename}.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: process.env.LOG_MAX_SIZE || '20m',
        maxFiles: process.env.LOG_MAX_FILES || '14d',
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
      // Only add exception handlers once to prevent memory leaks
      exceptionHandlers: MyLogger.isInitialized
        ? []
        : [rotateFile('exceptions', 'error')],
      rejectionHandlers: MyLogger.isInitialized
        ? []
        : [rotateFile('rejections', 'error')],
      exitOnError: false,
    });

    // Mark as initialized to prevent duplicate exception handlers
    MyLogger.isInitialized = true;
  }

  private buildMetaFromContext(context?: unknown): Record<string, any> {
    if (typeof context === 'undefined') return {};
    if (typeof context === 'string') return { context };
    try {
      return { context: JSON.stringify(context) };
    } catch {
      return { context: '[Unserializable Context]' };
    }
  }

  log(message: any, context?: unknown) {
    const callsite = computeCallSite(
      this.log,
      typeof context === 'string' ? context : undefined,
    );
    this.logger.info(message, {
      ...this.buildMetaFromContext(context),
      ...callsite,
    });
  }

  info(message: any, context?: unknown) {
    const callsite = computeCallSite(
      this.info as any,
      typeof context === 'string' ? context : undefined,
    );
    this.logger.info(message, {
      ...this.buildMetaFromContext(context),
      ...callsite,
    });
  }

  error(message: any, trace?: string, context?: any) {
    const callsite = computeCallSite(
      this.error,
      typeof context === 'string' ? context : undefined,
    );
    const derivedTrace =
      trace || (message instanceof Error ? message.stack : undefined);
    this.logger.error(message, {
      trace: derivedTrace,
      ...this.buildMetaFromContext(context),
      ...callsite,
    });

    if (this.sentry) {
      const Sentry = this.sentry;
      Sentry.withScope((scope: any) => {
        if (typeof context === 'string') scope.setTag('context', context);
        else if (context)
          scope.setExtra('context', this.buildMetaFromContext(context).context);
        const requestId = this.requestContext?.getRequestId();
        if (requestId) scope.setTag('requestId', requestId);
        if (derivedTrace) scope.setExtra('trace', derivedTrace);
        if (typeof message === 'string') {
          Sentry.captureMessage(message, 'error');
        } else if (message instanceof Error) {
          Sentry.captureException(message);
        } else {
          Sentry.captureMessage(JSON.stringify(message), 'error');
        }
      });
    }
  }

  warn(message: any, context?: any) {
    const callsite = computeCallSite(
      this.warn,
      typeof context === 'string' ? context : undefined,
    );
    this.logger.warn(message, {
      ...this.buildMetaFromContext(context),
      ...callsite,
    });
  }

  debug(message: any, context?: any) {
    const callsite = computeCallSite(
      this.debug as any,
      typeof context === 'string' ? context : undefined,
    );
    this.logger.debug(message, {
      ...this.buildMetaFromContext(context),
      ...callsite,
    });
  }

  verbose(message: any, context?: any) {
    const callsite = computeCallSite(
      this.verbose as any,
      typeof context === 'string' ? context : undefined,
    );
    this.logger.verbose(message, {
      ...this.buildMetaFromContext(context),
      ...callsite,
    });
  }
}
