import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  it('should return metrics', async () => {
    const registry = { metrics: jest.fn().mockResolvedValue('metrics_output') };
    const controller = new MetricsController(registry as any);
    expect(await controller.getMetrics()).toBe('metrics_output');
  });
});
