import { Test, TestingModule } from '@nestjs/testing';
import { KafkaService, MLTriggerEvent } from './kafka.service';
import { KafkaConfigService } from './kafka-config.service';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../../services/logger/logger.service';
import { MLPipelineTriggerHandler } from './handlers/ml-pipeline-trigger.handler';
import { Kafka, Producer, Consumer, Admin } from 'kafkajs';

jest.mock('kafkajs');
jest.mock('../../services/logger/logger.service');
jest.mock('./kafka-config.service');
jest.mock('./handlers/ml-pipeline-trigger.handler');

describe('KafkaService', () => {
  let service: KafkaService;
  let producer: DeepMocked<Producer>;
  let consumer: DeepMocked<Consumer>;
  let admin: DeepMocked<Admin>;
  let mlPipelineTriggerHandler: DeepMocked<MLPipelineTriggerHandler>;

  type DeepMocked<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
      ? jest.Mock<ReturnType<T[K]>, Parameters<T[K]>>
      : T[K];
  };

  beforeEach(async () => {
    producer = {
      connect: jest.fn(),
      send: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    consumer = {
      connect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    admin = {
      connect: jest.fn(),
      listTopics: jest.fn(),
      createTopics: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const kafkaInstance = {
      producer: jest.fn(() => producer),
      consumer: jest.fn(() => consumer),
      admin: jest.fn(() => admin),
    };

    (Kafka as jest.Mock).mockImplementation(() => kafkaInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        KafkaConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KAFKA_ENABLED') return 'true';
              if (key === 'kafka.topics') {
                return {
                  calendarEvents: 'calendar-events',
                  mlPipelineTriggers: 'ml-pipeline-triggers',
                  calendarPredictions: 'calendar-predictions',
                  userActivity: 'user-activity',
                  commands: 'commands',
                  results: 'results',
                  workerStatus: 'worker-status',
                };
              }
              return null;
            }),
          },
        },
        MyLogger,
        MLPipelineTriggerHandler,
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
    mlPipelineTriggerHandler = module.get(MLPipelineTriggerHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize Kafka and connect producer, consumer, and admin', async () => {
      admin.listTopics.mockResolvedValue([]);
      await service.onModuleInit();
      expect(producer.connect).toHaveBeenCalled();
      expect(consumer.connect).toHaveBeenCalled();
      expect(admin.connect).toHaveBeenCalled();
    });
  });

  describe('publishCalendarEvent', () => {
    it('should send a calendar event to Kafka', async () => {
      await service.onModuleInit();
      (service as any).isConnected = true;
      (service as any).producer = producer;

      const event = {
        eventId: '1',
        userId: 'user1',
        eventType: 'event_created',
      } as any;
      await service.publishCalendarEvent(event);

      expect(producer.send).toHaveBeenCalledWith({
        topic: service['topics'].calendarEvents,
        messages: expect.any(Array),
        acks: -1,
        timeout: 30000,
      });
    });
  });

  describe('handleMessage', () => {
    it('should call the correct handler for a message', async () => {
      const trigger: MLTriggerEvent = {
        userId: 'user1',
        triggerType: 'retrain_model',
        eventCount: 1,
        lastEventTimestamp: new Date().toISOString(),
        metadata: {
          triggeredAt: new Date().toISOString(),
          reason: 'test',
          correlationId: 'test-id',
        },
      };
      const message = { value: Buffer.from(JSON.stringify(trigger)) };

      await (service as any).handleMessage(
        service['topics'].mlPipelineTriggers,
        0,
        message,
      );

      expect(mlPipelineTriggerHandler.handle).toHaveBeenCalledWith(trigger);
    });

    it('should send a message to the DLQ after multiple failures', async () => {
      (service as any).isConnected = true;
      (service as any).producer = producer;
      mlPipelineTriggerHandler.handle.mockRejectedValue(
        new Error('Processing failed'),
      );

      const trigger: MLTriggerEvent = {
        userId: 'user1',
        triggerType: 'retrain_model',
        eventCount: 1,
        lastEventTimestamp: new Date().toISOString(),
        metadata: {
          triggeredAt: new Date().toISOString(),
          reason: 'test',
          correlationId: 'test-id',
        },
      };
      const message = { value: Buffer.from(JSON.stringify(trigger)) };

      await (service as any).handleMessage(
        service['topics'].mlPipelineTriggers,
        0,
        message,
      );

      expect(mlPipelineTriggerHandler.handle).toHaveBeenCalledTimes(3);
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: `${service['topics'].mlPipelineTriggers}-dlq`,
        }),
      );
    });
  });
});
