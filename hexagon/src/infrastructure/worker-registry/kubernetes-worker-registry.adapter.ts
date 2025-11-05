import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import axios from 'axios';
import { IWorkerRegistry } from '@application/ports/worker-registry.port';
import { Worker } from '@domain/entities/worker.entity';

export interface InfraWorker {
  id: string;
  type: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class KubernetesWorkerRegistryAdapter
  implements IWorkerRegistry, OnModuleInit
{
  private readonly logger = new Logger(KubernetesWorkerRegistryAdapter.name);
  private k8sApi: CoreV1Api | null = null;
  private workers = new Map<string, InfraWorker[]>();
  private workerTypes = [
    'assistant-worker',
    'agent-tool-worker',
    'data-processing-worker',
    'resume-worker',
    'latex-worker',
    'interview-worker',
    'scheduling-worker',
    'identity-worker',
    'news-worker',
  ];

  constructor(private readonly configService: ConfigService) {
    const discoveryMode = this.configService.get<string>(
      'WORKER_DISCOVERY_MODE',
      'kubernetes',
    );
    if (discoveryMode === 'kubernetes') {
      try {
        const kc = new KubeConfig();
        kc.loadFromDefault();
        this.k8sApi = kc.makeApiClient(CoreV1Api);
      } catch (error) {
        this.logger.warn(
          'Kubernetes client not available, using static worker configuration',
        );
        this.k8sApi = null;
      }
    }
  }

  async onModuleInit() {
    await this.discoverWorkers();
    // Refresh worker list periodically
    setInterval(() => this.discoverWorkers(), 30000); // Every 30 seconds
  }

  private async discoverWorkers(): Promise<void> {
    if (this.k8sApi) {
      try {
        for (const workerType of this.workerTypes) {
          const services = await this.k8sApi.listServiceForAllNamespaces({
            labelSelector: `app=${workerType}`,
          });
          const workers: InfraWorker[] = [];
          const items = ((services as any).body?.items || (services as any).items) || [];
          for (const service of items) {
            const port = service.spec?.ports?.[0]?.port || 3000;
            const endpoint = `http://${service.metadata?.name}:${port}`;
            workers.push({
              id: `${workerType}-${service.metadata?.name}`,
              type: workerType,
              endpoint,
              status: 'unknown',
            });
          }
          this.workers.set(workerType, workers);
        }
      } catch (error) {
        this.logger.error('Failed to discover workers from Kubernetes', error);
        this.loadStaticWorkers();
      }
    } else {
      this.loadStaticWorkers();
    }
  }

  private loadStaticWorkers(): void {
    // Fallback to static configuration from environment variables
    const staticWorkers: InfraWorker[] = [];
    this.workerTypes.forEach((type) => {
      const envKey = `${type.toUpperCase().replace(/-/g, '_')}_URL`;
      const endpoint =
        this.configService.get<string>(envKey) || `http://${type}:3000`;
      staticWorkers.push({
        id: `${type}-static`,
        type,
        endpoint,
        status: 'unknown',
      });
    });
    this.workers.set('static', staticWorkers);
  }

  async getWorkers(type: string): Promise<Worker[]> {
    // Try to get workers by type directly
    let infraWorkers = this.workers.get(type) || [];

    // If not found, try matching worker type patterns
    if (infraWorkers.length === 0) {
      for (const [key, workers] of this.workers.entries()) {
        if (key.includes(type) || workers.some((w) => w.type.includes(type))) {
          infraWorkers = workers;
          break;
        }
      }
    }

    // If still not found, try static workers
    if (infraWorkers.length === 0) {
      infraWorkers = this.workers.get('static') || [];
    }

    return infraWorkers.map((w) => this.mapToDomainWorker(w));
  }

  async getAllWorkers(): Promise<Worker[]> {
    const all: Worker[] = [];
    for (const workers of this.workers.values()) {
      all.push(...workers.map((w) => this.mapToDomainWorker(w)));
    }
    return all;
  }

  async updateWorkerHealth(
    workerId: string,
    status: 'healthy' | 'unhealthy',
  ): Promise<void> {
    for (const workers of this.workers.values()) {
      const worker = workers.find((w) => w.id === workerId);
      if (worker) {
        worker.status = status;
        worker.lastHealthCheck = new Date();
      }
    }
  }

  private mapToDomainWorker(infraWorker: InfraWorker): Worker {
    const worker = new Worker(
      infraWorker.id,
      infraWorker.type as any,
      infraWorker.endpoint,
      [],
    );
    worker.updateHealth(infraWorker.status as any);
    if (infraWorker.lastHealthCheck) {
      worker.lastHealthCheck = infraWorker.lastHealthCheck;
    }
    if (infraWorker.metadata) {
      worker.metadata = infraWorker.metadata;
    }
    return worker;
  }
}
