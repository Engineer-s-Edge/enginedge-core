import { DatalakeProxyController } from './datalake.controller';
import { ProxyService } from './proxy.service';

describe('DatalakeProxyController', () => {
  let controller: DatalakeProxyController;
  let proxyService: ProxyService;

  beforeEach(() => {
    proxyService = { forward: jest.fn() } as any;
    controller = new DatalakeProxyController(proxyService);
  });

  const req = {
    params: { '0': 'some/path' },
    method: 'GET',
    body: {},
    headers: { authorization: 'Bearer token' },
    query: { q: 'search' },
  };

  it('should forward minio requests', async () => {
    await controller.forwardMinio(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('minio:9001'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });

  it('should forward trino requests', async () => {
    await controller.forwardTrino(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('trino:8080'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });

  it('should forward airflow requests', async () => {
    await controller.forwardAirflow(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('airflow:8080'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });

  it('should forward jupyter requests', async () => {
    await controller.forwardJupyter(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('jupyter:8888'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });

  it('should forward spark requests', async () => {
    await controller.forwardSpark(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('spark-master:8080'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });

  it('should forward marquez requests', async () => {
    await controller.forwardMarquez(req);
    expect(proxyService.forward).toHaveBeenCalledWith(
      expect.stringContaining('marquez-web:3000'),
      'some/path',
      'GET',
      req.body,
      req.headers,
      req.query
    );
  });
});
