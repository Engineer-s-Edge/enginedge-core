import { Injectable } from '@nestjs/common';
import axios, { Method } from 'axios';

@Injectable()
export class ProxyService {
  async forward(baseUrl: string, path: string, method: Method, body: any, headers: any, query: any) {
    const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const { data } = await axios.request({ url, method, data: body, params: query, headers: this.pickHeaders(headers) });
    return data;
  }

  private pickHeaders(headers: any) {
    const allowed = ['authorization', 'x-request-id', 'x-correlation-id', 'traceparent', 'tracestate'];
    const picked: any = {};
    for (const k of allowed) if (headers[k]) picked[k] = headers[k];
    return picked;
  }
}


