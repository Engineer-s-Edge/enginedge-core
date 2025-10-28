import axios, { AxiosRequestConfig, Method } from 'axios';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type HttpHeaders = Record<string, string>;

interface HttpRequestArgs {
  url: string;
  method?: Method;
  headers?: HttpHeaders;
  query?: Record<string, string | number | boolean>;
  body?: any;
  timeoutMs?: number;
  followRedirects?: boolean;
  responseType?: 'json' | 'text' | 'arraybuffer';
}

interface HttpRequestOutput extends ToolOutput {
  data: any; // Will be JSON-friendly object when possible
}

export class HttpRequestActor extends BaseActor<
  HttpRequestArgs,
  HttpRequestOutput
> {
  _id: ToolIdType = 't_000000000000000000000101' as unknown as ToolIdType;
  name = 'http.request';
  description =
    'Perform an HTTP(S) request (GET, POST, PUT, DELETE, PATCH, HEAD).';
  useCase = 'Integrate with arbitrary REST APIs and webhooks.';

  // actor type and retrieverConfig are defined by BaseActor
  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['url'],
    properties: {
      url: { type: 'string', minLength: 1 },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
        default: 'GET',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        default: {},
      },
      query: {
        type: 'object',
        additionalProperties: {
          anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        },
        default: {},
      },
      body: {},
      timeoutMs: { type: 'number', minimum: 0, default: 20000 },
      followRedirects: { type: 'boolean', default: true },
      responseType: {
        type: 'string',
        enum: ['json', 'text', 'arraybuffer'],
        default: 'json',
      },
    },
  };

  outputSchema = {
    type: 'object',
    required: ['status', 'headers', 'data', 'url', 'method', 'durationMs'],
    properties: {
      status: { type: 'number' },
      headers: { type: 'object', additionalProperties: true },
      data: {},
      url: { type: 'string' },
      method: { type: 'string' },
      durationMs: { type: 'number' },
    },
  };

  invocationExample = [
    {
      name: 'http.request',
      args: {
        url: 'https://api.example.com/items?limit=10',
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    } as ToolCall,
    {
      name: 'http.request',
      args: {
        url: 'https://api.example.com/items',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'Widget', qty: 2 },
      },
    } as ToolCall,
  ];

  retries = 1;
  errorEvent = [
    {
      name: 'AxiosError',
      guidance:
        'Check network connectivity, URL, and headers. Ensure the server is reachable.',
      retryable: true,
    },
    {
      name: 'NetworkError',
      guidance:
        'Transient network error. Try again later or verify DNS/SSL configuration.',
      retryable: true,
    },
  ];
  parallel = true;
  concatenate = (results: any[]) =>
    results.filter((r) => (r as any).success).pop() || results[0];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async act(args: HttpRequestArgs): Promise<HttpRequestOutput> {
    this.logger.info(
      `Making HTTP request: ${args.method || 'GET'} ${args.url}`,
      this.constructor.name,
    );
    this.logger.debug(
      `HTTP request args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const start = Date.now();
    const {
      url,
      method = 'GET',
      headers = {},
      query = {},
      body,
      timeoutMs = 20000,
      followRedirects = true,
      responseType = 'json',
    } = args;

    this.logger.debug(
      `Request configuration - method: ${method}, timeout: ${timeoutMs}ms, followRedirects: ${followRedirects}, responseType: ${responseType}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Headers: ${JSON.stringify(headers)}, Query: ${JSON.stringify(query)}`,
      this.constructor.name,
    );

    const config: AxiosRequestConfig = {
      url,
      method,
      headers,
      params: query,
      data: body,
      timeout: timeoutMs,
      maxRedirects: followRedirects ? 5 : 0,
      responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'json',
      validateStatus: (status) => status < 600,
    };

    try {
      this.logger.debug(
        `Sending HTTP request to: ${url}`,
        this.constructor.name,
      );
      const response = await axios(config);
      const durationMs = Date.now() - start;

      this.logger.info(
        `HTTP request completed: ${response.status} ${response.statusText} (${durationMs}ms)`,
        this.constructor.name,
      );
      this.logger.debug(
        `Response headers: ${JSON.stringify(response.headers)}`,
        this.constructor.name,
      );

      // Normalize data to JSON when possible
      let normalized: any = response.data;
      if (responseType === 'text' && typeof response.data !== 'string') {
        normalized = String(response.data);
        this.logger.debug(
          'Normalized response data to string',
          this.constructor.name,
        );
      }

      if (responseType === 'arraybuffer') {
        // Return base64 for binary data to keep JSON-safe
        const buf: Buffer = Buffer.from(response.data);
        normalized = {
          encoding: 'base64',
          data: buf.toString('base64'),
          length: buf.length,
        };
        this.logger.debug(
          `Normalized binary data to base64 (${buf.length} bytes)`,
          this.constructor.name,
        );
      }

      const outputPayload = {
        status: response.status,
        headers: response.headers,
        data: normalized,
        url,
        method,
        durationMs,
      };

      this.logger.debug(
        `HTTP request successful: ${method} ${url} -> ${response.status}`,
        this.constructor.name,
      );
      return {
        data: outputPayload as any,
        // Cast to any to satisfy the interface expecting MIMEType
        mimeType: 'application/json' as unknown as any,
      };
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(
        `HTTP request failed: ${method} ${url} - ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      this.logger.debug(
        `Request failed after ${durationMs}ms`,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default HttpRequestActor;
