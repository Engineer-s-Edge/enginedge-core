import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IRequestRepository } from '../ports/request-repository.port';
import { ResultAggregationService } from '../services/result-aggregation.service';

@Injectable()
export class CoordinateMultiWorkerUseCase {
  private readonly logger = new Logger(CoordinateMultiWorkerUseCase.name);

  constructor(
    @Inject('IRequestRepository')
    private readonly requestRepository: IRequestRepository,
    private readonly resultAggregationService: ResultAggregationService
  ) {}

  async execute(requestId: string): Promise<void> {
    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    // Check if all workers are complete
    if (!request.allWorkersComplete()) {
      this.logger.debug(`Request ${requestId} still waiting for workers`);
      return;
    }

    // Aggregate results
    const aggregatedResult = this.resultAggregationService.aggregate(request);

    // Update request status
    if (request.workers.some((w) => w.status === 'failed')) {
      await this.requestRepository.updateStatus(
        requestId,
        'failed',
        null,
        'One or more workers failed'
      );
    } else {
      await this.requestRepository.updateStatus(requestId, 'completed', aggregatedResult);
    }

    this.logger.log(`Request ${requestId} completed with aggregated result`);
  }
}

