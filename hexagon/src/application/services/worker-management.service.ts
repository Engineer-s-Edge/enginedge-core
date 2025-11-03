import { Worker, WorkerStatus } from '../../domain/entities/worker';
import { IWorkerRepository } from '../ports/interfaces';

export class WorkerManagementService {
  constructor(private readonly workerRepository: IWorkerRepository) {}

  async registerWorker(worker: Worker): Promise<void> {
    await this.workerRepository.save(worker);
  }

  async updateWorkerStatus(
    workerId: string,
    status: WorkerStatus,
  ): Promise<void> {
    await this.workerRepository.updateStatus(workerId, status);
  }

  async heartbeat(workerId: string): Promise<void> {
    await this.workerRepository.updateHeartbeat(workerId);
  }

  async getAvailableWorkers(): Promise<Worker[]> {
    return this.workerRepository.findAvailable();
  }

  async getWorkersByType(type: string): Promise<Worker[]> {
    return this.workerRepository.findByType(type);
  }

  async getWorkerById(id: string): Promise<Worker | null> {
    return this.workerRepository.findById(id);
  }
}
