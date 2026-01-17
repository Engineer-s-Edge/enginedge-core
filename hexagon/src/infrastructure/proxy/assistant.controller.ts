import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('assistants')
export class AssistantProxyController {
  private base =
    process.env.ASSISTANT_WORKER_URL || 'http://assistant-worker:3001';
  constructor(private readonly proxy: ProxyService) {}

  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(
      this.base,
      path,
      req.method,
      req.body,
      req.headers,
      req.query,
    );
  }
}
