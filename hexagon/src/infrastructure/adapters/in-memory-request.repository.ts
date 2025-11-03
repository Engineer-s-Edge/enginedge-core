import { Request } from '../../domain/entities/request';
import { IRequestRepository } from '../../application/ports/interfaces';

export class InMemoryRequestRepository implements IRequestRepository {
  private requests = new Map<string, Request>();

  async save(request: Request): Promise<void> {
    this.requests.set(request.id, request);
  }

  async findById(id: string): Promise<Request | null> {
    return this.requests.get(id) || null;
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const request = this.requests.get(id);
    if (request) {
      // In a real implementation, we'd update the status
      // For now, just log it
      console.log(`Updated request ${id} status to ${status}`);
    }
  }

  async findPending(): Promise<Request[]> {
    return Array.from(this.requests.values()).filter(
      (r) =>
        // In a real implementation, we'd check status
        true, // Placeholder
    );
  }
}
