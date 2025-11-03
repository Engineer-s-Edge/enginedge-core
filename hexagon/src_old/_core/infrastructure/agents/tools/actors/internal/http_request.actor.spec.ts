jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

jest.mock('axios');
import axios from 'axios';
import { HttpRequestActor } from './http_request.actor';

describe('HttpRequestActor (behavioral, axios mocked)', () => {
  const mockedAxios = axios as jest.MockedFunction<typeof axios>;
  let tool: HttpRequestActor;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new HttpRequestActor();
  });

  const makeAxiosResponse = (overrides: Partial<any> = {}) => ({
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: { ok: true },
    ...overrides,
  });

  const makeError = (name: string, message: string) => {
    const err: any = new Error(message);
    err.name = name;
    return err;
  };

  it('composes GET config and returns json data', async () => {
    mockedAxios.mockResolvedValueOnce(makeAxiosResponse());

    const args = {
      url: 'https://api.example.com/items',
      method: 'GET' as const,
      headers: { Accept: 'application/json' },
      query: { a: '1', b: 2, c: false },
    };

    const res = await tool.execute({ name: tool.name, args });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.output.data.status).toBe(200);
      expect(res.output.data.url).toBe(args.url);
      expect(res.output.data.method).toBe('GET');
      expect(res.output.data.data).toEqual({ ok: true });
    }

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    const config = mockedAxios.mock.calls[0][0] as any;
    expect(config.url).toBe(args.url);
    expect(config.method).toBe('GET');
    expect(config.headers).toEqual(args.headers);
    expect(config.params).toEqual(args.query);
    expect(config.timeout).toBe(20000);
    expect(config.maxRedirects).toBe(5);
    expect(config.responseType).toBe('json');
  });

  it('normalizes text responses to string', async () => {
    mockedAxios.mockResolvedValueOnce(
      makeAxiosResponse({ data: { message: 'hi' } }),
    );

    const args = {
      url: 'https://api.example.com/text',
      method: 'GET' as const,
      responseType: 'text' as const,
    };

    const res = await tool.execute({ name: tool.name, args });
    expect(res.success).toBe(true);
    if (res.success) {
      // Since axios is still called with responseType=json for non-arraybuffer,
      // the actor casts non-string data to string.
      expect(typeof res.output.data.data).toBe('string');
      expect(res.output.data.data).toBe('[object Object]');
    }
    const config = mockedAxios.mock.calls[0][0] as any;
    expect(config.responseType).toBe('json');
  });

  it('returns base64 for arraybuffer responses', async () => {
    const buf = Buffer.from('hello');
    mockedAxios.mockResolvedValueOnce(
      makeAxiosResponse({
        data: buf,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );

    const args = {
      url: 'https://api.example.com/binary',
      method: 'GET' as const,
      responseType: 'arraybuffer' as const,
    };

    const res = await tool.execute({ name: tool.name, args });
    expect(res.success).toBe(true);
    if (res.success) {
      const payload = res.output.data.data as any;
      expect(payload.encoding).toBe('base64');
      expect(payload.data).toBe(buf.toString('base64'));
      expect(payload.length).toBe(buf.length);
    }
    const config = mockedAxios.mock.calls[0][0] as any;
    expect(config.responseType).toBe('arraybuffer');
  });

  it('honors followRedirects=false by setting maxRedirects=0', async () => {
    mockedAxios.mockResolvedValueOnce(makeAxiosResponse());

    const args = {
      url: 'https://api.example.com/noredirect',
      method: 'GET' as const,
      followRedirects: false,
    };

    const res = await tool.execute({ name: tool.name, args });
    expect(res.success).toBe(true);
    const config = mockedAxios.mock.calls[0][0] as any;
    expect(config.maxRedirects).toBe(0);
  });

  it('retries once on AxiosError then succeeds', async () => {
    mockedAxios
      .mockRejectedValueOnce(makeError('AxiosError', 'boom'))
      .mockResolvedValueOnce(makeAxiosResponse());

    const args = { url: 'https://api.example.com/retry' };
    const res = await tool.execute({ name: tool.name, args });
    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.attempts).toBe(2);
    }
  });

  it('fails after retries exhausted with AxiosError', async () => {
    mockedAxios
      .mockRejectedValueOnce(makeError('AxiosError', 'down'))
      .mockRejectedValueOnce(makeError('AxiosError', 'still down'));

    const args = { url: 'https://api.example.com/down' };
    const res = await tool.execute({ name: tool.name, args });
    expect(mockedAxios).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('AxiosError');
      expect(res.attempts).toBe(2);
    }
  });

  it('fails validation for missing url', async () => {
    const res = await tool.execute({
      name: tool.name,
      args: { method: 'GET' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });
});
