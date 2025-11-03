import { Injectable } from '@nestjs/common';
import { MyLogger } from '../../../services/logger/logger.service';
import { MLTriggerEvent } from '../kafka.service';

@Injectable()
export class MLPipelineTriggerHandler {
  constructor(private readonly logger: MyLogger) {}

  async handle(trigger: MLTriggerEvent): Promise<void> {
    this.logger.info(
      `Processing ML trigger: ${trigger.triggerType} for user ${trigger.userId}`,
      MLPipelineTriggerHandler.name,
    );

    // The actual ML processing will be handled by the Calendar ML system
    // when it processes the Kafka message. This is just for logging and monitoring.
  }
}
