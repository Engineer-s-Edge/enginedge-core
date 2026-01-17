import { ProxyService } from './proxy.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProxyService();
    // Default resolve
    mockedAxios.request.mockResolvedValue({ data: { success: true } });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forward', () => {
    it('should forward request to backend', async () => {
      const baseUrl = 'http://backend:3000';
      const path = '/api/v1/resource';
      const method = 'POST';
      const body = { foo: 'bar' };
      const headers = {
        authorization: 'Bearer token',
        'custom-header': 'ignored',
      };
      const query = { limit: 10 };

      const result = await service.forward(baseUrl, path, method, body, headers, query);

      expect(result).toEqual({ success: true });
      expect(mockedAxios.request).toHaveBeenCalledWith({
        url: 'http://backend:3000/api/v1/resource',
        method: 'POST',
        data: body,
        params: query,
        headers: {
          authorization: 'Bearer token',
          // custom-header should be filtered out
        },
      });
    });

    it('should normalize url slashes', async () => {
      await service.forward('http://base/', '/path', 'GET', {}, {}, {});
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://base/path',
        })
      );
    });

    it('should filter security headers', async () => {
      const headers = {
        authorization: 'ok',
        'x-request-id': 'ok',
        cookie: 'bad',
        host: 'bad',
      };
      await service.forward('http://server', 'path', 'GET', {}, headers, {});

      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.headers).toHaveProperty('authorization');
      expect(callArgs.headers).toHaveProperty('x-request-id');
      expect(callArgs.headers).not.toHaveProperty('cookie');
      expect(callArgs.headers).not.toHaveProperty('host');
    });

    it('should propagate axios errors', async () => {
      mockedAxios.request.mockRejectedValue(new Error('Network Error'));
      await expect(service.forward('http://a', 'b', 'GET', {}, {}, {})).rejects.toThrow(
        'Network Error'
      );
    });
  });
});
