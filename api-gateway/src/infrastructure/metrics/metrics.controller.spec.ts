import { MetricsController } from './metrics.controller';
import { Registry } from 'prom-client';

jest.mock('prom-client');

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockRegistry: any;

  beforeEach(() => {
    mockRegistry = {
      metrics: jest.fn().mockResolvedValue('metrics data'),
    };

    controller = new MetricsController(mockRegistry);
  });

  it('should return metrics', async () => {
    const result = await controller.metrics();
    expect(result).toBe('metrics data');
    expect(mockRegistry.metrics).toHaveBeenCalled();
  });
});
