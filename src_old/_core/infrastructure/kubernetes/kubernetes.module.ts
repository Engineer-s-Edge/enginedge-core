import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KubernetesService } from './kubernetes.service';
import { KubernetesController } from './kubernetes.controller';
import { NodeManagementService } from './node-management.service';
import { NodeManagementController } from './node-management.controller';
import { MyLogger } from '../../services/logger/logger.service';
import { CoreServicesModule } from '../../services/core-services.module';
import { KafkaService } from '../kafka/kafka.service';
import kubernetesConfig from '../../config/kubernetes.config';

// Mock service for when Kubernetes is disabled
class MockKubernetesService {
  listPods() {
    return Promise.resolve([]);
  }
  getPod() {
    return Promise.resolve({});
  }
  createPod() {
    return Promise.resolve({});
  }
  deletePod() {
    return Promise.resolve({});
  }
  listDeployments() {
    return Promise.resolve([]);
  }
  scaleDeployment() {
    return Promise.resolve({});
  }
  createService() {
    return Promise.resolve({});
  }
  execCommandInPod() {
    return Promise.resolve({});
  }
  getPodLogs() {
    return Promise.resolve('');
  }
}

// Mock node management service for when Kubernetes is disabled
class MockNodeManagementService {
  listNodes() {
    return Promise.resolve([]);
  }
  getNodeDetails() {
    return Promise.resolve({});
  }
  scaleNode() {
    return Promise.resolve({});
  }
  startWorkerNode() {
    return Promise.resolve({});
  }
  getUserWorkerNodes() {
    return Promise.resolve([]);
  }
  stopWorkerNode() {
    return Promise.resolve({});
  }
  sendCommandToWorkerNode() {
    return Promise.resolve({});
  }
  getWorkerNodeLogs() {
    return Promise.resolve({ logs: '' });
  }
  isWorkerNodeReady() {
    return Promise.resolve(true);
  }
}

@Module({})
export class KubernetesModule {
  static forRoot(): DynamicModule {
    return {
      module: KubernetesModule,
      imports: [ConfigModule.forFeature(kubernetesConfig), CoreServicesModule],
      providers: [
        {
          provide: KubernetesService,
          useFactory: (configService: ConfigService, logger: MyLogger) => {
            const config = configService.get('kubernetes');
            if (!config || !config.enabled) {
              return new MockKubernetesService();
            }
            return new KubernetesService(configService, logger);
          },
          inject: [ConfigService, MyLogger],
        },
        {
          provide: NodeManagementService,
          useFactory: (
            configService: ConfigService,
            k8sService: KubernetesService,
            logger: MyLogger,
            kafkaService: KafkaService,
          ) => {
            const config = configService.get('kubernetes');
            if (!config || !config.enabled) {
              return new MockNodeManagementService();
            }
            return new NodeManagementService(
              k8sService,
              configService,
              logger,
              kafkaService,
            );
          },
          inject: [ConfigService, KubernetesService, MyLogger, KafkaService],
        },
      ],
      controllers: [KubernetesController, NodeManagementController],
      exports: [KubernetesService, NodeManagementService],
    };
  }
}
