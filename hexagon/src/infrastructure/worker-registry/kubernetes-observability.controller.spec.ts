import { Test, TestingModule } from '@nestjs/testing';
import { KubernetesObservabilityController } from './kubernetes-observability.controller';
import { KubernetesObservabilityService } from '@application/services/kubernetes-observability.service';
import { KubernetesObservabilityMetricsService } from './kubernetes-observability-metrics.service';
import { HttpException } from '@nestjs/common';

describe('KubernetesObservabilityController', () => {
  let controller: KubernetesObservabilityController;
  let mockService: Partial<KubernetesObservabilityService>;
  let mockMetrics: Partial<KubernetesObservabilityMetricsService>;

  beforeEach(async () => {
    mockService = {
      getPodLogs: jest.fn().mockResolvedValue('logs'),
      getPodStatus: jest.fn().mockResolvedValue({ phase: 'Running' }),
      getPodEvents: jest.fn().mockResolvedValue([]),
      getPodMetrics: jest.fn().mockResolvedValue({ cpu: '100m' }),
      getPodsByWorkerType: jest.fn().mockResolvedValue([]),
      getWorkerTypeHealth: jest.fn().mockResolvedValue({ healthy: true }),
    };

    mockMetrics = {
      recordOperation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KubernetesObservabilityController],
      providers: [
        { provide: KubernetesObservabilityService, useValue: mockService },
        {
          provide: KubernetesObservabilityMetricsService,
          useValue: mockMetrics,
        },
      ],
    }).compile();

    controller = module.get<KubernetesObservabilityController>(
      KubernetesObservabilityController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPodLogs', () => {
    it('should return logs successfully', async () => {
      const result = await controller.getPodLogs(
        'resume',
        'pod1',
        'ns',
        'c1',
        '100',
      );
      expect(result).toEqual({ podName: 'pod1', logs: 'logs' });
      expect(mockService.getPodLogs).toHaveBeenCalledWith(
        'pod1',
        'ns',
        'c1',
        100,
      );
      expect(mockMetrics.recordOperation).toHaveBeenCalledWith(
        'getPodLogs',
        'resume',
        expect.any(Number),
        true,
      );
    });

    it('should handle errors', async () => {
      (mockService.getPodLogs as jest.Mock).mockRejectedValue(
        new Error('Failed'),
      );
      await expect(controller.getPodLogs('resume', 'pod1')).rejects.toThrow(
        HttpException,
      );
      expect(mockMetrics.recordOperation).toHaveBeenCalledWith(
        'getPodLogs',
        'resume',
        expect.any(Number),
        false,
      );
    });
  });

  describe('getPodStatus', () => {
    it('should return status', async () => {
      const result = await controller.getPodStatus('resume', 'pod1');
      expect(result).toEqual({ phase: 'Running' });
      expect(mockMetrics.recordOperation).toHaveBeenCalledWith(
        'getPodStatus',
        'resume',
        expect.any(Number),
        true,
      );
    });
  });

  // Add tests for getPodEvents, getPodMetrics, getPodsByWorkerType, getWorkerTypeHealth
});
