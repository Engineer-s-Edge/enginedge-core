import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  runWith<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  set<K extends keyof RequestContextStore>(
    key: K,
    value: RequestContextStore[K],
  ): void {
    const store = this.storage.getStore();
    if (store) {
      store[key] = value as any;
    }
  }

  get<K extends keyof RequestContextStore>(
    key: K,
  ): RequestContextStore[K] | undefined {
    const store = this.storage.getStore();
    return store ? (store[key] as any) : undefined;
  }

  getRequestId(): string | undefined {
    return this.get('requestId');
  }
}
