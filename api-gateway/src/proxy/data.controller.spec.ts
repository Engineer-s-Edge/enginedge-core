import { DataProxyController } from './data.controller';
import { ProxyService } from './proxy.service';

describe('DataProxyController', () => {
  let controller: DataProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new DataProxyController(proxyService);
  });

  it('should forward request to data processing worker', async () => {
    const req = {
      params: { '0': 'api/process' },
      method: 'POST',
      body: { data: 'test' },
      headers: {},
      query: {},
    };
    await controller.forward(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('data-processing-worker'),
      'api/process',
      'POST',
      req.body,
      req.headers,
      req.query
    );
  });
});
