export class Response {
  constructor(
    public readonly id: string,
    public readonly requestId: string,
    public readonly status: ResponseStatus,
    public readonly data: any,
    public readonly metadata: ResponseMetadata,
    public readonly timestamp: Date,
    public readonly error?: ResponseError,
  ) {}

  static success(requestId: string, data: any, metadata: ResponseMetadata = {}): Response {
    return new Response(
      crypto.randomUUID(),
      requestId,
      ResponseStatus.SUCCESS,
      data,
      metadata,
      new Date(),
    );
  }

  static error(requestId: string, error: ResponseError, metadata: ResponseMetadata = {}): Response {
    return new Response(
      crypto.randomUUID(),
      requestId,
      ResponseStatus.ERROR,
      null,
      metadata,
      new Date(),
      error,
    );
  }

  static partial(requestId: string, data: any, metadata: ResponseMetadata = {}): Response {
    return new Response(
      crypto.randomUUID(),
      requestId,
      ResponseStatus.PARTIAL,
      data,
      metadata,
      new Date(),
    );
  }

  isSuccess(): boolean {
    return this.status === ResponseStatus.SUCCESS;
  }

  isError(): boolean {
    return this.status === ResponseStatus.ERROR;
  }

  isPartial(): boolean {
    return this.status === ResponseStatus.PARTIAL;
  }

  toJSON() {
    return {
      id: this.id,
      requestId: this.requestId,
      status: this.status,
      data: this.data,
      error: this.error,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

export enum ResponseStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PARTIAL = 'partial',
  PENDING = 'pending',
  TIMEOUT = 'timeout',
}

export interface ResponseError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface ResponseMetadata {
  processingTimeMs?: number;
  workerId?: string;
  workerType?: string;
  retryCount?: number;
  cacheHit?: boolean;
  [key: string]: any;
}