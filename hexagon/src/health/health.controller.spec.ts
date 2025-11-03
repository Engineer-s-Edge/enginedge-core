import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return basic health payload', () => {
    const result = controller.check();

    expect(result).toBeDefined();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('main-node');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    // ISO string sanity check
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
