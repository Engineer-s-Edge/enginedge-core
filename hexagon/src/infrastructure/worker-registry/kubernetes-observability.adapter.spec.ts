import { Test, TestingModule } from '@nestjs/testing';
import { KubernetesObservabilityAdapter } from './kubernetes-observability.adapter';
import { ConfigService } from '@nestjs/config';
import { KubeConfig } from '@kubernetes/client-node';

describe('KubernetesObservabilityAdapter', () => {
  let adapter: KubernetesObservabilityAdapter;
  let mockK8sApi: any;
  let mockConfig: Partial<ConfigService>;

  beforeEach(async () => {
    mockK8sApi = {
      readNamespacedPodLog: jest.fn().mockResolvedValue('logs'),
      readNamespacedPod: jest.fn().mockResolvedValue({ status: { phase: 'Running' } }),
      listNamespacedEvent: jest.fn().mockResolvedValue({ items: [] }),
      listNamespacedPod: jest.fn().mockResolvedValue({ items: [] }),
    };

    jest.spyOn(KubeConfig.prototype, 'makeApiClient').mockReturnValue(mockK8sApi);

    mockConfig = {
      get: jest.fn((key: string, def: any) => {
        if (key === 'WORKER_DISCOVERY_MODE') return 'kubernetes';
        return def;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [KubernetesObservabilityAdapter, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    adapter = module.get<KubernetesObservabilityAdapter>(KubernetesObservabilityAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should get pod logs', async () => {
    const logs = await adapter.getPodLogs('pod1', 'ns');
    expect(logs).toBe('logs');
    expect(mockK8sApi.readNamespacedPodLog).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pod1', namespace: 'ns' })
    );
  });

  it('should get pod status', async () => {
    const status = await adapter.getPodStatus('pod1', 'ns');
    expect(status).toBeDefined();
    expect(mockK8sApi.readNamespacedPod).toHaveBeenCalled();
  });

  it('should get pod events', async () => {
    const events = await adapter.getPodEvents('pod1', 'ns');
    expect(events).toEqual([]);
    expect(mockK8sApi.listNamespacedEvent).toHaveBeenCalled();
  });

  // Failing gracefully if k8s api is null (e.g. static mode)
  it('should throw error if not in k8s mode', async () => {
    jest.spyOn(mockConfig, 'get').mockImplementation((key, def) => {
      if (key === 'WORKER_DISCOVERY_MODE') return 'static';
      return def;
    });

    const moduleRef = await Test.createTestingModule({
      providers: [KubernetesObservabilityAdapter, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    const staticAdapter = moduleRef.get<KubernetesObservabilityAdapter>(
      KubernetesObservabilityAdapter
    );

    await expect(staticAdapter.getPodLogs('p')).rejects.toThrow(
      'Kubernetes API client not available'
    );
  });
});
