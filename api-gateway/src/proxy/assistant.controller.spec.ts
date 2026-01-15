import { AssistantProxyController } from './assistant.controller';
import { ProxyService } from './proxy.service';

describe('AssistantProxyController', () => {
  let controller: AssistantProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new AssistantProxyController(proxyService);
  });

  it('should forward request to proxy service', async () => {
    const req = {
      params: { '0': 'ask' },
      method: 'POST',
      body: { query: 'test' },
      headers: { authorization: 'Bearer token' },
      query: { lang: 'en' },
    };
    (proxyService.forward as jest.Mock).mockResolvedValue({ result: 'ok' });

    const result = await controller.forward(req);

    expect(result).toEqual({ result: 'ok' });
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('assistant-worker'), // Default or env
      'ask',
      'POST',
      req.body,
      req.headers,
      req.query
    );
  });
});
