import { KafkaLoggerService } from './kafka-logger.service';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';
import { Kafka } from 'kafkajs';
import * as fs from 'fs';

jest.mock('kafkajs');
jest.mock('fs');

describe('KafkaLoggerService', () => {
  let service: KafkaLoggerService;
  let mockConfigService: any;
  let mockRequestContextService: any;
  let mockProducer: any;
  let mockKafka: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn(),
    };

    // Mock RequestContextService
    mockRequestContextService = {
      getStore: jest.fn(),
    };

    // Mock Kafka
    mockProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest
        .fn()
        .mockResolvedValue([{ topicName: 'test', partition: 0, errorCode: 0 }]),
    };
    mockKafka = {
      producer: jest.fn().mockReturnValue(mockProducer),
    };
    (Kafka as unknown as jest.Mock).mockImplementation(() => mockKafka);

    // Mock fs
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.appendFileSync as jest.Mock).mockImplementation(() => {});

    service = new KafkaLoggerService(
      mockConfigService as ConfigService,
      mockRequestContextService as RequestContextService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(Kafka).toHaveBeenCalled();
    expect(mockKafka.producer).toHaveBeenCalled();
  });

  describe('connect', () => {
    it('should connect to kafka on init', async () => {
      // connection happens in constructor but is async.
      // We wait a bit or grab the promise if exposed?
      // It's not exposed. But connect calls this.producer.connect()
      // So we expect producer.connect to have been called.

      // Flush async constructor
      await Promise.resolve();
      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      mockProducer.connect.mockRejectedValue(new Error('Connection failed'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Re-instantiate
      service = new KafkaLoggerService(
        mockConfigService as ConfigService,
        mockRequestContextService as RequestContextService,
      );

      await Promise.resolve();
      await Promise.resolve(); // Extra tick for catch block
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot connect to Kafka'),
      );
    });
  });

  // Test log methods if possible
  // The class implements LoggerService: log, error, warn
  describe('logging', () => {
    it('should send log to kafka if connected', async () => {
      // First ensure connected
      await Promise.resolve();

      // Simulate connection state: internal property connected=true
      // We can't easily access private property 'connected' without cast
      (service as any).connected = true;

      service.log('test message');

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'enginedge.logs.worker.api-gateway',
          messages: expect.arrayContaining([
            expect.objectContaining({
              value: expect.stringContaining('test message'),
            }),
          ]),
        }),
      );
    });

    it('should buffer to file if disconnected', async () => {
      (service as any).connected = false;

      service.log('buffered message');

      expect(fs.appendFileSync).toHaveBeenCalled();
    });
  });
});
