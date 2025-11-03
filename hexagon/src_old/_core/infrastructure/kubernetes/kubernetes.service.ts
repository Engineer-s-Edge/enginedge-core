import { Injectable } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../../services/logger/logger.service';
import { DeploymentDto, PodDto } from './dtos';
import { DeploymentMapper, PodMapper } from './mappers';
import { Stream } from 'stream';

@Injectable()
export class KubernetesService {
  private readonly k8sApi: k8s.CoreV1Api;
  private readonly appsV1Api: k8s.AppsV1Api;
  private readonly namespace: string;

  constructor(
    private configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    const kc = new k8s.KubeConfig();
    try {
      // Try to load from default location
      kc.loadFromDefault();
    } catch {
      this.logger.warn(
        'Failed to load kubeconfig from default location, using in-cluster config',
        KubernetesService.name,
      );
      kc.loadFromCluster();
    }

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
    this.namespace = this.configService.get<string>(
      'KUBERNETES_NAMESPACE',
      'default',
    );
    this.logger.info(
      `Initialized Kubernetes service with namespace: ${this.namespace}`,
      KubernetesService.name,
    );
  }

  /**
   * List all pods in the configured namespace
   */
  async listPods(): Promise<PodDto[]> {
    try {
      const res = await this.k8sApi.listNamespacedPod({
        namespace: this.namespace,
      });
      return (res as any).items.map(PodMapper.toDto);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to list pods: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Get details about a specific pod
   */
  async getPod(name: string): Promise<PodDto> {
    try {
      const res = await this.k8sApi.readNamespacedPod({
        name,
        namespace: this.namespace,
      });
      return PodMapper.toDto(res as any);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get pod ${name}: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Create a new pod
   */
  async createPod(podManifest: k8s.V1Pod): Promise<PodDto> {
    try {
      const res = await this.k8sApi.createNamespacedPod({
        namespace: this.namespace,
        body: podManifest,
      });
      return PodMapper.toDto(res as any);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create pod: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Delete a pod
   */
  async deletePod(name: string) {
    try {
      const res = await this.k8sApi.deleteNamespacedPod({
        name,
        namespace: this.namespace,
      });
      return res;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to delete pod ${name}: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * List all deployments
   */
  async listDeployments(): Promise<DeploymentDto[]> {
    try {
      const res = await this.appsV1Api.listNamespacedDeployment({
        namespace: this.namespace,
      });
      return (res as any).items.map(DeploymentMapper.toDto);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to list deployments: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Scale a deployment
   */
  async scaleDeployment(
    name: string,
    replicas: number,
  ): Promise<DeploymentDto> {
    try {
      const deployment = await this.appsV1Api.readNamespacedDeployment({
        name,
        namespace: this.namespace,
      });
      deployment.spec!.replicas = replicas;
      const res = await this.appsV1Api.replaceNamespacedDeployment({
        name,
        namespace: this.namespace,
        body: deployment,
      });
      return DeploymentMapper.toDto(res);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to scale deployment ${name}: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Create a service to expose a pod or deployment
   */
  async createService(serviceManifest: k8s.V1Service) {
    try {
      const res = await this.k8sApi.createNamespacedService({
        namespace: this.namespace,
        body: serviceManifest,
      });
      return res;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create service: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Get logs from a pod
   */
  async getPodLogs(
    name: string,
    container?: string,
    tailLines = 500,
  ): Promise<string> {
    try {
      const res = await this.k8sApi.readNamespacedPodLog({
        name,
        namespace: this.namespace,
        container,
        tailLines,
      } as any);
      // Some client versions return string directly, others in body
      const body: any = res as any;
      return typeof body === 'string' ? body : (body?.body ?? '');
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to get logs for pod ${name}: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }

  /**
   * Execute a command in a pod
   */
  async execCommandInPod(
    podName: string,
    containerName: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const exec = new k8s.Exec(kc);
    const stdout = new Stream.PassThrough();
    const stderr = new Stream.PassThrough();

    const stdoutPromise = new Promise<string>((resolve, reject) => {
      let output = '';
      stdout.on('data', (chunk) => (output += chunk.toString()));
      stdout.on('end', () => resolve(output));
      stdout.on('error', reject);
    });

    const stderrPromise = new Promise<string>((resolve, reject) => {
      let output = '';
      stderr.on('data', (chunk) => (output += chunk.toString()));
      stderr.on('end', () => resolve(output));
      stderr.on('error', reject);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        exec.exec(
          this.namespace,
          podName,
          containerName,
          command,
          stdout,
          stderr,
          null, // No stdin
          false,
          (status) => {
            if (status.status === 'Success') {
              resolve();
            } else {
              reject(new Error(`Exec failed with status: ${status.status}`));
            }
          },
        );
      });

      return {
        stdout: await stdoutPromise,
        stderr: await stderrPromise,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to exec command in pod ${podName}: ${e.message}`,
        e.stack,
        KubernetesService.name,
      );
      throw e;
    }
  }
}
