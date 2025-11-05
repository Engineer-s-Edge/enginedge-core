import { Global, Module } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';
import { MetricsController } from './metrics.controller';

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
