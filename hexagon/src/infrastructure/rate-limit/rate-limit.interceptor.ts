import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  TooManyRequestsException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private buckets = new Map<string, TokenBucket>();
  private capacity = parseInt(process.env.RATE_LIMIT_CAPACITY || '60', 10); // per minute
  private refillPerMs = this.capacity / 60000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const accept = (req.headers['accept'] as string) || '';
    const isSse = accept.includes('text/event-stream');
    const isWs = (req.headers['upgrade'] as string)?.toLowerCase() === 'websocket';
    if (isSse || isWs) {
      return next.handle();
    }
    const key = `${req.ip}:${req.method}:${req.route?.path || req.url}`;

    const now = Date.now();
    const bucket = this.buckets.get(key) || { tokens: this.capacity, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      throw new TooManyRequestsException('Rate limit exceeded');
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return next.handle();
  }
}

