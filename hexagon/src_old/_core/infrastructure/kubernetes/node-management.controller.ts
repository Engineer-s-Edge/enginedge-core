import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { NodeManagementService } from './node-management.service';
import { MyLogger } from '../../services/logger/logger.service';

@Controller('node-management')
export class NodeManagementController {
  constructor(
    private readonly nodeManagementService: NodeManagementService,
    private readonly logger: MyLogger,
  ) {}

  @Post('worker-nodes')
  async startWorkerNode(
    @Body()
    body: {
      userId: string;
      nodeType:
        | 'video-processor'
        | 'audio-processor'
        | 'interview-evaluator'
        | 'problem-solver';
      resources?: {
        cpu?: string;
        memory?: string;
        gpu?: boolean;
      };
    },
  ) {
    try {
      return await this.nodeManagementService.startWorkerNode(
        body.userId,
        body.nodeType,
        body.resources,
      );
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error starting worker node: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        'Failed to start worker node',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('worker-nodes/user/:userId')
  async getUserWorkerNodes(@Param('userId') userId: string) {
    try {
      return await this.nodeManagementService.getUserWorkerNodes(userId);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting worker nodes for user ${userId}: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        `Failed to get worker nodes for user ${userId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('worker-nodes/:podName')
  async stopWorkerNode(@Param('podName') podName: string) {
    try {
      return await this.nodeManagementService.stopWorkerNode(podName);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error stopping worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        `Failed to stop worker node ${podName}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('worker-nodes/:podName/command')
  async sendCommandToWorkerNode(
    @Param('podName') podName: string,
    @Body() command: string | { container?: string; args?: string[] | string },
  ) {
    try {
      return await this.nodeManagementService.sendCommandToWorkerNode(
        podName,
        command,
      );
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error sending command to worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        `Failed to send command to worker node ${podName}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('worker-nodes/:podName/logs')
  async getWorkerNodeLogs(@Param('podName') podName: string) {
    try {
      return await this.nodeManagementService.getWorkerNodeLogs(podName);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting logs from worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        `Failed to get logs from worker node ${podName}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('worker-nodes/:podName/status')
  async getWorkerNodeStatus(@Param('podName') podName: string) {
    try {
      const isReady =
        await this.nodeManagementService.isWorkerNodeReady(podName);
      return { isReady };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting status of worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementController.name,
      );
      throw new HttpException(
        `Failed to get status of worker node ${podName}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('worker-connected')
  async workerConnected(@Body() data: Record<string, unknown>) {
    this.logger.info(
      `🟢 WORKER NODE CONNECTED: ${JSON.stringify(data)}`,
      NodeManagementController.name,
    );
    return { success: true };
  }
}
