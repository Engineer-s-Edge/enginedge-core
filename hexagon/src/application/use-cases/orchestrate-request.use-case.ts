import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { OrchestrationRequest } from '@domain/entities/orchestration-request.entity';
import { RequestRouter } from '@domain/services/request-router.service';
import { PatternDetector } from '@domain/services/pattern-detector.service';
import { WorkflowValidator } from '@domain/services/workflow-validator.service';
import { WorkflowType } from '@domain/types/workflow.types';
import { IRequestRepository } from '../ports/request-repository.port';
import { IKafkaProducer } from '../ports/kafka-producer.port';
import { v4 as uuidv4 } from 'uuid';

export interface OrchestrateRequestInput {
  userId: string;
  workflow?: string;
  data: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class OrchestrateRequestUseCase {
  private readonly logger = new Logger(OrchestrateRequestUseCase.name);

  constructor(
    private readonly requestRouter: RequestRouter,
    private readonly patternDetector: PatternDetector,
    private readonly workflowValidator: WorkflowValidator,
    @Inject('IRequestRepository')
    private readonly requestRepository: IRequestRepository,
    @Inject('IKafkaProducer')
    private readonly kafkaProducer: IKafkaProducer
  ) {}

  async execute(input: OrchestrateRequestInput): Promise<OrchestrationRequest> {
    // Create request entity
    const requestId = uuidv4();
    let workflowType: WorkflowType = WorkflowType.CUSTOM;
    
    if (input.workflow) {
      workflowType = input.workflow as WorkflowType;
    }

    // Create request with workflow type
    const request = new OrchestrationRequest(
      requestId,
      input.userId,
      workflowType,
      input.data
    );

    request.correlationId = input.correlationId || uuidv4();
    request.idempotencyKey = input.idempotencyKey;

    // Detect workflow pattern if not specified
    if (!input.workflow) {
      const detectedPattern = this.patternDetector.detectPattern(request);
      request.workflow = detectedPattern;
    }

    // Validate request
    const validation = this.workflowValidator.validate(request);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Determine workers needed
    const assignments = this.requestRouter.route(request);
    assignments.forEach((assignment) => request.addWorkerAssignment(assignment));

    // Save request
    await this.requestRepository.save(request);

    // Publish to Kafka topics
    await this.publishToWorkers(request);

    // Update status to processing
    request.updateStatus('processing' as any, undefined, undefined);
    await this.requestRepository.updateStatus(request.id, 'processing', undefined, undefined);

    this.logger.log(`Orchestration request created: ${requestId}`);
    return request;
  }

  private async publishToWorkers(request: OrchestrationRequest): Promise<void> {
    const topicMapping: Record<string, string> = {
      assistant: 'job.requests.assistant',
      resume: 'job.requests.resume',
      latex: 'job.requests.latex',
      'agent-tool': 'job.requests.agent-tool',
      'data-processing': 'job.requests.data-processing',
      interview: 'job.requests.interview',
      scheduling: 'job.requests.scheduling',
    };

    for (const assignment of request.workers) {
      const topic = topicMapping[assignment.workerType] || `job.requests.${assignment.workerType}`;
      const message = {
        requestId: request.id,
        assignmentId: assignment.id,
        workflow: request.workflow,
        data: request.data,
        correlationId: request.correlationId,
      };

      await this.kafkaProducer.publish(topic, message);
      this.logger.debug(`Published to topic ${topic} for request ${request.id}`);
    }
  }
}

