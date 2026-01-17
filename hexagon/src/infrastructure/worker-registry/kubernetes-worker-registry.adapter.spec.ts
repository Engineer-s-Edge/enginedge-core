import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KubernetesWorkerRegistryAdapter } from './kubernetes-worker-registry.adapter';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { Logger } from '@nestjs/common';
import { WorkerStatus } from '@domain/types/workflow.types';

jest.mock('@kubernetes/client-node');

describe('KubernetesWorkerRegistryAdapter', () => {
  let adapter: KubernetesWorkerRegistryAdapter;
  let configService: ConfigService;
  let mockKubeConfigInstance: any;
  let mockCoreV1ApiInstance: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup Kubernetes Client Mocks
    mockCoreV1ApiInstance = {
      listNamespacedService: jest.fn(),
    };

    mockKubeConfigInstance = {
      loadFromDefault: jest.fn(),
      makeApiClient: jest.fn().mockReturnValue(mockCoreV1ApiInstance),
    };

    (KubeConfig as unknown as jest.Mock).mockImplementation(
      () => mockKubeConfigInstance,
    );
    (CoreV1Api as unknown as jest.Mock).mockImplementation(() => ({}));

    // Default Config Mock behavior
    mockConfigService.get.mockImplementation((key, defaultValue) => {
      if (key === 'KUBERNETES_NAMESPACE') return 'default';
      if (key === 'WORKER_DISCOVERY_MODE') return 'kubernetes';
      return defaultValue;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KubernetesWorkerRegistryAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    adapter = module.get<KubernetesWorkerRegistryAdapter>(
      KubernetesWorkerRegistryAdapter,
    );

    // Silence logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('Initialization', () => {
    it('should initialize KubeConfig when mode is kubernetes', () => {
      expect(KubeConfig).toHaveBeenCalled();
      expect(mockKubeConfigInstance.loadFromDefault).toHaveBeenCalled();
      expect(mockKubeConfigInstance.makeApiClient).toHaveBeenCalledWith(
        CoreV1Api,
      );
    });

    it('should NOT initialize KubeConfig when mode is NOT kubernetes', async () => {
      // Re-create module with different config
      jest.clearAllMocks();
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'WORKER_DISCOVERY_MODE') return 'static';
        return defaultValue;
      });

      const module = await Test.createTestingModule({
        providers: [
          KubernetesWorkerRegistryAdapter,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const staticAdapter = module.get<KubernetesWorkerRegistryAdapter>(
        KubernetesWorkerRegistryAdapter,
      );
      expect(staticAdapter).toBeDefined();
      expect(KubeConfig).not.toHaveBeenCalled();
    });

    it('should handle KubeConfig initialization errors', async () => {
      jest.clearAllMocks();
      (KubeConfig as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('KubeConfig Error');
      });

      const module = await Test.createTestingModule({
        providers: [
          KubernetesWorkerRegistryAdapter,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const errorAdapter = module.get<KubernetesWorkerRegistryAdapter>(
        KubernetesWorkerRegistryAdapter,
      );
      expect(errorAdapter).toBeDefined();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Kubernetes client not available'),
      );
    });
  });

  describe('onModuleInit', () => {
    it('should call discoverWorkers and set interval', async () => {
      mockCoreV1ApiInstance.listNamespacedService.mockResolvedValue({
        body: { items: [] },
      });
      const discoverSpy = jest.spyOn(adapter as any, 'discoverWorkers');

      await adapter.onModuleInit();

      expect(discoverSpy).toHaveBeenCalled();

      // Fast-forward time
      await jest.advanceTimersByTimeAsync(30000);
      expect(discoverSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Worker Discovery (Kubernetes)', () => {
    it('should discover workers from Kubernetes', async () => {
      const mockService = {
        metadata: { name: 'assistant-service' },
        spec: { ports: [{ port: 8080 }] },
      };

      mockCoreV1ApiInstance.listNamespacedService.mockImplementation(
        (opts: any) => {
          const labelSelector = opts?.labelSelector;
          if (labelSelector === 'app=assistant-worker') {
            return Promise.resolve({ body: { items: [mockService] } });
          }
          return Promise.resolve({ body: { items: [] } });
        },
      );

      await adapter.onModuleInit();

      // Check internal state via getWorkers or public method
      // Using 'any' bypass to checking internal map if needed, but getWorkers is better
      const workers = await adapter.getWorkers('assistant-worker');
      expect(workers.length).toBe(1);
      expect(workers[0].id).toBe('assistant-worker-assistant-service');
      expect(workers[0].endpoint).toBe('http://assistant-service:8080');
    });

    it('should fallback to static workers if K8s discovery fails', async () => {
      mockCoreV1ApiInstance.listNamespacedService.mockRejectedValue(
        new Error('K8s Error'),
      );

      await adapter.onModuleInit();

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Failed to discover workers from Kubernetes',
        expect.any(Error),
      );

      // Verification of static fallback
      // Static fallback setup:
      mockConfigService.get.mockReturnValue('http://static-host:3000');

      // We need to re-trigger discovery or rely on the one from onModuleInit which failed
      // Since onModuleInit calls discoverWorkers which catches error and calls loadStaticWorkers

      const workers = await adapter.getWorkers('static');
      expect(workers.length).toBeGreaterThan(0);
      expect(workers[0].id).toContain('static');
    });
  });

  describe('Worker Discovery (Static)', () => {
    it('should load static workers when K8s api is null', async () => {
      // Setup static mode
      jest.clearAllMocks();
      mockConfigService.get.mockImplementation((key, defaultValue) => {
        if (key === 'WORKER_DISCOVERY_MODE') return 'static';
        if (key === 'ASSISTANT_WORKER_URL') return 'http://localhost:4000';
        return defaultValue;
      });

      const module = await Test.createTestingModule({
        providers: [
          KubernetesWorkerRegistryAdapter,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const staticAdapter = module.get<KubernetesWorkerRegistryAdapter>(
        KubernetesWorkerRegistryAdapter,
      );

      // Trigger manually or via onModuleInit
      // onModuleInit calls discoverWorkers which checks k8sApi, if null calls loadStaticWorkers
      await staticAdapter.onModuleInit();

      const allWorkers = await staticAdapter.getAllWorkers();
      const assistant = allWorkers.find(
        (w) => (w.type as any) === 'assistant-worker',
      );
      expect(assistant).toBeDefined();
      expect(assistant?.endpoint).toBe('http://localhost:4000');
    });
  });

  describe('getWorkers lookup logic', () => {
    it('should return empty if no workers found', async () => {
      mockCoreV1ApiInstance.listNamespacedService.mockResolvedValue({
        body: { items: [] },
      });
      const map = adapter['workers'];
      map.clear();

      const workers = await adapter.getWorkers('non-existent');
      expect(workers).toEqual([]);
    });

    // Test the fuzzy matching "if key.includes(type) || workers.some..."
    it('should find workers by fuzzy match', async () => {
      // Manually populating map to test logic without k8s complexity
      const map = adapter['workers'];
      map.set('custom-complex-worker', [
        {
          id: '1',
          type: 'complex-worker',
          endpoint: 'http://foo',
          status: 'unknown',
        },
      ]);

      const workers = await adapter.getWorkers('complex');
      expect(workers.length).toBe(1);
      expect(workers[0].id).toBe('1');
    });
  });

  describe('updateWorkerHealth', () => {
    it('should update worker health', async () => {
      const map = adapter['workers'];
      map.set('test-type', [
        {
          id: 'test-id',
          type: 'test-type',
          endpoint: 'http://test',
          status: 'unknown',
        },
      ]);

      await adapter.updateWorkerHealth('test-id', 'healthy');

      const workers = await adapter.getWorkers('test-type');
      // Map to Domain Worker status
      // The mapping logic maps infraWorker.status to worker.status
      // infraWorker.status is updated to 'healthy'
      // mapToDomainWorker sets worker.status = infraWorker.status
      expect(workers[0].status).toBe(WorkerStatus.HEALTHY);
    });
  });
});
