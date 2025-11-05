import { All, Controller, Req } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('scheduling')
export class SchedulingProxyController {
  private base =
    process.env.SCHEDULING_WORKER_URL || 'http://scheduling-worker:3000';
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

@Controller('calendar')
export class CalendarProxyController {
  private base =
    process.env.SCHEDULING_WORKER_URL || 'http://scheduling-worker:3000';
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
