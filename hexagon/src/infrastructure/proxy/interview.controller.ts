import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('interview')
export class InterviewProxyController {
  private base = process.env.INTERVIEW_WORKER_URL || 'http://interview-worker:3004';
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  forward(@Req() req: any) {
    const path = req.params?.[0] || '';
    return this.proxy.forward(this.base, path, req.method, req.body, req.headers, req.query);
  }
}

