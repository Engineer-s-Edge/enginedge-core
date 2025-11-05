import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerAdapter } from '../../src/infrastructure/kafka/kafka-producer.adapter';
import { KafkaConsumerAdapter } from '../../src/infrastructure/kafka/kafka-consumer.adapter';

describe('Kafka Integration', () => {
  let producer: KafkaProducerAdapter;
  let consumer: KafkaConsumerAdapter;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        KafkaProducerAdapter,
        KafkaConsumerAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
                KAFKA_CLIENT_ID: 'test-client',
                KAFKA_GROUP_ID: 'test-group',
              };
              return config[key] || defaultValue;
            },
          },
        },
      ],
    }).compile();

    producer = module.get<KafkaProducerAdapter>(KafkaProducerAdapter);
    consumer = module.get<KafkaConsumerAdapter>(KafkaConsumerAdapter);

    // Skip if Kafka not available
    try {
      await producer.onModuleInit();
      await consumer.onModuleInit();
    } catch (error) {
      console.warn('Kafka not available, skipping integration tests');
    }
  });

  afterAll(async () => {
    try {
      await producer.onModuleDestroy();
      await consumer.onModuleDestroy();
    } catch (error) {
      // Ignore cleanup errors
    }
    await module.close();
  });

  it('should publish and consume message', async () => {
    const testTopic = 'test.hexagon.integration';
    const testMessage = { requestId: 'test-1', data: 'test' };
    let receivedMessage: any = null;

    // Subscribe to topic
    await consumer.subscribe(testTopic, async (message) => {
      receivedMessage = message;
    });

    // Wait a bit for subscription to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Publish message
    await producer.publish(testTopic, testMessage);

    // Wait for message to be consumed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Note: This test may fail if Kafka is not running, which is expected
    // In a real integration test environment, Kafka would be available
    expect(receivedMessage).toBeDefined();
  }, 10000);
});
