import * as winston from 'winston';
import { RequestContextService } from './request-context.service';
import { deepRedact } from './utils/redaction.util';

const levelIcon: Record<string, string> = {
  error: '⛔',
  warn: '⚠',
  info: 'ℹ',
  http: '🌐',
  verbose: '🔍',
  debug: '🐞',
  silly: '✨',
};

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

const redactFormat = winston.format((info) => {
  const { message, ...rest } = info as any;
  const redacted = deepRedact(rest);
  return { ...info, ...redacted, message } as winston.Logform.TransformableInfo;
});

export function makeAttachRequestContextFormat(ctx?: RequestContextService) {
  return winston.format((info) => {
    if (ctx) {
      const requestId = ctx.getRequestId();
      const correlationId = ctx.getCorrelationId();
      const userId = ctx.getUserId();
      const serviceName = ctx.getServiceName();

      if (requestId && !(info as any).requestId) (info as any).requestId = requestId;
      if (correlationId && !(info as any).correlationId)
        (info as any).correlationId = correlationId;
      if (userId && !(info as any).userId) (info as any).userId = userId;
      if (serviceName && !(info as any).serviceName) (info as any).serviceName = serviceName;
    }
    return info;
  });
}

export function makePrettyConsoleFormat(ctx?: RequestContextService) {
  return winston.format.combine(
    makeAttachRequestContextFormat(ctx)(),
    redactFormat(),
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf((info) => {
      const { timestamp, level, message } = info as any;
      const requestPart = (info as any).requestId ? ` [req:${(info as any).requestId}]` : '';

      let processedMessage = message as string;
      let detailsPart = '';
      let contextLabel = '';
      const sourceLabel = (info as any).source ? ` (${(info as any).source})` : '';

      if ((info as any).context) {
        const context = (info as any).context;
        if (typeof context === 'string' && context.startsWith('{') && context.endsWith('}')) {
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

      const icon = levelIcon[(info as any).level] || '•';
      const tracePart = (info as any).trace ? `\n${(info as any).trace}` : '';
      const extra: Record<string, any> = { ...info } as any;
      delete extra.timestamp;
      delete extra.level;
      delete extra.message;
      delete extra.context;
      delete extra.trace;
      delete extra.requestId;
      delete extra.correlationId;
      delete extra.userId;
      delete extra.serviceName;
      delete (extra as any).source;
      delete (extra as any).sourceAbs;
      delete (extra as any).file;
      delete (extra as any).line;
      delete (extra as any).column;
      delete (extra as any).function;
      const restPart = Object.keys(extra).length ? ` ${humanizeObjectInline(extra)}` : '';
      const line = `${timestamp} ${icon} ${level.toUpperCase().padEnd(7)}${requestPart}${contextLabel}${sourceLabel}: ${`${processedMessage}${detailsPart}${restPart}`.trim()}`;
      return `${line}${tracePart}`.trimEnd();
    })
  );
}

export function makeJsonFileFormat(ctx?: RequestContextService) {
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

  return winston.format.combine(
    makeAttachRequestContextFormat(ctx)(),
    redactFormat(),
    pruneFileMetaFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );
}
