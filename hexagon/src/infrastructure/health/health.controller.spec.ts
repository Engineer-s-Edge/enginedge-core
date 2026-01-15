import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should return ok', () => {
    const controller = new HealthController();
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
