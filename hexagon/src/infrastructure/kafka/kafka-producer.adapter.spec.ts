import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerAdapter } from './kafka-producer.adapter';
import { Kafka, Producer } from 'kafkajs';
import { RequestContextService } from '../logging/shared/request-context.service';

jest.mock('kafkajs');

describe('KafkaProducerAdapter', () => {
  let adapter: KafkaProducerAdapter;
  let mockProducer: jest.Mocked<Producer>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          KAFKA_BROKERS: 'localhost:9092',
          KAFKA_CLIENT_ID: 'test-client',
        };
        return config[key] || defaultValue;
      }),
    } as any;

    (Kafka as jest.Mock).mockImplementation(() => ({
      producer: jest.fn().mockReturnValue(mockProducer),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaProducerAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RequestContextService,
          useValue: {
            getRequestId: jest.fn(),
            getCorrelationId: jest.fn(),
            getTraceId: jest.fn(),
            getStore: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    adapter = module.get<KafkaProducerAdapter>(KafkaProducerAdapter);
    await adapter.onModuleInit();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.onModuleDestroy();
    }
  });

  describe('publish', () => {
    it('should publish message to Kafka topic', async () => {
      const message = { requestId: 'req-1', data: 'test' };

      await adapter.publish('test-topic', message);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          expect.objectContaining({
            value: JSON.stringify(message),
            timestamp: expect.any(String),
            headers: expect.any(Object),
          }),
        ],
      });
    });

    it('should not throw error when producer not connected', async () => {
      await adapter.onModuleDestroy();

      await expect(adapter.publish('test-topic', {})).resolves.toBeUndefined();
    });
  });
});
