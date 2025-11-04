import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('data')
export class DataProxyController {
  private base = process.env.DATA_WORKER_URL || 'http://data-processing-worker:3003';
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(this.base, path, req.method, req.body, req.headers, req.query);
  }
}

