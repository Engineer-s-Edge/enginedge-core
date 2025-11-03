import { Test, TestingModule } from '@nestjs/testing';
import { LearningOrchestrator } from '../learning-orchestrator';
import {
  LearningSessionResult,
  LearningTopicSelection,
  ExpertAllocation,
} from '../learning-orchestrator';

describe('LearningOrchestrator', () => {
  let orchestrator: LearningOrchestrator;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [LearningOrchestrator],
    }).compile();

    orchestrator = module.get<LearningOrchestrator>(LearningOrchestrator);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('orchestrateLearningCycle', () => {
    it('should orchestrate complete learning cycle', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'Machine Learning', complexity: 'L4' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(/^session-/);
      expect(result.selectedTopics).toBeDefined();
      expect(result.expertAllocations).toBeDefined();
      expect(result.researchReports).toBeDefined();
      expect(result.validationResults).toBeDefined();
      expect(result.knowledgeIntegration).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should execute 6-phase workflow', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'AI', complexity: 'L3' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.phases).toBeDefined();
      expect(result.phases.length).toBe(6);
      expect(result.phases.map((p: any) => p.phase)).toEqual([
        'Topic Selection',
        'Expert Allocation',
        'Research Execution',
        'Validation',
        'Knowledge Integration',
        'Metrics',
      ]);

      result.phases.forEach((p: any) => {
        expect(p.status).toBe('completed');
        expect(p.duration).toBeGreaterThanOrEqual(0);
      });
    });

    it('should support user-directed learning mode', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [
          { topic: 'Neural Networks', complexity: 'L5' },
          { topic: 'GPT Models', complexity: 'L4' },
        ],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.selectedTopics).toHaveLength(2);
      expect(result.selectedTopics.map((t: any) => t.topic)).toEqual([
        'Neural Networks',
        'GPT Models',
      ]);
    });

    it('should support autonomous learning mode', async () => {
      const config = {
        mode: 'autonomous' as const,
        userId: 'user-456',
        priorGaps: [
          { topic: 'Transformers', severity: 'high' },
          { topic: 'Attention Mechanisms', severity: 'medium' },
        ],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.selectedTopics).toBeDefined();
      expect(result.selectedTopics.length).toBeGreaterThan(0);
    });

    it('should support scheduled learning mode', async () => {
      const config = {
        mode: 'scheduled' as const,
        userId: 'user-789',
        schedule: {
          interval: 'daily',
          time: '09:00',
        },
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('selectTopics', () => {
    it('should select topics in user-directed mode', async () => {
      const topics = [
        { topic: 'Deep Learning', complexity: 'L5' },
        { topic: 'CNNs', complexity: 'L4' },
      ];

      const selection = await orchestrator.selectTopics('user-directed', {
        topics,
      });

      expect(selection).toBeDefined();
      expect(selection.selectedTopics).toEqual(topics);
      expect(selection.selectionReason).toMatch(/user.*directed|explicit/i);
    });

    it('should auto-select topics in autonomous mode', async () => {
      const gaps = [
        { topic: 'RNNs', severity: 'high' },
        { topic: 'LSTMs', severity: 'medium' },
      ];

      const selection = await orchestrator.selectTopics('autonomous', {
        priorGaps: gaps,
      });

      expect(selection).toBeDefined();
      expect(selection.selectedTopics.length).toBeGreaterThan(0);
    });

    it('should validate topic complexity levels', async () => {
      const topics = [
        { topic: 'Topic1', complexity: 'L1' },
        { topic: 'Topic2', complexity: 'L6' },
      ];

      const selection = await orchestrator.selectTopics('user-directed', {
        topics,
      });

      expect(selection.selectedTopics).toEqual(topics);
    });
  });

  describe('allocateExperts', () => {
    it('should allocate experts based on complexity', async () => {
      const topics = [
        { topic: 'Basic ML', complexity: 'L1' },
        { topic: 'Advanced ML', complexity: 'L5' },
      ];

      const allocation = await orchestrator.allocateExperts(topics);

      expect(allocation).toBeDefined();
      expect(allocation.allocations).toBeDefined();
      expect(allocation.allocations.length).toBe(2);

      // L1-L2: 1 expert
      expect(allocation.allocations[0].count).toBe(1);
      expect(allocation.allocations[0].specializations).toEqual(['primary']);

      // L5-L6: 3+ experts
      expect(allocation.allocations[1].count).toBeGreaterThanOrEqual(3);
    });

    it('should allocate appropriate specializations', async () => {
      const topics = [{ topic: 'Complex Topic', complexity: 'L6' }];

      const allocation = await orchestrator.allocateExperts(topics);

      expect(allocation.allocations[0].specializations).toContain('primary');
      expect(
        allocation.allocations[0].specializations.length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('should handle mixed complexity levels', async () => {
      const topics = [
        { topic: 'L1 Topic', complexity: 'L1' },
        { topic: 'L3 Topic', complexity: 'L3' },
        { topic: 'L5 Topic', complexity: 'L5' },
      ];

      const allocation = await orchestrator.allocateExperts(topics);

      expect(allocation.allocations).toHaveLength(3);
      expect(allocation.totalExperts).toBeGreaterThanOrEqual(6); // 1+2+3
    });
  });

  describe('executeResearch', () => {
    it('should execute research for all topics', async () => {
      const topics = [{ topic: 'AI', complexity: 'L3' }];
      const allocations = [
        {
          topic: 'AI',
          specializations: ['primary', 'secondary'],
          count: 2,
        },
      ];

      const reports = await orchestrator.executeResearch(
        topics,
        allocations,
        'user-123',
      );

      expect(reports).toBeDefined();
      expect(reports.length).toBeGreaterThan(0);
      reports.forEach((r: any) => {
        expect(r.topic).toBeDefined();
        expect(r.sources).toBeDefined();
        expect(Array.isArray(r.sources)).toBe(true);
        expect(r.findings).toBeDefined();
        expect(r.confidence).toBeDefined();
      });
    });

    it('should handle parallel research execution', async () => {
      const topics = [
        { topic: 'Topic1', complexity: 'L2' },
        { topic: 'Topic2', complexity: 'L2' },
      ];
      const allocations = [
        { topic: 'Topic1', specializations: ['primary'], count: 1 },
        { topic: 'Topic2', specializations: ['primary'], count: 1 },
      ];

      const reports = await orchestrator.executeResearch(
        topics,
        allocations,
        'user-123',
      );

      expect(reports).toHaveLength(2);
    });
  });

  describe('validateReports', () => {
    it('should validate research reports', async () => {
      const reports = [
        {
          topic: 'ML',
          sources: ['source1', 'source2'],
          findings: ['finding1'],
          confidence: 0.85,
        },
      ];

      const validation = await orchestrator.validateReports(reports);

      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
      expect(validation.validationResults).toBeDefined();
      expect(Array.isArray(validation.validationResults)).toBe(true);
    });

    it('should check report quality', async () => {
      const reports = [
        {
          topic: 'AI',
          sources: ['s1', 's2', 's3'],
          findings: ['f1', 'f2'],
          confidence: 0.9,
        },
      ];

      const validation = await orchestrator.validateReports(reports);

      expect(validation.validationResults[0]).toBeDefined();
      expect(validation.validationResults[0]).toHaveProperty('quality');
      expect(validation.validationResults[0]).toHaveProperty('issues');
    });
  });

  describe('integrateResults', () => {
    it('should integrate validated results into knowledge base', async () => {
      const validated = {
        isValid: true,
        validationResults: [
          {
            topic: 'ML',
            quality: 'high',
            issues: [],
          },
        ],
      };

      const integration = await orchestrator.integrateResults(validated);

      expect(integration).toBeDefined();
      expect(integration.topicsIntegrated).toBeDefined();
      expect(integration.knowledgeUpdate).toBeDefined();
    });

    it('should track integration success', async () => {
      const validated = {
        isValid: true,
        validationResults: [
          {
            topic: 'Deep Learning',
            quality: 'medium',
            issues: [],
          },
        ],
      };

      const integration = await orchestrator.integrateResults(validated);

      expect(integration.successCount).toBeGreaterThanOrEqual(0);
      expect(integration.failureCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('buildMetrics', () => {
    it('should calculate session metrics', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'ML', complexity: 'L3' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.topicsCovered).toBeGreaterThanOrEqual(1);
      expect(result.metrics.expertCount).toBeGreaterThanOrEqual(1);
      expect(result.metrics.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(result.metrics.avgConfidence).toBeLessThanOrEqual(1);
      expect(result.metrics.totalSources).toBeGreaterThanOrEqual(0);
      expect(result.metrics.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should track learning effectiveness', async () => {
      const config = {
        mode: 'autonomous' as const,
        userId: 'user-456',
        priorGaps: [{ topic: 'GANs', severity: 'high' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.metrics).toHaveProperty('effectivenessScore');
      expect(result.metrics.effectivenessScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Learning modes', () => {
    it('user-directed mode uses explicit topics', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'Reinforcement Learning', complexity: 'L5' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(
        result.selectedTopics.some(
          (t: any) => t.topic === 'Reinforcement Learning',
        ),
      ).toBe(true);
    });

    it('autonomous mode selects from gaps', async () => {
      const config = {
        mode: 'autonomous' as const,
        userId: 'user-456',
        priorGaps: [{ topic: 'Optimization', severity: 'high' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.selectedTopics.length).toBeGreaterThan(0);
    });

    it('scheduled mode respects schedule', async () => {
      const config = {
        mode: 'scheduled' as const,
        userId: 'user-789',
        schedule: {
          interval: 'weekly',
          time: '14:00',
        },
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result).toBeDefined();
    });
  });

  describe('Session tracking', () => {
    it('should generate unique session IDs', async () => {
      const config1 = {
        mode: 'user-directed' as const,
        userId: 'user-1',
        topics: [{ topic: 'A', complexity: 'L2' }],
      };

      const config2 = {
        mode: 'user-directed' as const,
        userId: 'user-2',
        topics: [{ topic: 'B', complexity: 'L2' }],
      };

      const result1 = await orchestrator.orchestrateLearningCycle(config1);
      const result2 = await orchestrator.orchestrateLearningCycle(config2);

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });

    it('should track user ID in session', async () => {
      const userId = 'special-user-123';
      const config = {
        mode: 'user-directed' as const,
        userId,
        topics: [{ topic: 'Topic', complexity: 'L2' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      expect(result.userId).toBe(userId);
    });
  });

  describe('Error handling', () => {
    it('should handle missing topics in user-directed mode', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [],
      };

      await expect(
        orchestrator.orchestrateLearningCycle(config),
      ).rejects.toThrow(/topics.*required|empty/i);
    });

    it('should handle missing gaps in autonomous mode', async () => {
      const config = {
        mode: 'autonomous' as const,
        userId: 'user-456',
        priorGaps: [],
      };

      await expect(
        orchestrator.orchestrateLearningCycle(config),
      ).rejects.toThrow(/gaps.*required|empty/i);
    });

    it('should handle invalid complexity levels', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'Topic', complexity: 'INVALID' }],
      };

      await expect(
        orchestrator.orchestrateLearningCycle(config),
      ).rejects.toThrow(/complexity/i);
    });
  });

  describe('Phase execution', () => {
    it('should execute all phases in order', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'ML', complexity: 'L3' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      const phaseNames = result.phases.map((p: any) => p.phase);
      expect(phaseNames).toEqual([
        'Topic Selection',
        'Expert Allocation',
        'Research Execution',
        'Validation',
        'Knowledge Integration',
        'Metrics',
      ]);
    });

    it('should track phase durations', async () => {
      const config = {
        mode: 'user-directed' as const,
        userId: 'user-123',
        topics: [{ topic: 'AI', complexity: 'L2' }],
      };

      const result = await orchestrator.orchestrateLearningCycle(config);

      result.phases.forEach((p: any) => {
        expect(p.duration).toBeDefined();
        expect(typeof p.duration).toBe('number');
        expect(p.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
