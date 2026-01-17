import { Module, Global } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';
import { MetricsController } from './metrics.controller';

/**
 * Global metrics module that provides a shared Prometheus registry
 * This ensures all metrics are collected in one place and exposed via /metrics endpoint
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: 'PrometheusRegistry',
      useFactory: () => {
        const registry = new Registry();
        collectDefaultMetrics({ register: registry });
        return registry;
      },
    },
  ],
  exports: ['PrometheusRegistry'],
})
export class MetricsModule {}
