import { Injectable } from '@nestjs/common';
import { KubernetesService } from './kubernetes.service';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../../services/logger/logger.service';
import { KafkaService } from '../kafka/kafka.service';
import { v4 as uuidv4 } from 'uuid';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class NodeManagementService {
  private readonly workerDeploymentName: string;
  private readonly workerImage: string;

  constructor(
    private readonly kubernetesService: KubernetesService,
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
    private readonly kafkaService: KafkaService,
  ) {
    this.workerDeploymentName = this.configService.get<string>(
      'WORKER_DEPLOYMENT_NAME',
      'enginedge-worker',
    );
    this.workerImage = this.configService.get<string>(
      'WORKER_IMAGE',
      'enginedge-worker:latest',
    );
  }

  /**
   * Scale the worker node deployment
   */
  async scaleWorkerDeployment(replicas: number) {
    try {
      await this.kubernetesService.scaleDeployment(
        this.workerDeploymentName,
        replicas,
      );
      this.logger.log(
        `Scaled worker deployment ${this.workerDeploymentName} to ${replicas} replicas`,
        NodeManagementService.name,
      );
      return { success: true };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to scale worker deployment ${this.workerDeploymentName}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Offload a task to a worker node via Kafka
   */
  async offloadTask(taskType: string, payload: any) {
    const taskId = uuidv4();
    const command = {
      taskId,
      taskType,
      payload,
    };

    try {
      await this.kafkaService.sendCommand(command);
      this.logger.log(
        `Offloaded task ${taskId} of type ${taskType} to Kafka`,
        NodeManagementService.name,
      );
      return { taskId };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to offload task ${taskId}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Start a dedicated worker node as a Pod
   */
  async startWorkerNode(
    userId: string,
    nodeType:
      | 'video-processor'
      | 'audio-processor'
      | 'interview-evaluator'
      | 'problem-solver',
    resources?: { cpu?: string; memory?: string; gpu?: boolean },
  ) {
    const shortId = uuidv4().split('-')[0];
    const podName = `enginedge-worker-${nodeType}-${shortId}`;

    const labels: Record<string, string> = {
      app: 'enginedge-worker',
      'enginedge/user-id': userId,
      'enginedge/node-type': nodeType,
    };

    const containerResources: k8s.V1ResourceRequirements = {};
    if (resources?.cpu || resources?.memory || resources?.gpu) {
      containerResources.requests = {} as any;
      containerResources.limits = {} as any;
      if (resources.cpu) {
        containerResources.requests!['cpu'] = resources.cpu;
        containerResources.limits!['cpu'] = resources.cpu;
      }
      if (resources.memory) {
        containerResources.requests!['memory'] = resources.memory;
        containerResources.limits!['memory'] = resources.memory;
      }
      if (resources.gpu) {
        // Common GPU resource key for NVIDIA device plugin
        (containerResources.limits as any)['nvidia.com/gpu'] = '1';
      }
    }

    const podManifest: k8s.V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        labels,
      },
      spec: {
        restartPolicy: 'Never',
        containers: [
          {
            name: 'worker',
            image: this.workerImage,
            imagePullPolicy: 'IfNotPresent',
            env: [
              { name: 'USER_ID', value: userId },
              { name: 'NODE_TYPE', value: nodeType },
            ],
            resources: containerResources,
          },
        ],
      },
    };

    try {
      const pod = await this.kubernetesService.createPod(podManifest);
      this.logger.info(
        `Started worker pod ${pod.name} for user ${userId} (${nodeType})`,
        NodeManagementService.name,
      );
      return pod;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to start worker node for user ${userId}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Get worker pods for a specific user
   */
  async getUserWorkerNodes(userId: string) {
    try {
      const pods = await this.kubernetesService.listPods();
      return pods.filter(
        (p) =>
          p.labels?.app === 'enginedge-worker' &&
          p.labels?.['enginedge/user-id'] === userId,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to list worker nodes for user ${userId}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Stop a worker pod by name
   */
  async stopWorkerNode(podName: string) {
    try {
      const res = await this.kubernetesService.deletePod(podName);
      this.logger.info(
        `Stopped worker pod ${podName}`,
        NodeManagementService.name,
      );
      return res;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to stop worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Execute a command inside a worker pod
   */
  async sendCommandToWorkerNode(
    podName: string,
    command: string | { container?: string; args?: string[] | string },
  ) {
    const containerName =
      (typeof command === 'object' && command.container) || 'worker';
    const argsRaw = typeof command === 'object' ? command.args : command;
    const args: string[] = Array.isArray(argsRaw)
      ? argsRaw
      : ['sh', '-lc', String(argsRaw ?? '')];

    try {
      const result = await this.kubernetesService.execCommandInPod(
        podName,
        containerName,
        args,
      );
      this.logger.info(
        `Executed command in pod ${podName}: ${JSON.stringify(args)}`,
        NodeManagementService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to execute command in worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Get logs from a worker pod
   */
  async getWorkerNodeLogs(podName: string) {
    try {
      const logs = await this.kubernetesService.getPodLogs(podName);
      return { podName, logs };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get logs from worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }

  /**
   * Determine if the worker pod is ready
   */
  async isWorkerNodeReady(podName: string): Promise<boolean> {
    try {
      const pod = await this.kubernetesService.getPod(podName);
      const allReady = (pod.containerStatuses || []).every(
        (s) => (s as any).ready === true,
      );
      return pod.status === 'Running' && allReady;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get readiness for worker node ${podName}: ${e.message}`,
        e.stack,
        NodeManagementService.name,
      );
      throw e;
    }
  }
}
