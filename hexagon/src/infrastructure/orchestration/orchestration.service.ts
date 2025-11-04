import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IKafkaConsumer } from '@application/ports/kafka-consumer.port';
import { HandleWorkerResponseUseCase } from '@application/use-cases/handle-worker-response.use-case';

@Injectable()
export class OrchestrationService implements OnModuleInit {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    @Inject('IKafkaConsumer')
    private readonly kafkaConsumer: IKafkaConsumer,
    private readonly handleWorkerResponse: HandleWorkerResponseUseCase
  ) {}

  async onModuleInit() {
    // Subscribe to worker response topics
    const responseTopics = [
      'job.responses.assistant',
      'job.responses.resume',
      'job.responses.latex',
      'job.responses.agent-tool',
      'job.responses.data-processing',
      'job.responses.interview',
      'job.responses.scheduling',
      // Also support existing worker topics
      'llm.responses',
      'resume.bullet.evaluate.response',
      'resume.posting.extract.response',
      'resume.pdf.parse.response',
      'resume.text.analyze.response',
      'document.process.response',
      'document.search.response',
      'document.upload.response',
      'embedding.generate.response',
      'vector.search.response',
      'ocr.process.response',
    ];

    for (const topic of responseTopics) {
      try {
        await this.kafkaConsumer.subscribe(topic, async (message: any) => {
          await this.handleWorkerMessage(topic, message);
        });
        this.logger.log(`Subscribed to worker response topic: ${topic}`);
      } catch (error) {
        this.logger.error(`Failed to subscribe to topic ${topic}`, error);
      }
    }
  }

  private async handleWorkerMessage(topic: string, message: any): Promise<void> {
    try {
      // Extract request and assignment IDs from message
      const requestId = message.requestId || message.correlationId;
      const assignmentId = message.assignmentId || message.taskId;

      if (!requestId) {
        this.logger.warn(`Message from topic ${topic} missing requestId`, message);
        return;
      }

      // Handle response or error
      if (message.error || message.status === 'error') {
        await this.handleWorkerResponse.execute(
          requestId,
          assignmentId || 'unknown',
          null,
          message.error || message.message || 'Unknown error'
        );
      } else {
        await this.handleWorkerResponse.execute(
          requestId,
          assignmentId || 'unknown',
          message.result || message.data || message
        );
      }
    } catch (error) {
      this.logger.error(`Error handling worker message from topic ${topic}`, error);
    }
  }
}

