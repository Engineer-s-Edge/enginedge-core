import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';

export interface IRequestRepository {
  save(request: OrchestrationRequest): Promise<void>;
  findById(id: string): Promise<OrchestrationRequest | null>;
  findByUserId(userId: string): Promise<OrchestrationRequest[]>;
  updateStatus(
    id: string,
    status: string,
    result?: unknown,
    error?: string
  ): Promise<void>;
}

