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
import { KubernetesService } from './kubernetes.service';
import * as k8s from '@kubernetes/client-node';
import { MyLogger } from '../../services/logger/logger.service';

@Controller('kubernetes')
export class KubernetesController {
  constructor(
    private readonly kubernetesService: KubernetesService,
    private readonly logger: MyLogger,
  ) {}

  @Get('pods')
  async getAllPods() {
    try {
      return await this.kubernetesService.listPods();
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting pods: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        'Failed to get pods',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pods/:name')
  async getPod(@Param('name') name: string) {
    try {
      return await this.kubernetesService.getPod(name);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting pod ${name}: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        `Failed to get pod ${name}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('pods')
  async createPod(@Body() podManifest: k8s.V1Pod) {
    try {
      return await this.kubernetesService.createPod(podManifest);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error creating pod: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        'Failed to create pod',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('pods/:name')
  async deletePod(@Param('name') name: string) {
    try {
      return await this.kubernetesService.deletePod(name);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error deleting pod ${name}: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        `Failed to delete pod ${name}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('deployments')
  async getAllDeployments() {
    try {
      return await this.kubernetesService.listDeployments();
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error getting deployments: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        'Failed to get deployments',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('deployments/:name/scale')
  async scaleDeployment(
    @Param('name') name: string,
    @Body() body: { replicas: number },
  ) {
    try {
      return await this.kubernetesService.scaleDeployment(name, body.replicas);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error scaling deployment ${name}: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        `Failed to scale deployment ${name}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('services')
  async createService(@Body() serviceManifest: k8s.V1Service) {
    try {
      return await this.kubernetesService.createService(serviceManifest);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Error creating service: ${e.message}`,
        e.stack,
        KubernetesController.name,
      );
      throw new HttpException(
        'Failed to create service',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // @Post('pods/:name/exec')
  // async execCommandInPod(
  //   @Param('name') name: string,
  //   @Body() body: { container: string; command:string[] },
  // ) {
  //   try {
  //     return await this.kubernetesService.execCommandInPod(
  //       name,
  //       body.container,
  //       body.command,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `Error executing command in pod ${name}: ${error.message}`,
  //       error.stack,
  //       KubernetesController.name,
  //     );
  //     throw new HttpException(
  //       `Failed to execute command in pod ${name}`,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }
}
