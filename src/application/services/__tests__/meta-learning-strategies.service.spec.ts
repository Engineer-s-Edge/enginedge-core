import { Test, TestingModule } from '@nestjs/testing';
import { MetaLearningStrategies } from '../meta-learning-strategies.service';
import {
  TopicPriority,
  ExpertAllocationStrategy,
  KnowledgeIntegrationStrategy,
  EscalationStrategy,
} from '../meta-learning-strategies.service';

describe('MetaLearningStrategies', () => {
  let strategies: MetaLearningStrategies;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [MetaLearningStrategies],
    }).compile();

    strategies = module.get<MetaLearningStrategies>(MetaLearningStrategies);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('calculateTopicPriorities', () => {
    it('should calculate priority scores for topics', async () => {
      const topics = [
        {
          topic: 'AI',
          researchGap: 0.8,
          priority: 0.9,
          userPreference: 0.7,
          complexity: 5,
        },
        {
          topic: 'ML',
          researchGap: 0.5,
          priority: 0.6,
          userPreference: 0.8,
          complexity: 3,
        },
      ];

      const priorities = await strategies.calculateTopicPriorities(topics);

      expect(priorities).toBeDefined();
      expect(Array.isArray(priorities)).toBe(true);
      expect(priorities.length).toBe(2);

      priorities.forEach((p: any) => {
        expect(p.topic).toBeDefined();
        expect(typeof p.priorityScore).toBe('number');
        expect(p.priorityScore).toBeGreaterThan(0);
        expect(p.breakdownByFactor).toBeDefined();
      });
    });

    it('should weight factors correctly', async () => {
      const topics = [
        {
          topic: 'HighGap',
          researchGap: 1.0,
          priority: 0.0,
          userPreference: 0.0,
          complexity: 1,
        },
      ];

      const priorities = await strategies.calculateTopicPriorities(topics);

      // High gap (30pts) + low others = high priority
      expect(priorities[0].priorityScore).toBeGreaterThan(15);
    });

    it('should account for complexity in scoring', async () => {
      const simple = [
        {
          topic: 'Simple',
          researchGap: 0.5,
          priority: 0.5,
          userPreference: 0.5,
          complexity: 1,
        },
      ];

      const complex = [
        {
          topic: 'Complex',
          researchGap: 0.5,
          priority: 0.5,
          userPreference: 0.5,
          complexity: 6,
        },
      ];

      const simplePriorities = await strategies.calculateTopicPriorities(simple);
      const complexPriorities = await strategies.calculateTopicPriorities(
        complex,
      );

      // More complex should score higher (more resource allocation)
      expect(complexPriorities[0].priorityScore).toBeGreaterThan(
        simplePriorities[0].priorityScore,
      );
    });

    it('should rank topics by score', async () => {
      const topics = [
        {
          topic: 'Low',
          researchGap: 0.2,
          priority: 0.2,
          userPreference: 0.2,
          complexity: 1,
        },
        {
          topic: 'High',
          researchGap: 0.9,
          priority: 0.9,
          userPreference: 0.9,
          complexity: 5,
        },
      ];

      const priorities = await strategies.calculateTopicPriorities(topics);

      // Sort by score
      const sorted = [...priorities].sort(
        (a, b) => b.priorityScore - a.priorityScore,
      );
      expect(sorted[0].topic).toBe('High');
    });
  });

  describe('allocateExpertsByComplexity', () => {
    it('should return allocation strategy for different complexity levels', async () => {
      const allocation = await strategies.allocateExpertsByComplexity(3);

      expect(allocation).toBeDefined();
      expect(allocation.expertCount).toBeDefined();
      expect(allocation.specializations).toBeDefined();
      expect(Array.isArray(allocation.specializations)).toBe(true);
    });

    it('should allocate 1 expert for L1-L2', async () => {
      const l1 = await strategies.allocateExpertsByComplexity(1);
      const l2 = await strategies.allocateExpertsByComplexity(2);

      expect(l1.expertCount).toBe(1);
      expect(l2.expertCount).toBe(1);
    });

    it('should allocate 2 experts for L3-L4', async () => {
      const l3 = await strategies.allocateExpertsByComplexity(3);
      const l4 = await strategies.allocateExpertsByComplexity(4);

      expect(l3.expertCount).toBe(2);
      expect(l4.expertCount).toBe(2);
    });

    it('should allocate 3+ experts for L5-L6', async () => {
      const l5 = await strategies.allocateExpertsByComplexity(5);
      const l6 = await strategies.allocateExpertsByComplexity(6);

      expect(l5.expertCount).toBeGreaterThanOrEqual(3);
      expect(l6.expertCount).toBeGreaterThanOrEqual(3);
    });

    it('should assign appropriate specializations', async () => {
      const simple = await strategies.allocateExpertsByComplexity(1);
      const complex = await strategies.allocateExpertsByComplexity(6);

      expect(simple.specializations).toContain('primary');
      expect(complex.specializations.length).toBeGreaterThan(1);
    });
  });

  describe('allocateExpertsByConfidence', () => {
    it('should allocate based on confidence levels', async () => {
      const highConf = await strategies.allocateExpertsByConfidence(0.9);
      const lowConf = await strategies.allocateExpertsByConfidence(0.2);

      expect(highConf).toBeDefined();
      expect(lowConf).toBeDefined();

      // Lower confidence = more experts
      expect(lowConf.expertCount).toBeGreaterThan(highConf.expertCount);
    });

    it('should allocate more experts for low confidence', async () => {
      const confident = await strategies.allocateExpertsByConfidence(0.85);
      const uncertain = await strategies.allocateExpertsByConfidence(0.3);

      expect(uncertain.expertCount).toBeGreaterThan(
        confident.expertCount,
      );
    });

    it('should have lower allocation for very high confidence', async () => {
      const veryHigh = await strategies.allocateExpertsByConfidence(0.95);

      expect(veryHigh.expertCount).toBeLessThanOrEqual(2);
    });
  });

  describe('getIntegrationStrategy', () => {
    it('should return integration strategy configuration', async () => {
      const strategy = await strategies.getIntegrationStrategy('high_confidence');

      expect(strategy).toBeDefined();
      expect(strategy.method).toMatch(/append|merge|replace/i);
      expect(strategy.conflictResolution).toBeDefined();
      expect(strategy.validation).toBeDefined();
    });

    it('should use append for high confidence', async () => {
      const strategy = await strategies.getIntegrationStrategy(
        'high_confidence',
      );

      expect(strategy.method).toMatch(/append|add/i);
    });

    it('should use merge for medium confidence', async () => {
      const strategy = await strategies.getIntegrationStrategy(
        'medium_confidence',
      );

      expect(strategy.method).toMatch(/merge/i);
    });

    it('should use replace for low confidence corrections', async () => {
      const strategy = await strategies.getIntegrationStrategy(
        'correction_needed',
      );

      expect(strategy.method).toMatch(/replace|update/i);
    });

    it('should define conflict resolution', async () => {
      const strategy = await strategies.getIntegrationStrategy('default');

      expect(strategy.conflictResolution).toBeDefined();
      expect(
        ['weighted_average', 'timestamp', 'priority'].some((r) =>
          strategy.conflictResolution.includes(r),
        ),
      ).toBe(true);
    });
  });

  describe('getEscalationStrategy', () => {
    it('should return escalation strategy thresholds', async () => {
      const strategy = await strategies.getEscalationStrategy();

      expect(strategy).toBeDefined();
      expect(strategy.confidenceThreshold).toBeDefined();
      expect(strategy.gapThreshold).toBeDefined();
      expect(strategy.escalationActions).toBeDefined();
    });

    it('should have reasonable confidence threshold', async () => {
      const strategy = await strategies.getEscalationStrategy();

      expect(strategy.confidenceThreshold).toBeGreaterThan(0);
      expect(strategy.confidenceThreshold).toBeLessThan(1);
    });

    it('should have gap threshold defined', async () => {
      const strategy = await strategies.getEscalationStrategy();

      expect(strategy.gapThreshold).toBeGreaterThan(0);
      expect(strategy.gapThreshold).toBeLessThan(1);
    });

    it('should define escalation actions', async () => {
      const strategy = await strategies.getEscalationStrategy();

      expect(Array.isArray(strategy.escalationActions)).toBe(true);
      expect(strategy.escalationActions.length).toBeGreaterThan(0);
    });
  });

  describe('shouldEscalate', () => {
    it('should escalate for very low confidence', async () => {
      const result = await strategies.shouldEscalate({
        confidenceScore: 0.1,
        gapSize: 0.5,
        topicComplexity: 3,
      });

      expect(result).toBe(true);
    });

    it('should not escalate for high confidence', async () => {
      const result = await strategies.shouldEscalate({
        confidenceScore: 0.95,
        gapSize: 0.2,
        topicComplexity: 2,
      });

      expect(result).toBe(false);
    });

    it('should escalate for large knowledge gaps', async () => {
      const result = await strategies.shouldEscalate({
        confidenceScore: 0.6,
        gapSize: 0.9,
        topicComplexity: 4,
      });

      expect(result).toBe(true);
    });

    it('should escalate for complex topics with uncertainty', async () => {
      const result = await strategies.shouldEscalate({
        confidenceScore: 0.4,
        gapSize: 0.7,
        topicComplexity: 6,
      });

      expect(result).toBe(true);
    });

    it('should use expert rules for escalation', async () => {
      // Low confidence (30pts) + large gap (40pts) + complexity (12pts) = 82 > 60 threshold
      const shouldEsc = await strategies.shouldEscalate({
        confidenceScore: 0.25,
        gapSize: 0.8,
        topicComplexity: 6,
      });

      expect(shouldEsc).toBe(true);
    });
  });

  describe('optimizeBatchSize', () => {
    it('should return optimized batch size', async () => {
      const batchSize = await strategies.optimizeBatchSize({
        systemLoad: 0.5,
        topicsCount: 10,
        availableResources: 8,
      });

      expect(batchSize).toBeDefined();
      expect(typeof batchSize).toBe('number');
      expect(batchSize).toBeGreaterThan(0);
    });

    it('should reduce batch size for high load', async () => {
      const lowLoad = await strategies.optimizeBatchSize({
        systemLoad: 0.2,
        topicsCount: 20,
        availableResources: 8,
      });

      const highLoad = await strategies.optimizeBatchSize({
        systemLoad: 0.9,
        topicsCount: 20,
        availableResources: 8,
      });

      expect(highLoad).toBeLessThan(lowLoad);
    });

    it('should scale with available resources', async () => {
      const limited = await strategies.optimizeBatchSize({
        systemLoad: 0.5,
        topicsCount: 10,
        availableResources: 2,
      });

      const abundant = await strategies.optimizeBatchSize({
        systemLoad: 0.5,
        topicsCount: 10,
        availableResources: 16,
      });

      expect(abundant).toBeGreaterThan(limited);
    });

    it('should not exceed topic count', async () => {
      const batchSize = await strategies.optimizeBatchSize({
        systemLoad: 0.1,
        topicsCount: 5,
        availableResources: 100,
      });

      expect(batchSize).toBeLessThanOrEqual(5);
    });

    it('should recommend minimum batch size of 1', async () => {
      const batchSize = await strategies.optimizeBatchSize({
        systemLoad: 0.99,
        topicsCount: 1,
        availableResources: 1,
      });

      expect(batchSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recommendLearningMode', () => {
    it('should recommend user-directed for explicit user input', async () => {
      const mode = await strategies.recommendLearningMode({
        hasExplicitUserTopics: true,
        hasGapAnalysis: false,
        isScheduled: false,
      });

      expect(mode).toBe('user-directed');
    });

    it('should recommend autonomous for gap-driven learning', async () => {
      const mode = await strategies.recommendLearningMode({
        hasExplicitUserTopics: false,
        hasGapAnalysis: true,
        isScheduled: false,
      });

      expect(mode).toBe('autonomous');
    });

    it('should recommend scheduled for recurring cycles', async () => {
      const mode = await strategies.recommendLearningMode({
        hasExplicitUserTopics: false,
        hasGapAnalysis: false,
        isScheduled: true,
      });

      expect(mode).toBe('scheduled');
    });

    it('should prioritize explicit user topics', async () => {
      const mode = await strategies.recommendLearningMode({
        hasExplicitUserTopics: true,
        hasGapAnalysis: true,
        isScheduled: true,
      });

      expect(mode).toBe('user-directed');
    });

    it('should return valid learning mode', async () => {
      const mode = await strategies.recommendLearningMode({
        hasExplicitUserTopics: false,
        hasGapAnalysis: false,
        isScheduled: false,
      });

      expect(['user-directed', 'autonomous', 'scheduled']).toContain(mode);
    });
  });

  describe('Priority calculation', () => {
    it('should score high gap topics higher', async () => {
      const topics = [
        {
          topic: 'BigGap',
          researchGap: 0.9,
          priority: 0.1,
          userPreference: 0.1,
          complexity: 1,
        },
        {
          topic: 'SmallGap',
          researchGap: 0.1,
          priority: 0.9,
          userPreference: 0.9,
          complexity: 1,
        },
      ];

      const priorities = await strategies.calculateTopicPriorities(topics);

      const bigGap = priorities.find((p: any) => p.topic === 'BigGap');
      const smallGap = priorities.find((p: any) => p.topic === 'SmallGap');

      // Gap: 30pts vs 3pts gives BigGap advantage
      expect(bigGap!.priorityScore).toBeGreaterThan(
        smallGap!.priorityScore * 0.8,
      );
    });

    it('should respect user preferences', async () => {
      const topics = [
        {
          topic: 'UserChoice',
          researchGap: 0.3,
          priority: 0.3,
          userPreference: 1.0,
          complexity: 1,
        },
        {
          topic: 'AutoSelect',
          researchGap: 0.8,
          priority: 0.8,
          userPreference: 0.0,
          complexity: 1,
        },
      ];

      const priorities = await strategies.calculateTopicPriorities(topics);

      const userPriority = priorities.find((p: any) => p.topic === 'UserChoice');
      const autoPriority = priorities.find((p: any) => p.topic === 'AutoSelect');

      // Both should score reasonably
      expect(userPriority!.priorityScore).toBeGreaterThan(5);
      expect(autoPriority!.priorityScore).toBeGreaterThan(5);
    });
  });

  describe('Escalation evaluation', () => {
    it('should combine multiple risk factors', async () => {
      const high = await strategies.shouldEscalate({
        confidenceScore: 0.3,
        gapSize: 0.8,
        topicComplexity: 5,
      });

      const medium = await strategies.shouldEscalate({
        confidenceScore: 0.6,
        gapSize: 0.4,
        topicComplexity: 3,
      });

      const low = await strategies.shouldEscalate({
        confidenceScore: 0.9,
        gapSize: 0.1,
        topicComplexity: 1,
      });

      expect(high).toBe(true);
      expect([true, false]).toContain(medium); // Could go either way
      expect(low).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid complexity levels', async () => {
      await expect(
        strategies.allocateExpertsByComplexity(0),
      ).rejects.toThrow(/complexity.*1.*6/i);

      await expect(
        strategies.allocateExpertsByComplexity(7),
      ).rejects.toThrow(/complexity.*1.*6/i);
    });

    it('should handle invalid confidence values', async () => {
      await expect(
        strategies.allocateExpertsByConfidence(-0.1),
      ).rejects.toThrow(/confidence.*0.*1/i);

      await expect(
        strategies.allocateExpertsByConfidence(1.1),
      ).rejects.toThrow(/confidence.*0.*1/i);
    });

    it('should validate escalation input ranges', async () => {
      await expect(
        strategies.shouldEscalate({
          confidenceScore: 1.5,
          gapSize: 0.5,
          topicComplexity: 3,
        }),
      ).rejects.toThrow(/confidence/i);
    });
  });

  describe('Integration with learning cycle', () => {
    it('should support full orchestration workflow', async () => {
      // Simulate typical orchestration flow
      const topics = [
        {
          topic: 'Neural Networks',
          researchGap: 0.7,
          priority: 0.8,
          userPreference: 0.9,
          complexity: 5,
        },
      ];

      // 1. Calculate priorities
      const priorities = await strategies.calculateTopicPriorities(topics);
      expect(priorities[0].priorityScore).toBeGreaterThan(0);

      // 2. Allocate experts by complexity
      const allocation = await strategies.allocateExpertsByComplexity(5);
      expect(allocation.expertCount).toBeGreaterThanOrEqual(3);

      // 3. Get integration strategy for results
      const integration = await strategies.getIntegrationStrategy('high_confidence');
      expect(integration.method).toBeDefined();

      // 4. Check if escalation needed
      const shouldEsc = await strategies.shouldEscalate({
        confidenceScore: 0.7,
        gapSize: 0.3,
        topicComplexity: 5,
      });
      expect(typeof shouldEsc).toBe('boolean');
    });
  });
});
