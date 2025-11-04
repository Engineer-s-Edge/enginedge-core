import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaProducerAdapter } from './kafka-producer.adapter';
import { KafkaConsumerAdapter } from './kafka-consumer.adapter';
import { IKafkaProducer } from '@application/ports/kafka-producer.port';
import { IKafkaConsumer } from '@application/ports/kafka-consumer.port';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IKafkaProducer',
      useClass: KafkaProducerAdapter,
    },
    {
      provide: 'IKafkaConsumer',
      useClass: KafkaConsumerAdapter,
    },
    KafkaProducerAdapter,
    KafkaConsumerAdapter,
  ],
  exports: ['IKafkaProducer', 'IKafkaConsumer', KafkaProducerAdapter, KafkaConsumerAdapter],
})
export class KafkaModule {}

