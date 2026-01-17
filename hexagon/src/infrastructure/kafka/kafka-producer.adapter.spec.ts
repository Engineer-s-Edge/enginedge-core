import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerAdapter } from './kafka-producer.adapter';
import { Kafka, Producer } from 'kafkajs';
import { RequestContextService } from '../logging/shared/request-context.service';
import { Logger } from '@nestjs/common';

jest.mock('kafkajs');

describe('KafkaProducerAdapter', () => {
  let adapter: KafkaProducerAdapter;
  let mockProducer: jest.Mocked<Producer>;
  let mockConfigService: jest.Mocked<ConfigService>;

  // Mock Logger to verify logs
  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

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
            getStore: jest.fn().mockReturnValue({ requestId: 'req-123' }),
          },
        },
      ],
    })
      .setLogger(mockLogger as any)
      .compile();

    adapter = module.get<KafkaProducerAdapter>(KafkaProducerAdapter);

    // Inject mock logger into instance (private property)
    // @ts-ignore
    adapter.logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect producer successfully', async () => {
      await adapter.onModuleInit();
      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Kafka producer connected');
    });

    it('should handle connection failure gracefully (warn on ECONNREFUSED)', async () => {
      mockProducer.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      jest.useFakeTimers();
      await adapter.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not available'));

      // Verify reconnection loop starts
      mockProducer.connect.mockResolvedValueOnce(undefined); // succeed next time
      jest.advanceTimersByTime(11000);

      expect(mockProducer.connect).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle generic connection failure (error)', async () => {
      mockProducer.connect.mockRejectedValueOnce(new Error('Authorization Failed'));
      await adapter.onModuleInit();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect Kafka producer',
        expect.any(Error)
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect if connected', async () => {
      // Manually set connected state
      // @ts-ignore
      adapter.connected = true;

      await adapter.onModuleDestroy();
      expect(mockProducer.disconnect).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Kafka producer disconnected');
    });

    it('should cleanup reconnection interval if active', async () => {
      mockProducer.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      jest.useFakeTimers();

      await adapter.onModuleInit(); // starts interval

      await adapter.onModuleDestroy(); // should clear it

      // Advancing time shouldn't trigger connect anymore
      mockProducer.connect.mockClear();
      jest.advanceTimersByTime(20000);
      expect(mockProducer.connect).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      // Ensure connected for publish tests
      await adapter.onModuleInit();
    });

    it('should publish message to kafka topic', async () => {
      const topic = 'test-topic';
      const message = { data: 'test-data' };

      await adapter.publish(topic, message);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic,
        messages: expect.arrayContaining([
          expect.objectContaining({
            value: JSON.stringify(message),
            headers: expect.objectContaining({
              'x-request-id': 'req-123',
            }),
          }),
        ]),
      });
    });

    it('should not throw when not connected, just log warn', async () => {
      // Disconnect manually
      // @ts-ignore
      adapter.connected = false;

      await adapter.publish('topic', {});

      expect(mockProducer.send).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not connected'));
    });

    it('should propagate errors from producer.send', async () => {
      mockProducer.send.mockRejectedValueOnce(new Error('Send failed'));

      await expect(adapter.publish('topic', {})).rejects.toThrow('Send failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
