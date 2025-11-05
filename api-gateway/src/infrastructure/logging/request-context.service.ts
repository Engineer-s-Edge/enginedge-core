import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  serviceName?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  runWith<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
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
}
