import { Injectable } from '@nestjs/common';
import { KafkaService, MLTriggerEvent } from './kafka.service';
import { MyLogger } from '../../services/logger/logger.service';

@Injectable()
export class KafkaMLConsumer {
  constructor(
    private readonly kafkaService: KafkaService,
    private readonly logger: MyLogger,
  ) {}

  /**
   * Handle ML pipeline trigger events
   */
  async handleMLTrigger(trigger: MLTriggerEvent): Promise<void> {
    this.logger.info(
      `Processing ML trigger: ${trigger.triggerType} for user ${trigger.userId}`,
      KafkaMLConsumer.name,
    );

    try {
      switch (trigger.triggerType) {
        case 'retrain_model':
          await this.handleModelRetraining(trigger);
          break;
        case 'update_predictions':
          await this.handlePredictionUpdate(trigger);
          break;
        case 'refresh_recommendations':
          await this.handleRecommendationRefresh(trigger);
          break;
        default:
          this.logger.warn(
            `Unknown ML trigger type: ${trigger.triggerType}`,
            KafkaMLConsumer.name,
          );
      }
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to process ML trigger for user ${trigger.userId}:`,
        e.stack,
        KafkaMLConsumer.name,
      );
      throw e;
    }
  }

  private async handleModelRetraining(trigger: MLTriggerEvent): Promise<void> {
    this.logger.info(
      `Model retraining requested for user ${trigger.userId}`,
      KafkaMLConsumer.name,
    );

    // Instead of directly calling the ML service, we'll emit events that can be handled
    // by other parts of the system that have access to the ML service
    this.logger.info(
      `ML retraining trigger processed: ${trigger.triggerType} - ${trigger.metadata.reason}`,
      KafkaMLConsumer.name,
    );

    // Future: Implement event emission or message passing to ML service
    // This could be done through a separate event bus or message queue
  }

  private async handlePredictionUpdate(trigger: MLTriggerEvent): Promise<void> {
    this.logger.info(
      `Prediction update requested for user ${trigger.userId}`,
      KafkaMLConsumer.name,
    );

    // Log the trigger for now - in a full implementation this would
    // trigger the appropriate ML pipeline updates
    this.logger.info(
      `ML prediction update processed: ${trigger.triggerType} - ${trigger.metadata.reason}`,
      KafkaMLConsumer.name,
    );
  }

  private async handleRecommendationRefresh(
    trigger: MLTriggerEvent,
  ): Promise<void> {
    this.logger.info(
      `Recommendation refresh requested for user ${trigger.userId}`,
      KafkaMLConsumer.name,
    );

    // Log the trigger for now - in a full implementation this would
    // refresh the user's recommendations
    this.logger.info(
      `ML recommendation refresh processed: ${trigger.triggerType} - ${trigger.metadata.reason}`,
      KafkaMLConsumer.name,
    );
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      service: 'KafkaMLConsumer',
      status: 'active',
      supportedTriggers: [
        'retrain_model',
        'update_predictions',
        'refresh_recommendations',
      ],
    };
  }
}
