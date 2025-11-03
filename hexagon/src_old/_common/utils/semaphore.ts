/**
 * Semaphore for concurrency control
 * 
 * A simple semaphore implementation for TypeScript/Node.js
 * Used to limit concurrent operations (e.g., max 10 Expert Agents running simultaneously)
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore permits must be at least 1');
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit
   * If no permits available, waits until one becomes available
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit
   * If any waiters in queue, wakes up the first one
   */
  release(): void {
    this.permits++;

    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.permits--;
        resolve();
      }
    }
  }

  /**
   * Try to acquire without waiting
   * Returns true if acquired, false if not available
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Get current available permits
   */
  available(): number {
    return this.permits;
  }

  /**
   * Get number of waiters in queue
   */
  queueLength(): number {
    return this.queue.length;
  }

  /**
   * Execute a function with automatic acquire/release
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
