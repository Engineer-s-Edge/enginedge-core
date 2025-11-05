import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { LogContext } from './logger.port';

export interface RequestContextStore extends LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  workerType?: string;
  serviceName?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  runWith<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  async runWithAsync<T>(store: RequestContextStore, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(store, callback);
  }

  set<K extends keyof RequestContextStore>(key: K, value: RequestContextStore[K]): void {
    const store = this.storage.getStore();
    if (store) {
      store[key] = value as any;
    }
  }

  get<K extends keyof RequestContextStore>(key: K): RequestContextStore[K] | undefined {
    const store = this.storage.getStore();
    return store ? (store[key] as any) : undefined;
  }

  getStore(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.get('requestId');
  }

  getCorrelationId(): string | undefined {
    return this.get('correlationId');
  }

  getUserId(): string | undefined {
    return this.get('userId');
  }

  getServiceName(): string | undefined {
    return this.get('serviceName');
  }

  getWorkerType(): string | undefined {
    return this.get('workerType');
  }
}


