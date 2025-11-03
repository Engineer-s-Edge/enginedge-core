import { Request } from '../../domain/entities/request';
import { Response } from '../../domain/entities/response';
import { Message, MessageType } from '../../domain/entities/message';
import { RequestRouter } from '../../domain/services/request-router';
import { IWorkerRepository } from '../ports/interfaces';
import { IMessagePublisher } from '../ports/interfaces';
import { IRequestRepository } from '../ports/interfaces';
import { IResponseRepository } from '../ports/interfaces';

export class HandleRequestUseCase {
  constructor(
    private readonly workerRepository: IWorkerRepository,
    private readonly messagePublisher: IMessagePublisher,
    private readonly requestRepository: IRequestRepository,
    private readonly responseRepository: IResponseRepository,
    private readonly requestRouter: RequestRouter,
  ) {}

  async execute(request: Request): Promise<Response> {
    // Save the request
    await this.requestRepository.save(request);

    // Find available workers
    const availableWorkers = await this.workerRepository.findAvailable();

    // Route to appropriate worker
    const targetWorker = this.requestRouter.route(request, availableWorkers);

    if (!targetWorker) {
      const errorResponse = Response.error(request.id, {
        code: 'NO_WORKER_AVAILABLE',
        message: 'No suitable worker available for this request type',
      });
      await this.responseRepository.save(errorResponse);
      return errorResponse;
    }

    // Create message to send to worker
    const message = Message.create(
      MessageType.REQUEST,
      request.payload,
      {
        source: 'orchestrator',
        destination: targetWorker.id,
        correlationId: request.id,
        priority: request.metadata.priority || 'normal',
        contentType: 'application/json',
        userId: request.metadata.userId,
        sessionId: request.metadata.sessionId,
      },
      request.id,
    );

    try {
      // Publish message to worker
      await this.messagePublisher.publishToWorker(targetWorker.id, message);

      // Update request status
      await this.requestRepository.updateStatus(request.id, 'processing');

      // For now, return a pending response
      // In a real implementation, we'd wait for the worker response asynchronously
      const pendingResponse = new Response(
        crypto.randomUUID(),
        request.id,
        'pending' as any,
        null,
        {},
        new Date(),
      );

      return pendingResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorResponse = Response.error(request.id, {
        code: 'MESSAGE_PUBLISH_FAILED',
        message: 'Failed to send request to worker',
        details: errorMessage,
      });
      await this.responseRepository.save(errorResponse);
      return errorResponse;
    }
  }
}