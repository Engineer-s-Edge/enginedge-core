import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IRequestRepository } from '../ports/request-repository.port';
import { CoordinateMultiWorkerUseCase } from './coordinate-multi-worker.use-case';

@Injectable()
export class HandleWorkerResponseUseCase {
  private readonly logger = new Logger(HandleWorkerResponseUseCase.name);

  constructor(
    @Inject('IRequestRepository')
    private readonly requestRepository: IRequestRepository,
    private readonly coordinateMultiWorker: CoordinateMultiWorkerUseCase,
  ) {}

  async execute(
    requestId: string,
    assignmentId: string,
    response: unknown,
    error?: string,
  ): Promise<void> {
    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      this.logger.warn(
        `Request ${requestId} not found for assignment ${assignmentId}`,
      );
      return;
    }

    // Find and update assignment
    const assignment = request.workers.find((w) => w.id === assignmentId);
    if (!assignment) {
      this.logger.warn(
        `Assignment ${assignmentId} not found in request ${requestId}`,
      );
      return;
    }

    if (error) {
      assignment.fail(error);
    } else {
      assignment.complete(response);
    }

    // Save updated request
    await this.requestRepository.save(request);

    // Check if all workers are done and coordinate
    await this.coordinateMultiWorker.execute(requestId);

    this.logger.log(
      `Worker response processed for assignment ${assignmentId} in request ${requestId}`,
    );
  }
}
