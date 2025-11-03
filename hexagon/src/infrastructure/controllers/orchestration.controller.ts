import { Controller, Post, Body } from '@nestjs/common';
import { HandleRequestUseCase } from '../../application/use-cases/handle-request.use-case';
import { WorkerManagementService } from '../../application/services/worker-management.service';
import { Request } from '../../domain/entities/request';
import { RequestType } from '../../domain/entities/request';

@Controller('orchestrate')
export class OrchestrationController {
  constructor(
    private readonly handleRequestUseCase: HandleRequestUseCase,
    private readonly workerManagementService: WorkerManagementService,
  ) {}

  @Post('request')
  async handleRequest(
    @Body() body: { type: RequestType; payload: any; metadata?: any },
  ) {
    const request = Request.create(
      body.type,
      body.payload,
      body.metadata || {},
    );

    const response = await this.handleRequestUseCase.execute(request);

    return {
      requestId: request.id,
      status: response.status,
      data: response.data,
      error: response.error,
    };
  }

  @Post('workers')
  async getAvailableWorkers() {
    const workers = await this.workerManagementService.getAvailableWorkers();
    return workers.map((w) => ({
      id: w.id,
      type: w.type,
      name: w.name,
      status: w.status,
    }));
  }
}
