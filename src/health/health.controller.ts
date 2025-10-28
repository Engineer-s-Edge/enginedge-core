import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  service: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    // Simple health check that doesn't depend on MongoDB
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'core',
    };
  }
}
