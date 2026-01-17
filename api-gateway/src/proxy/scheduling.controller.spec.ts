import {
  SchedulingProxyController,
  CalendarProxyController,
} from './scheduling.controller';
import { ProxyService } from './proxy.service';

describe('SchedulingProxyControllers', () => {
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
  });

  describe('SchedulingProxyController', () => {
    let controller: SchedulingProxyController;
    beforeEach(() => {
      controller = new SchedulingProxyController(proxyService);
    });

    it('should forward request to scheduling worker', async () => {
      const req = {
        params: { '0': 'schedule' },
        method: 'POST',
        body: {},
        headers: {},
        query: {},
      };
      await controller.forward(req);
      expect(proxyService.forward).toHaveBeenCalledWith(
        expect.stringContaining('scheduling-worker'),
        'schedule',
        'POST',
        req.body,
        req.headers,
        req.query,
      );
    });
  });

  describe('CalendarProxyController', () => {
    let controller: CalendarProxyController;
    beforeEach(() => {
      controller = new CalendarProxyController(proxyService);
    });

    it('should forward request to scheduling worker (calendar)', async () => {
      const req = {
        params: { '0': 'events' },
        method: 'GET',
        body: {},
        headers: {},
        query: {},
      };
      await controller.forward(req);
      expect(proxyService.forward).toHaveBeenCalledWith(
        expect.stringContaining('scheduling-worker'),
        'events',
        'GET',
        req.body,
        req.headers,
        req.query,
      );
    });
  });
});
