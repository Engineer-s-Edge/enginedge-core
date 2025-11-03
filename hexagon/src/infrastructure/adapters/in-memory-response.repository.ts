import { Response } from '../../domain/entities/response';
import { IResponseRepository } from '../../application/ports/interfaces';

export class InMemoryResponseRepository implements IResponseRepository {
  private responses = new Map<string, Response[]>();

  async save(response: Response): Promise<void> {
    const responses = this.responses.get(response.requestId) || [];
    responses.push(response);
    this.responses.set(response.requestId, responses);
  }

  async findByRequestId(requestId: string): Promise<Response[]> {
    return this.responses.get(requestId) || [];
  }

  async findLatestByRequestId(requestId: string): Promise<Response | null> {
    const responses = this.responses.get(requestId) || [];
    return responses.length > 0 ? responses[responses.length - 1] : null;
  }
}
