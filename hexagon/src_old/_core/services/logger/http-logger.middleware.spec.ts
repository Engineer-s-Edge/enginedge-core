import { HttpLoggerMiddleware } from './http-logger.middleware';
import { RequestContextService } from './request-context.service';
import { MyLogger } from './logger.service';

describe('HttpLoggerMiddleware', () => {
  const context = new RequestContextService();
  const logger: Partial<MyLogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
  const mw = new HttpLoggerMiddleware(context, logger as any);

  function makeReqRes(
    method = 'GET',
    url = '/x',
    status = 200,
    headers: Record<string, string> = {},
  ) {
    const req: any = {
      method,
      url,
      originalUrl: url,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get: (k: string) => (k === 'user-agent' ? 'jest' : undefined),
      headers,
    };
    const listeners: Record<string, Function[]> = {};
    const res: any = {
      statusCode: status,
      setHeader: jest.fn(),
      getHeader: jest.fn(() => '123'),
      on: (event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      _emit: (event: string) => (listeners[event] || []).forEach((fn) => fn()),
    };
    return { req, res };
  }

  it('sets x-request-id header and logs start/finish', () => {
    const { req, res } = makeReqRes();
    const next = jest.fn();
    mw.use(req as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.any(String),
    );
    expect(logger.info).toHaveBeenCalled();
    res._emit('finish');
    expect(logger.info).toHaveBeenCalled();
  });

  it('uses provided correlation id headers', () => {
    const { req, res } = makeReqRes('GET', '/y', 204, {
      'x-correlation-id': 'cid-1',
    } as any);
    const next = jest.fn();
    mw.use(req as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'cid-1');
  });

  it('logs warn for 4xx and error for 5xx on finish', () => {
    const { req, res } = makeReqRes('GET', '/z', 404);
    mw.use(req as any, res as any, jest.fn());
    res._emit('finish');
    expect(logger.warn).toHaveBeenCalled();

    (logger.warn as jest.Mock).mockClear();
    const c = makeReqRes('GET', '/err', 500);
    mw.use(c.req as any, c.res as any, jest.fn());
    c.res._emit('finish');
    expect(logger.error).toHaveBeenCalled();
  });
});
