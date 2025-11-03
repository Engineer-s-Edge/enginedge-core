import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('resume')
export class ResumeProxyController {
  private base = process.env.RESUME_WORKER_URL || 'http://resume-worker:3006';
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(this.base, path, req.method, req.body, req.headers, req.query);
  }
}


