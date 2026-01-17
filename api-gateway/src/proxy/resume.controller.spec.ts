import { ResumeProxyController } from './resume.controller';
import { ProxyService } from './proxy.service';

describe('ResumeProxyController', () => {
  let controller: ResumeProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new ResumeProxyController(proxyService);
  });

  it('should forward request to resume worker', async () => {
    const req = {
      params: { '0': 'analyze' },
      method: 'POST',
      body: { resume: '...' },
      headers: {},
      query: {},
    };
    await controller.forward(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('resume-worker'),
      'analyze',
      'POST',
      req.body,
      req.headers,
      req.query,
    );
  });
});
