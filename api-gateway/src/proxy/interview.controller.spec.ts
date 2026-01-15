import { InterviewProxyController } from './interview.controller';
import { ProxyService } from './proxy.service';

describe('InterviewProxyController', () => {
  let controller: InterviewProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new InterviewProxyController(proxyService);
  });

  it('should forward request to interview worker', async () => {
    const req = {
      params: { '0': 'session/start' },
      method: 'POST',
      body: {},
      headers: {},
      query: {},
    };
    await controller.forward(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('interview-worker'),
      'session/start',
      'POST',
      req.body,
      req.headers,
      req.query
    );
  });
});
