import { Test, TestingModule } from '@nestjs/testing';
import { KubernetesObservabilityService } from './kubernetes-observability.service';
import { IKubernetesObservabilityPort } from '@application/ports/kubernetes-observability.port';

describe('KubernetesObservabilityService', () => {
  let service: KubernetesObservabilityService;
  let mockPort: Partial<IKubernetesObservabilityPort>;

  beforeEach(async () => {
    mockPort = {
      getPodLogs: jest.fn(),
      getPodStatus: jest.fn(),
      getPodEvents: jest.fn(),
      getPodMetrics: jest.fn(),
      getPodsByWorkerType: jest.fn(),
      getWorkerTypeHealth: jest.fn(),
    } as unknown as Partial<IKubernetesObservabilityPort>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KubernetesObservabilityService,
        { provide: 'IKubernetesObservabilityPort', useValue: mockPort },
      ],
    }).compile();

    service = module.get<KubernetesObservabilityService>(
      KubernetesObservabilityService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should delegate getPodLogs to port', async () => {
    await service.getPodLogs('pod', 'ns', 'container', 10);
    expect(mockPort.getPodLogs).toHaveBeenCalledWith(
      'pod',
      'ns',
      'container',
      10,
    );
  });

  it('should delegate getPodStatus to port', async () => {
    await service.getPodStatus('pod', 'ns');
    expect(mockPort.getPodStatus).toHaveBeenCalledWith('pod', 'ns');
  });

  it('should delegate getPodEvents to port', async () => {
    await service.getPodEvents('pod', 'ns', 5);
    expect(mockPort.getPodEvents).toHaveBeenCalledWith('pod', 'ns', 5);
  });

  it('should delegate getPodMetrics to port', async () => {
    await service.getPodMetrics('pod', 'ns');
    expect(mockPort.getPodMetrics).toHaveBeenCalledWith('pod', 'ns');
  });

  it('should delegate getPodsByWorkerType to port', async () => {
    await service.getPodsByWorkerType('type', 'ns');
    expect(mockPort.getPodsByWorkerType).toHaveBeenCalledWith('type', 'ns');
  });

  it('should delegate getWorkerTypeHealth to port', async () => {
    await service.getWorkerTypeHealth('type', 'ns');
    expect(mockPort.getWorkerTypeHealth).toHaveBeenCalledWith('type', 'ns');
  });
});
