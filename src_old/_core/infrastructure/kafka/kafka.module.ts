import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaConfigService } from './kafka-config.service';
import { KafkaService } from './kafka.service';
import { CalendarEventPublisher } from './calendar-event.publisher';
import { KafkaMLConsumer } from './kafka-ml.consumer';
import { CoreServicesModule } from '@core/services/core-services.module';
import { MLPipelineTriggerHandler } from './handlers/ml-pipeline-trigger.handler';

@Global()
@Module({
  imports: [ConfigModule, CoreServicesModule],
  providers: [
    KafkaConfigService,
    KafkaService,
    CalendarEventPublisher,
    KafkaMLConsumer,
    MLPipelineTriggerHandler,
  ],
  exports: [KafkaService, CalendarEventPublisher, KafkaMLConsumer],
})
export class KafkaModule {}
