import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrchestrateRequestUseCase } from '@application/use-cases/orchestrate-request.use-case';
import { IRequestRepository } from '@application/ports/request-repository.port';
import { Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { v4 as uuidv4 } from 'uuid';

export class OrchestrateRequestDto {
  workflow?: string;
  data!: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
}

@Controller('orchestrate')
export class OrchestrationController {
  constructor(
    private readonly orchestrateRequest: OrchestrateRequestUseCase,
    @Inject('IRequestRepository')
    private readonly requestRepository: IRequestRepository
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async orchestrate(@Body() body: OrchestrateRequestDto, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId || 'anonymous';
    const correlationId = body.correlationId || req.headers['x-correlation-id'] || uuidv4();

    const request = await this.orchestrateRequest.execute({
      userId,
      workflow: body.workflow,
      data: body.data,
      correlationId,
      idempotencyKey: body.idempotencyKey,
    });

    return {
      requestId: request.id,
      status: request.status,
      estimatedDuration: this.estimateDuration(request.workflow),
      statusUrl: `/api/orchestrate/${request.id}`,
    };
  }

  @Get(':requestId')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('requestId') requestId: string) {
    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    return {
      requestId: request.id,
      status: request.status,
      workflow: request.workflow,
      workers: request.workers.map((w) => ({
        id: w.id,
        workerType: w.workerType,
        status: w.status,
      })),
      result: request.result,
      error: request.error,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      completedAt: request.completedAt,
    };
  }

  private estimateDuration(workflow: string): number {
    // Rough estimates in milliseconds
    const estimates: Record<string, number> = {
      'resume-build': 60000, // 1 minute
      'expert-research': 120000, // 2 minutes
      'conversation-context': 5000, // 5 seconds
      'single-worker': 30000, // 30 seconds
    };
    return estimates[workflow] || 30000;
  }
}
