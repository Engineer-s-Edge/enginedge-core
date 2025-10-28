import { KafkaMLConsumer } from './kafka-ml.consumer';
import { MyLogger } from '../../services/logger/logger.service';

const makeLogger = (): Partial<MyLogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('KafkaMLConsumer', () => {
  let consumer: KafkaMLConsumer;
  const kafkaService = {} as any; // Not used directly here
  const logger = makeLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new KafkaMLConsumer(kafkaService, logger as any);
  });

  const baseTrigger = {
    userId: 'u1',
    eventCount: 3,
    lastEventTimestamp: new Date().toISOString(),
    metadata: {
      triggeredAt: new Date().toISOString(),
      reason: 'test',
      correlationId: 'c1',
    },
  } as const;

  it('handles retrain, update, and refresh paths', async () => {
    await consumer.handleMLTrigger({
      ...baseTrigger,
      triggerType: 'retrain_model',
    });
    await consumer.handleMLTrigger({
      ...baseTrigger,
      triggerType: 'update_predictions',
    });
    await consumer.handleMLTrigger({
      ...baseTrigger,
      triggerType: 'refresh_recommendations',
    });
    expect(logger.info).toHaveBeenCalled();
  });

  it('logs warning for unknown trigger type', async () => {
    await consumer.handleMLTrigger({
      ...baseTrigger,
      triggerType: 'unknown' as any,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('propagates error when handlers throw', async () => {
    // Spy on private method via any cast to throw
    const spy = jest
      .spyOn<any, any>(consumer as any, 'handleModelRetraining')
      .mockRejectedValueOnce(new Error('boom'));
    await expect(
      consumer.handleMLTrigger({
        ...baseTrigger,
        triggerType: 'retrain_model',
      }),
    ).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
    spy.mockRestore();
  });
});
