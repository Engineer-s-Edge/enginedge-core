import { LatexProxyController } from './latex.controller';
import { ProxyService } from './proxy.service';

describe('LatexProxyController', () => {
  let controller: LatexProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new LatexProxyController(proxyService);
  });

  it('should forward request to latex worker', async () => {
    const req = {
      params: { '0': 'compile' },
      method: 'POST',
      body: { tex: '' },
      headers: {},
      query: {},
    };
    await controller.forward(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('latex-worker'),
      'compile',
      'POST',
      req.body,
      req.headers,
      req.query,
    );
  });
});
