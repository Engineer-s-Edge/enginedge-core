export class Message {
  constructor(
    public readonly id: string,
    public readonly type: MessageType,
    public readonly payload: any,
    public readonly headers: MessageHeaders,
    public readonly correlationId: string,
    public readonly timestamp: Date,
    public readonly replyTo?: string,
  ) {}

  static create(
    type: MessageType,
    payload: any,
    headers: MessageHeaders,
    correlationId?: string,
    replyTo?: string,
  ): Message {
    return new Message(
      crypto.randomUUID(),
      type,
      payload,
      headers,
      correlationId || crypto.randomUUID(),
      new Date(),
      replyTo,
    );
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      payload: this.payload,
      headers: this.headers,
      correlationId: this.correlationId,
      timestamp: this.timestamp.toISOString(),
      replyTo: this.replyTo,
    };
  }

  isExpired(ttlMs: number): boolean {
    return Date.now() - this.timestamp.getTime() > ttlMs;
  }
}

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  COMMAND = 'command',
  EVENT = 'event',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
}

export interface MessageHeaders {
  source: string;
  destination?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  ttl?: number;
  contentType?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: any;
}