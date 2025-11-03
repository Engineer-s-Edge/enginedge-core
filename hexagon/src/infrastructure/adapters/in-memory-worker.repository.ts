import { Worker, WorkerStatus } from '../../domain/entities/worker';
import { IWorkerRepository } from '../../application/ports/interfaces';

export class InMemoryWorkerRepository implements IWorkerRepository {
  private workers = new Map<string, Worker>();

  async findById(id: string): Promise<Worker | null> {
    return this.workers.get(id) || null;
  }

  async findByType(type: string): Promise<Worker[]> {
    return Array.from(this.workers.values()).filter((w) => w.type === type);
  }

  async findAvailable(): Promise<Worker[]> {
    return Array.from(this.workers.values()).filter(
      (w) => w.isAvailable() && w.isHealthy(),
    );
  }

  async save(worker: Worker): Promise<void> {
    this.workers.set(worker.id, worker);
  }

  async updateStatus(id: string, status: WorkerStatus): Promise<void> {
    const worker = this.workers.get(id);
    if (worker) {
      const updatedWorker = worker.updateStatus(status);
      this.workers.set(id, updatedWorker);
    }
  }

  async updateHeartbeat(id: string): Promise<void> {
    const worker = this.workers.get(id);
    if (worker) {
      const updatedWorker = worker.updateHeartbeat();
      this.workers.set(id, updatedWorker);
    }
  }
}
