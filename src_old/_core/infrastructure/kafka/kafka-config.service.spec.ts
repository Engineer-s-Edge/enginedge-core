import { KafkaConfigService } from './kafka-config.service';
import { ConfigService } from '@nestjs/config';
import { logLevel } from 'kafkajs';
import { MyLogger } from '../../services/logger/logger.service';

const makeLogger = (): Partial<MyLogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
});

describe('KafkaConfigService', () => {
  let service: KafkaConfigService;
  let config: Partial<Record<string, string>>;

  beforeEach(() => {
    config = {};
    const cfg = {
      get: jest.fn((key: string, def?: any) =>
        key in (config as any) ? (config as any)[key] : def,
      ),
    } as unknown as ConfigService;
    service = new KafkaConfigService(cfg, makeLogger() as any);
  });

  it('builds default kafka options when env not set', () => {
    const opts = service.createKafkaOptions();
    expect(opts.clientId).toBe('enginedge-main-node');
    expect(opts.groupId).toBe('enginedge-calendar-ml');
    expect(opts.brokers).toEqual(['localhost:9092']);
    expect(opts.sasl).toBeUndefined();
    expect(opts.ssl).toBeUndefined();
  });

  it('enables ssl and sasl when env set', () => {
    (config as any)['KAFKA_SSL_ENABLED'] = 'true';
    (config as any)['KAFKA_SASL_MECHANISM'] = 'plain';
    (config as any)['KAFKA_SASL_USERNAME'] = 'u';
    (config as any)['KAFKA_SASL_PASSWORD'] = 'p';
    const opts = service.createKafkaOptions();
    expect(opts.ssl).toBe(true);
    expect(opts.sasl).toEqual({
      mechanism: 'plain',
      username: 'u',
      password: 'p',
    });
  });

  it('maps log level correctly and produces kafka config', () => {
    (config as any)['KAFKA_LOG_LEVEL'] = 'DEBUG';
    const cfg = service.getKafkaConfig();
    expect(cfg.logLevel).toBe(logLevel.DEBUG);
    expect(cfg.clientId).toBeDefined();
    expect(cfg.brokers).toBeDefined();
  });

  it('returns producer and consumer configs with retry and partitioner', () => {
    const prod = service.getProducerConfig();
    expect(prod.idempotent).toBe(true);
    expect(prod.retry?.retries).toBeGreaterThan(0);
    const cons = service.getConsumerConfig();
    expect(cons.groupId).toBeDefined();
    expect(cons.retry?.retries).toBeGreaterThan(0);
  });
});
