import { Test, TestingModule } from '@nestjs/testing';
import { KubernetesService } from './kubernetes.service';
import { ConfigService } from '@nestjs/config';
import { MyLogger } from '../../services/logger/logger.service';
import * as k8s from '@kubernetes/client-node';
import { Stream } from 'stream';

jest.mock('@kubernetes/client-node');
jest.mock('../../services/logger/logger.service');

describe('KubernetesService', () => {
  let service: KubernetesService;

  const mockCoreV1Api = {
    listNamespacedPod: jest.fn(),
    readNamespacedPod: jest.fn(),
    createNamespacedPod: jest.fn(),
    deleteNamespacedPod: jest.fn(),
    createNamespacedService: jest.fn(),
  };

  const mockAppsV1Api = {
    listNamespacedDeployment: jest.fn(),
    readNamespacedDeployment: jest.fn(),
    replaceNamespacedDeployment: jest.fn(),
  };

  const mockExec = {
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const mockMakeApiClient = jest.fn().mockImplementation((apiClientClass) => {
      if (apiClientClass === k8s.CoreV1Api) {
        return mockCoreV1Api;
      }
      if (apiClientClass === k8s.AppsV1Api) {
        return mockAppsV1Api;
      }
      return {};
    });

    (k8s.KubeConfig as unknown as jest.Mock).mockImplementation(() => ({
      loadFromDefault: jest.fn(),
      loadFromCluster: jest.fn(),
      makeApiClient: mockMakeApiClient,
    }));

    (k8s.Exec as unknown as jest.Mock).mockImplementation(() => mockExec);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KubernetesService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KUBERNETES_NAMESPACE') {
                return 'default';
              }
              return null;
            }),
          },
        },
        MyLogger,
      ],
    }).compile();

    service = module.get<KubernetesService>(KubernetesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listPods', () => {
    it('should list pods and return them as DTOs', async () => {
      const mockPodList = {
        items: [{ metadata: { name: 'test-pod-1' } }],
      };
      mockCoreV1Api.listNamespacedPod.mockResolvedValue(mockPodList);

      const result = await service.listPods();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-pod-1');
      expect(mockCoreV1Api.listNamespacedPod).toHaveBeenCalledWith({
        namespace: 'default',
      });
    });
  });

  describe('getPod', () => {
    it('should get a pod and return it as a DTO', async () => {
      const mockPod = { metadata: { name: 'test-pod-1' } };
      mockCoreV1Api.readNamespacedPod.mockResolvedValue(mockPod as any);

      const result = await service.getPod('test-pod-1');

      expect(result.name).toBe('test-pod-1');
      expect(mockCoreV1Api.readNamespacedPod).toHaveBeenCalledWith({
        name: 'test-pod-1',
        namespace: 'default',
      });
    });
  });

  describe('createPod', () => {
    it('should create a pod and return it as a DTO', async () => {
      const podManifest: k8s.V1Pod = { metadata: { name: 'new-pod' } };
      const mockCreatedPod = { metadata: { name: 'new-pod' } };
      mockCoreV1Api.createNamespacedPod.mockResolvedValue(
        mockCreatedPod as any,
      );

      const result = await service.createPod(podManifest);

      expect(result.name).toBe('new-pod');
      expect(mockCoreV1Api.createNamespacedPod).toHaveBeenCalledWith({
        namespace: 'default',
        body: podManifest,
      });
    });
  });

  describe('deletePod', () => {
    it('should delete a pod', async () => {
      mockCoreV1Api.deleteNamespacedPod.mockResolvedValue({} as any);
      await service.deletePod('test-pod');
      expect(mockCoreV1Api.deleteNamespacedPod).toHaveBeenCalledWith({
        name: 'test-pod',
        namespace: 'default',
      });
    });
  });

  describe('listDeployments', () => {
    it('should list deployments and return them as DTOs', async () => {
      const mockDeploymentList = {
        items: [{ metadata: { name: 'test-deployment-1' } }],
      };
      mockAppsV1Api.listNamespacedDeployment.mockResolvedValue(
        mockDeploymentList as any,
      );

      const result = await service.listDeployments();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-deployment-1');
      expect(mockAppsV1Api.listNamespacedDeployment).toHaveBeenCalledWith({
        namespace: 'default',
      });
    });
  });

  describe('scaleDeployment', () => {
    it('should scale a deployment and return it as a DTO', async () => {
      const mockDeployment = {
        spec: { replicas: 1 },
        metadata: { name: 'test-deployment' },
      };
      const mockReplacedDeployment = {
        spec: { replicas: 3 },
        metadata: { name: 'test-deployment' },
      };
      mockAppsV1Api.readNamespacedDeployment.mockResolvedValue(
        mockDeployment as any,
      );
      mockAppsV1Api.replaceNamespacedDeployment.mockResolvedValue(
        mockReplacedDeployment as any,
      );

      const result = await service.scaleDeployment('test-deployment', 3);

      expect(result.name).toBe('test-deployment');
      expect(result.replicas).toBe(3);
      expect(mockAppsV1Api.readNamespacedDeployment).toHaveBeenCalledWith({
        name: 'test-deployment',
        namespace: 'default',
      });
      expect(mockAppsV1Api.replaceNamespacedDeployment).toHaveBeenCalledWith({
        name: 'test-deployment',
        namespace: 'default',
        body: expect.objectContaining({
          spec: expect.objectContaining({ replicas: 3 }),
        }),
      });
    });
  });

  describe('execCommandInPod', () => {
    it('should execute a command in a pod and return stdout/stderr', async () => {
      mockExec.exec.mockImplementation(
        (ns, pod, container, cmd, stdout, stderr, stdin, tty, callback) => {
          stdout.write('some output');
          stdout.end();
          stderr.write('some error');
          stderr.end();
          callback({ status: 'Success' });
        },
      );

      const result = await service.execCommandInPod('test-pod', 'container', [
        'ls',
      ]);

      expect(result.stdout).toBe('some output');
      expect(result.stderr).toBe('some error');
    });
  });
});
