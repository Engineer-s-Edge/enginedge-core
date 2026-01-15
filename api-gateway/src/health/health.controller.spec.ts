import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return ok status', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
