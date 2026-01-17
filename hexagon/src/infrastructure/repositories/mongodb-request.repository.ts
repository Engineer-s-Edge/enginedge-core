import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IRequestRepository } from '@application/ports/request-repository.port';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { WorkerAssignment } from '@domain/entities/worker-assignment.entity';

interface RequestDocument {
  id: string;
  userId: string;
  workflow: string;
  status: string;
  data: Record<string, unknown>;
  workers: any[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  correlationId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class MongoDbRequestRepository implements IRequestRepository {
  constructor(
    @InjectModel('OrchestrationRequest')
    private readonly requestModel: Model<RequestDocument>
  ) {}

  async save(request: OrchestrationRequest): Promise<void> {
    const doc = {
      id: request.id,
      userId: request.userId,
      workflow: request.workflow,
      status: request.status,
      data: request.data,
      workers: request.workers.map((w) => ({
        id: w.id,
        workerId: w.workerId,
        workerType: w.workerType,
        status: w.status,
        requestId: w.requestId,
        response: w.response,
        error: w.error,
        startedAt: w.startedAt,
        completedAt: w.completedAt,
        retryCount: w.retryCount,
        maxRetries: w.maxRetries,
      })),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      completedAt: request.completedAt,
      result: request.result,
      error: request.error,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
    };

    await this.requestModel.findOneAndUpdate({ id: request.id }, doc, {
      upsert: true,
      new: true,
    });
  }

  async findById(id: string): Promise<OrchestrationRequest | null> {
    const doc = await this.requestModel.findOne({ id }).exec();
    if (!doc) return null;
    return this.mapToEntity(doc);
  }

  async findByUserId(userId: string): Promise<OrchestrationRequest[]> {
    const docs = await this.requestModel.find({ userId }).exec();
    return docs.map((doc) => this.mapToEntity(doc));
  }

  async updateStatus(id: string, status: string, result?: unknown, error?: string): Promise<void> {
    const update: any = { status, updatedAt: new Date() };
    if (result !== undefined) update.result = result;
    if (error) update.error = error;
    if (status === 'completed' || status === 'failed') {
      update.completedAt = new Date();
    }
    await this.requestModel.findOneAndUpdate({ id }, update);
  }

  private mapToEntity(doc: RequestDocument): OrchestrationRequest {
    const request = new OrchestrationRequest(doc.id, doc.userId, doc.workflow as any, doc.data);
    request.status = doc.status as any;
    request.createdAt = doc.createdAt;
    request.updatedAt = doc.updatedAt;
    request.completedAt = doc.completedAt;
    request.result = doc.result;
    request.error = doc.error;
    request.correlationId = doc.correlationId;
    request.idempotencyKey = doc.idempotencyKey;

    doc.workers.forEach((w) => {
      const assignment = new WorkerAssignment(
        w.id,
        w.workerId,
        w.workerType,
        w.requestId,
        w.maxRetries
      );
      assignment.status = w.status;
      assignment.response = w.response;
      assignment.error = w.error;
      assignment.startedAt = w.startedAt;
      assignment.completedAt = w.completedAt;
      assignment.retryCount = w.retryCount;
      request.workers.push(assignment);
    });

    return request;
  }
}
