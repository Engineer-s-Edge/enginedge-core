import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('latex')
export class LatexProxyController {
  private base = process.env.LATEX_WORKER_URL || 'http://latex-worker:3005';
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(this.base, path, req.method, req.body, req.headers, req.query);
  }
}
