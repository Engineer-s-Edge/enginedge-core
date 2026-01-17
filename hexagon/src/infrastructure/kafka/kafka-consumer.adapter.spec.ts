import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaConsumerAdapter } from './kafka-consumer.adapter';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { Logger } from '@nestjs/common';

jest.mock('kafkajs');

describe('KafkaConsumerAdapter', () => {
  let adapter: KafkaConsumerAdapter;
  let mockConsumer: jest.Mocked<Consumer>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockKafka: jest.Mocked<Kafka>;

  // Mock Logger
  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          KAFKA_BROKERS: 'localhost:9092',
          KAFKA_CLIENT_ID: 'test-client',
          KAFKA_GROUP_ID: 'test-group',
        };
        return config[key] || defaultValue;
      }),
    } as any;

    (Kafka as jest.Mock).mockImplementation(() => ({
      consumer: jest.fn().mockReturnValue(mockConsumer),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaConsumerAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .setLogger(mockLogger as any)
      .compile();

    adapter = module.get<KafkaConsumerAdapter>(KafkaConsumerAdapter);

    // Inject mock logger
    // @ts-ignore
    adapter.logger = mockLogger;
  });

  describe('onModuleInit', () => {
    it('should connect consumer successfully', async () => {
      await adapter.onModuleInit();
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Kafka consumer connected');
    });

    it('should handle connection failure gracefully (warn on ECONNREFUSED)', async () => {
      mockConsumer.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      jest.useFakeTimers();

      await adapter.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not available'));

      // Succeed next time
      mockConsumer.connect.mockResolvedValueOnce(undefined);

      // Fix: Use Async Timer handling for promises inside intervals
      await jest.advanceTimersByTimeAsync(11000);

      expect(mockConsumer.connect).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenCalledWith('Kafka consumer reconnected successfully');

      jest.useRealTimers();
    });

    it('should handle generic errors', async () => {
      mockConsumer.connect.mockRejectedValueOnce(new Error('Auth failed'));
      await adapter.onModuleInit();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect Kafka consumer',
        expect.any(Error)
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect if connected', async () => {
      // @ts-ignore
      adapter.connected = true;
      await adapter.onModuleDestroy();
      expect(mockConsumer.disconnect).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      await adapter.onModuleInit();
    });

    it('should subscribe to topic', async () => {
      const handler = jest.fn();
      await adapter.subscribe('test-topic', handler);
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'test-topic',
        fromBeginning: false,
      });
    });

    it('should not subscribe if already subscribed', async () => {
      const handler = jest.fn();
      await adapter.subscribe('test-topic', handler);
      await adapter.subscribe('test-topic', handler);
      expect(mockConsumer.subscribe).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Already subscribed'));
    });

    it('should warn if not connected', async () => {
      // @ts-ignore
      adapter.connected = false;
      await adapter.subscribe('test-topic', jest.fn());
      expect(mockConsumer.subscribe).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('consumer not connected')
      );
    });

    it('should error if consumer already running', async () => {
      // @ts-ignore
      adapter.consumerRunning = true;
      await adapter.subscribe('test-topic', jest.fn());
      expect(mockConsumer.subscribe).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('consumer is already running')
      );
    });
  });

  describe('startConsumer', () => {
    beforeEach(async () => {
      await adapter.onModuleInit();
    });

    it('should start consumer run loop', async () => {
      await adapter.startConsumer();
      expect(mockConsumer.run).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Kafka consumer started and running');
    });

    it('should warn if already running', async () => {
      // @ts-ignore
      adapter.consumerRunning = true;
      await adapter.startConsumer();
      expect(mockConsumer.run).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Consumer is already running');
    });

    it('should warn if not connected', async () => {
      // @ts-ignore
      adapter.connected = false;
      await adapter.startConsumer();
      expect(mockConsumer.run).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start consumer - not connected');
    });

    it('should process messages correctly via run eachMessage handler', async () => {
      // We need to capture the eachMessage callback passed to consumer.run
      let eachMessageHandler: (payload: EachMessagePayload) => Promise<void>;

      mockConsumer.run.mockImplementation(async (config) => {
        if (config && config.eachMessage) {
          eachMessageHandler = config.eachMessage;
        }
        return Promise.resolve();
      });

      const topic = 'test-topic';
      const handler = jest.fn().mockResolvedValue(undefined);
      const messageData = { foo: 'bar' };

      await adapter.subscribe(topic, handler);
      await adapter.startConsumer();

      // Simulate incoming message
      const payload: EachMessagePayload = {
        topic,
        partition: 0,
        message: {
          value: Buffer.from(JSON.stringify(messageData)),
          key: null,
          timestamp: '123',
          attributes: 0,
          offset: '0',
          headers: {},
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      };

      // @ts-ignore
      await eachMessageHandler(payload);

      expect(handler).toHaveBeenCalledWith(messageData);
    });

    it('should handle JSON parse errors in message processing', async () => {
      let eachMessageHandler: (payload: EachMessagePayload) => Promise<void>;

      mockConsumer.run.mockImplementation(async (config) => {
        if (config && config.eachMessage) {
          eachMessageHandler = config.eachMessage;
        }
        return Promise.resolve();
      });

      await adapter.subscribe('test-topic', jest.fn());
      await adapter.startConsumer();

      const payload: EachMessagePayload = {
        topic: 'test-topic',
        partition: 0,
        message: {
          value: Buffer.from('invalid-json'),
          key: null,
          timestamp: '123',
          attributes: 0,
          offset: '0',
          headers: {},
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      };

      // @ts-ignore
      await eachMessageHandler(payload);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing message'),
        expect.any(Error)
      );
    });
  });
});
