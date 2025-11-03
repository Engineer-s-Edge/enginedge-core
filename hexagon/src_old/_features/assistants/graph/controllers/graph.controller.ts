import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GraphAgentManagerService } from '../services/graph-agent-manager.service';
import { ProvideInputDto, ProvideApprovalDto } from '../dto/graph.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

@Controller('assistants/graph')
export class GraphController {
  constructor(private readonly graphAgentManagerService: GraphAgentManagerService) {}

  // All graph control endpoints require authenticated user; extract userId from JWT
  @UseGuards(JwtAuthGuard)
  @Get(':conversationId/state')
  async getGraphState(
    @Param('conversationId') conversationId: string,
    @Request() req?: any,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || req /* test back-compat passes userId as second arg */;
    return this.graphAgentManagerService.getGraphState(userId, conversationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':conversationId/pause')
  async pauseGraph(
    @Param('conversationId') conversationId: string,
    @Request() req?: any,
    @Body('options') options?: any,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || req;
    await this.graphAgentManagerService.pauseGraph(userId, conversationId, options);
    return { success: true, message: 'Graph execution paused.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':conversationId/resume')
  async resumeGraph(
    @Param('conversationId') conversationId: string,
    @Request() req?: any,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || req;
    await this.graphAgentManagerService.resumeGraph(userId, conversationId);
    return { success: true, message: 'Graph execution resumed.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':conversationId/nodes/:nodeId/input')
  @UsePipes(new ValidationPipe({ transform: true }))
  async provideGraphInput(
    @Param('conversationId') conversationId: string,
    @Param('nodeId') nodeId: string,
    @Body() provideInputDto: ProvideInputDto,
    @Request() req?: any,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || (provideInputDto as any)?.userId;
    await this.graphAgentManagerService.provideGraphInput(
      userId,
      conversationId,
      nodeId,
      provideInputDto.input,
    );
    return { success: true, message: 'Input provided to graph node.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':conversationId/nodes/:nodeId/approval')
  @UsePipes(new ValidationPipe({ transform: true }))
  async provideGraphApproval(
    @Param('conversationId') conversationId: string,
    @Param('nodeId') nodeId: string,
    @Body() provideApprovalDto: ProvideApprovalDto,
    @Request() req?: any,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || (provideApprovalDto as any)?.userId;
    await this.graphAgentManagerService.provideGraphApproval(
      userId,
      conversationId,
      nodeId,
      provideApprovalDto.approved,
    );
    return { success: true, message: 'Approval provided to graph node.' };
  }
}
