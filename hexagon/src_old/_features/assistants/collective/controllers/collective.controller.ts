import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CollectiveService } from '@core/infrastructure/agents/collective';
import {
  CreateCollectiveDto,
  CollectiveResponseDto,
} from '../dto/collective.dto';
import { CreateTaskDto, TaskResponseDto } from '../dto/task.dto';

@Controller('assistants/collective')
export class CollectiveController {
  constructor(private readonly collectiveService: CollectiveService) {}

  @Post()
  async createCollective(
    @Request() req: any,
    @Body() dto: CreateCollectiveDto,
  ): Promise<CollectiveResponseDto> {
    return this.collectiveService.createCollective(req.user.userId, dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async startCollective(@Param('id') id: string): Promise<any> {
    return this.collectiveService.startCollective(id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseCollective(@Param('id') id: string): Promise<any> {
    return this.collectiveService.pauseCollective(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeCollective(@Param('id') id: string): Promise<any> {
    return this.collectiveService.resumeCollective(id);
  }

  @Get()
  async getUserCollectives(@Request() req: any): Promise<CollectiveResponseDto[]> {
    return this.collectiveService.getUserCollectives(req.user.userId);
  }

  @Get(':id')
  async getCollectiveById(@Param('id') id: string): Promise<CollectiveResponseDto> {
    return this.collectiveService.getCollectiveById(id);
  }

  @Get(':id/tasks')
  async getCollectiveTasks(@Param('id') id: string): Promise<TaskResponseDto[]> {
    return this.collectiveService.getCollectiveTasks(id);
  }

  @Get(':id/tasks/hierarchy')
  async getTaskHierarchy(@Param('id') id: string): Promise<any> {
    return this.collectiveService.getTaskHierarchy(id);
  }

  @Post('tasks')
  async createTask(@Body() dto: CreateTaskDto): Promise<any> {
    return this.collectiveService.createTask(dto);
  }

  @Get(':id/events')
  async getCollectiveEvents(@Param('id') id: string): Promise<any[]> {
    return this.collectiveService.getCollectiveEvents(id);
  }

  @Get(':id/deadlocks')
  async detectDeadlocks(@Param('id') id: string): Promise<any[]> {
    return this.collectiveService.detectDeadlocks(id);
  }

  @Get(':id/agents/:agentId/status')
  async getAgentStatus(
    @Param('id') collectiveId: string,
    @Param('agentId') agentId: string,
  ): Promise<any> {
    return this.collectiveService.getAgentStatus(collectiveId, agentId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteCollective(@Param('id') id: string): Promise<any> {
    return this.collectiveService.deleteCollective(id);
  }
}
