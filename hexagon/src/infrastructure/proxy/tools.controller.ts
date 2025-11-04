import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('tools')
export class ToolsProxyController {
  private base = process.env.TOOLS_WORKER_URL || 'http://agent-tool-worker:3002';
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(this.base, path, req.method, req.body, req.headers, req.query);
  }
}

