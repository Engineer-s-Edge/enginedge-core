import { ToolsProxyController } from './tools.controller';
import { ProxyService } from './proxy.service';

describe('ToolsProxyController', () => {
  let controller: ToolsProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new ToolsProxyController(proxyService);
  });

  it('should forward request to tools worker', async () => {
    const req = {
      params: { '0': 'execute' },
      method: 'POST',
      body: { tool: 'search' },
      headers: {},
      query: {},
    };
    await controller.forward(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('agent-tool-worker'),
      'execute',
      'POST',
      req.body,
      req.headers,
      req.query
    );
  });
});
