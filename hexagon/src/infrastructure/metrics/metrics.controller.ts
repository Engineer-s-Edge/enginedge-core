import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Registry } from 'prom-client';

@Controller()
export class MetricsController {
  constructor(
    @Inject('PrometheusRegistry') private readonly registry: Registry,
  ) {}

  @Get('/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
