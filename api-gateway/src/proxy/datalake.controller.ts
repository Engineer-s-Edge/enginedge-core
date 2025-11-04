import { All, Controller, Req, UseGuards } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * Datalake Proxy Controller - ADMIN ONLY
 * 
 * Routes requests to datalake services (MinIO, Trino, Airflow, Jupyter, Spark)
 * All endpoints require admin role to prevent public exposure of datalake UIs
 */
@Controller('datalake')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DatalakeProxyController {
  constructor(private readonly proxy: ProxyService) {}

  /**
   * MinIO Console - Object Storage UI
   */
  @All('minio/*')
  forwardMinio(@Req() req: any) {
    const base = process.env.MINIO_CONSOLE_URL || 'http://minio:9001';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }

  /**
   * Trino - SQL Query Engine UI
   */
  @All('trino/*')
  forwardTrino(@Req() req: any) {
    const base = process.env.TRINO_URL || 'http://trino:8080';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }

  /**
   * Airflow - Workflow Orchestration UI
   */
  @All('airflow/*')
  forwardAirflow(@Req() req: any) {
    const base = process.env.AIRFLOW_URL || 'http://airflow:8080';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }

  /**
   * Jupyter Lab - Interactive Analytics UI
   */
  @All('jupyter/*')
  forwardJupyter(@Req() req: any) {
    const base = process.env.JUPYTER_URL || 'http://jupyter:8888';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }

  /**
   * Spark Master - Data Processing UI
   */
  @All('spark/*')
  forwardSpark(@Req() req: any) {
    const base = process.env.SPARK_MASTER_URL || 'http://spark-master:8080';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }

  /**
   * Marquez - Data Lineage UI
   */
  @All('marquez/*')
  forwardMarquez(@Req() req: any) {
    const base = process.env.MARQUEZ_WEB_URL || 'http://marquez-web:3000';
    const path = req.params?.[0] || '';
    return this.proxy.forward(base, path, req.method, req.body, req.headers, req.query);
  }
}
