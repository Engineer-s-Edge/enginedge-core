import { Controller, Get, Param, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { KubernetesObservabilityService } from '@application/services/kubernetes-observability.service';
import { KubernetesObservabilityMetricsService } from './kubernetes-observability-metrics.service';

@Controller('api/workers')
export class KubernetesObservabilityController {
  private readonly logger = new Logger(KubernetesObservabilityController.name);

  constructor(
    private readonly observabilityService: KubernetesObservabilityService,
    private readonly metricsService: KubernetesObservabilityMetricsService
  ) {}

  /**
   * GET /api/workers/:type/pods/:name/logs
   * Retrieve pod logs
   */
  @Get(':type/pods/:name/logs')
  async getPodLogs(
    @Param('type') workerType: string,
    @Param('name') podName: string,
    @Query('namespace') namespace?: string,
    @Query('container') container?: string,
    @Query('tailLines') tailLines?: string
  ) {
    const startTime = Date.now();
    try {
      const tail = tailLines ? parseInt(tailLines, 10) : 500;
      const logs = await this.observabilityService.getPodLogs(podName, namespace, container, tail);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodLogs', workerType, duration, true);
      return { podName, logs };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodLogs', workerType, duration, false);
      this.logger.error(`Failed to get logs for pod ${podName}: ${e.message}`, e.stack);
      throw new HttpException(`Failed to get logs: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /api/workers/:type/pods/:name/status
   * Get pod status and health information
   */
  @Get(':type/pods/:name/status')
  async getPodStatus(
    @Param('type') workerType: string,
    @Param('name') podName: string,
    @Query('namespace') namespace?: string
  ) {
    const startTime = Date.now();
    try {
      const status = await this.observabilityService.getPodStatus(podName, namespace);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodStatus', workerType, duration, true);
      return status;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodStatus', workerType, duration, false);
      this.logger.error(`Failed to get status for pod ${podName}: ${e.message}`, e.stack);
      throw new HttpException(
        `Failed to get status: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /api/workers/:type/pods/:name/events
   * Get recent events for a pod
   */
  @Get(':type/pods/:name/events')
  async getPodEvents(
    @Param('type') workerType: string,
    @Param('name') podName: string,
    @Query('namespace') namespace?: string,
    @Query('limit') limit?: string
  ) {
    const startTime = Date.now();
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const events = await this.observabilityService.getPodEvents(podName, namespace, limitNum);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodEvents', workerType, duration, true);
      return { podName, events };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodEvents', workerType, duration, false);
      this.logger.error(`Failed to get events for pod ${podName}: ${e.message}`, e.stack);
      throw new HttpException(
        `Failed to get events: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /api/workers/:type/pods/:name/metrics
   * Get resource metrics for a pod
   */
  @Get(':type/pods/:name/metrics')
  async getPodMetrics(
    @Param('type') workerType: string,
    @Param('name') podName: string,
    @Query('namespace') namespace?: string
  ) {
    const startTime = Date.now();
    try {
      const metrics = await this.observabilityService.getPodMetrics(podName, namespace);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodMetrics', workerType, duration, true);
      if (!metrics) {
        return {
          podName,
          message: 'Metrics not available (metrics-server may not be installed)',
        };
      }
      return metrics;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodMetrics', workerType, duration, false);
      this.logger.error(`Failed to get metrics for pod ${podName}: ${e.message}`, e.stack);
      throw new HttpException(
        `Failed to get metrics: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /api/workers/:type/pods
   * Get all pods for a worker type
   */
  @Get(':type/pods')
  async getPodsByWorkerType(
    @Param('type') workerType: string,
    @Query('namespace') namespace?: string
  ) {
    const startTime = Date.now();
    try {
      const pods = await this.observabilityService.getPodsByWorkerType(workerType, namespace);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodsByWorkerType', workerType, duration, true);
      return { workerType, pods };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getPodsByWorkerType', workerType, duration, false);
      this.logger.error(`Failed to get pods for worker type ${workerType}: ${e.message}`, e.stack);
      throw new HttpException(`Failed to get pods: ${e.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /api/workers/:type/health
   * Get aggregated health status for all pods of a worker type
   */
  @Get(':type/health')
  async getWorkerTypeHealth(
    @Param('type') workerType: string,
    @Query('namespace') namespace?: string
  ) {
    const startTime = Date.now();
    try {
      const health = await this.observabilityService.getWorkerTypeHealth(workerType, namespace);
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getWorkerTypeHealth', workerType, duration, true);
      return health;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;
      this.metricsService.recordOperation('getWorkerTypeHealth', workerType, duration, false);
      this.logger.error(
        `Failed to get health for worker type ${workerType}: ${e.message}`,
        e.stack
      );
      throw new HttpException(
        `Failed to get health: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
