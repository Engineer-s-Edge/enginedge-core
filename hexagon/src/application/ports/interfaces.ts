import { Request } from '../../domain/entities/request';
import { Worker } from '../../domain/entities/worker';
import { Message } from '../../domain/entities/message';
import { Response } from '../../domain/entities/response';

export interface IWorkerRepository {
  findById(id: string): Promise<Worker | null>;
  findByType(type: string): Promise<Worker[]>;
  findAvailable(): Promise<Worker[]>;
  save(worker: Worker): Promise<void>;
  updateStatus(id: string, status: string): Promise<void>;
  updateHeartbeat(id: string): Promise<void>;
}

export interface IMessagePublisher {
  publish(message: Message): Promise<void>;
  publishToWorker(workerId: string, message: Message): Promise<void>;
  subscribeToResponses(handler: (message: Message) => void): void;
}

export interface IRequestRepository {
  save(request: Request): Promise<void>;
  findById(id: string): Promise<Request | null>;
  updateStatus(id: string, status: string): Promise<void>;
  findPending(): Promise<Request[]>;
}

export interface IResponseRepository {
  save(response: Response): Promise<void>;
  findByRequestId(requestId: string): Promise<Response[]>;
  findLatestByRequestId(requestId: string): Promise<Response | null>;
}

export interface IWorkerCoordinator {
  assignRequest(request: Request, worker: Worker): Promise<void>;
  releaseWorker(workerId: string): Promise<void>;
  getWorkerLoad(workerId: string): Promise<number>;
}