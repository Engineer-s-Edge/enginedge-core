import { Test, TestingModule } from '@nestjs/testing';
import { PatternDetector } from '../pattern-detector';
import {
  KnowledgeGap,
  TopicBridge,
  ConfidencePattern,
  DetectionResult,
} from '../pattern-detector';

describe('PatternDetector', () => {
  let detector: PatternDetector;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [PatternDetector],
    }).compile();

    detector = module.get<PatternDetector>(PatternDetector);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('analyzePatterns', () => {
    it('should execute complete pattern analysis', async () => {
      const expertReports = [
        {
          topic: 'Machine Learning',
          findings: ['ML is about data', 'algorithms matter'],
          sources: ['s1', 's2', 's3'],
          confidence: 0.85,
        },
        {
          topic: 'Neural Networks',
          findings: ['Networks use layers'],
          sources: ['s4'],
          confidence: 0.6,
        },
      ];

      const result = await detector.analyzePatterns(expertReports);

      expect(result).toBeDefined();
      expect(result.gaps).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
      expect(result.bridges).toBeDefined();
      expect(result.confidencePatterns).toBeDefined();
      expect(result.priorities).toBeDefined();
      expect(result.escalations).toBeDefined();
    });

    it('should execute 5-phase analysis', async () => {
      const reports = [
        {
          topic: 'AI',
          findings: ['test finding'],
          sources: ['source'],
          confidence: 0.7,
        },
      ];

      const result = await detector.analyzePatterns(reports);

      expect(result.phases).toBeDefined();
      expect(result.phases.length).toBe(5);
      expect(result.phases.map((p: any) => p.phase)).toEqual([
        'Gap Detection',
        'Bridge Identification',
        'Confidence Analysis',
        'Priority Ranking',
        'Escalation Evaluation',
      ]);

      result.phases.forEach((p: any) => {
        expect(p.status).toBe('completed');
      });
    });
  });

  describe('detectKnowledgeGaps', () => {
    it('should detect gaps in research coverage', async () => {
      const reports = [
        {
          topic: 'Deep Learning',
          findings: ['Neural networks exist'],
          sources: ['s1'],
          confidence: 0.7,
        },
        {
          topic: 'NLP',
          findings: [],
          sources: [],
          confidence: 0,
        },
      ];

      const gaps = await detector.detectKnowledgeGaps(reports);

      expect(gaps).toBeDefined();
      expect(Array.isArray(gaps)).toBe(true);
      expect(gaps.length).toBeGreaterThan(0);

      gaps.forEach((gap: any) => {
        expect(gap.topic).toBeDefined();
        expect(gap.severity).toMatch(/low|medium|high|critical/i);
        expect(typeof gap.gapScore).toBe('number');
      });
    });

    it('should identify critical gaps from empty findings', async () => {
      const reports = [
        {
          topic: 'Untouched Topic',
          findings: [],
          sources: [],
          confidence: 0,
        },
      ];

      const gaps = await detector.detectKnowledgeGaps(reports);

      expect(gaps[0].severity).toMatch(/critical|high/i);
      expect(gaps[0].gapScore).toBeGreaterThan(0.7);
    });

    it('should rate gaps by low confidence', async () => {
      const reports = [
        {
          topic: 'Uncertain Topic',
          findings: ['maybe correct'],
          sources: ['maybe valid'],
          confidence: 0.3,
        },
      ];

      const gaps = await detector.detectKnowledgeGaps(reports);

      expect(gaps[0].severity).toMatch(/medium|high/i);
      expect(gaps[0].gapScore).toBeGreaterThan(0.3);
    });
  });

  describe('identifyBridges', () => {
    it('should identify topic connections', async () => {
      const reports = [
        {
          topic: 'Machine Learning',
          findings: ['uses algorithms', 'needs data', 'optimization important'],
          sources: [],
          confidence: 0.8,
        },
        {
          topic: 'Statistics',
          findings: [
            'algorithms matter',
            'data analysis',
            'optimization methods',
          ],
          sources: [],
          confidence: 0.75,
        },
      ];

      const bridges = await detector.identifyBridges(reports);

      expect(bridges).toBeDefined();
      expect(Array.isArray(bridges)).toBe(true);
      expect(bridges.length).toBeGreaterThan(0);

      bridges.forEach((b: any) => {
        expect(b.topic1).toBeDefined();
        expect(b.topic2).toBeDefined();
        expect(b.sharedConcepts).toBeDefined();
        expect(Array.isArray(b.sharedConcepts)).toBe(true);
        expect(b.bridgeStrength).toBeGreaterThanOrEqual(0);
      });
    });

    it('should find strong bridges with shared concepts', async () => {
      const reports = [
        {
          topic: 'Neural Networks',
          findings: ['backpropagation', 'gradients', 'activation functions'],
          sources: [],
          confidence: 0.9,
        },
        {
          topic: 'Deep Learning',
          findings: ['backpropagation', 'layers', 'gradients'],
          sources: [],
          confidence: 0.85,
        },
      ];

      const bridges = await detector.identifyBridges(reports);

      expect(bridges.length).toBeGreaterThan(0);
      const bridge = bridges[0];
      expect(bridge.sharedConcepts.length).toBeGreaterThanOrEqual(2);
      expect(bridge.bridgeStrength).toBeGreaterThan(0.5);
    });

    it('should not identify bridges with no shared concepts', async () => {
      const reports = [
        {
          topic: 'Topic A',
          findings: ['concept1', 'concept2'],
          sources: [],
          confidence: 0.8,
        },
        {
          topic: 'Topic B',
          findings: ['concept3', 'concept4'],
          sources: [],
          confidence: 0.8,
        },
      ];

      const bridges = await detector.identifyBridges(reports);

      expect(bridges.filter((b: any) => b.bridgeStrength > 0).length).toBe(0);
    });
  });

  describe('analyzeConfidence', () => {
    it('should analyze confidence patterns', async () => {
      const reports = [
        {
          topic: 'HighConf',
          findings: ['certain finding'],
          sources: ['s1', 's2', 's3'],
          confidence: 0.95,
        },
        {
          topic: 'LowConf',
          findings: ['uncertain finding'],
          sources: ['s1'],
          confidence: 0.4,
        },
      ];

      const patterns = await detector.analyzeConfidence(reports);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBe(2);

      patterns.forEach((p: any) => {
        expect(p.topic).toBeDefined();
        expect(typeof p.confidenceScore).toBe('number');
        expect(p.riskLevel).toMatch(/low|medium|high/i);
      });
    });

    it('should identify low confidence areas', async () => {
      const reports = [
        {
          topic: 'Risky',
          findings: ['weak evidence'],
          sources: ['questionable'],
          confidence: 0.25,
        },
      ];

      const patterns = await detector.analyzeConfidence(reports);

      expect(patterns[0].riskLevel).toMatch(/high|medium/i);
      expect(patterns[0].confidenceScore).toBeLessThan(0.5);
    });

    it('should track confidence by source count', async () => {
      const reports = [
        {
          topic: 'Strong',
          findings: ['finding'],
          sources: ['s1', 's2', 's3', 's4', 's5'],
          confidence: 0.9,
        },
        {
          topic: 'Weak',
          findings: ['finding'],
          sources: ['s1'],
          confidence: 0.3,
        },
      ];

      const patterns = await detector.analyzeConfidence(reports);

      expect(patterns[0].confidenceScore).toBeGreaterThan(
        patterns[1].confidenceScore,
      );
    });
  });

  describe('determinePriorities', () => {
    it('should prioritize topics for next research cycle', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'Critical Topic', severity: 'critical', gapScore: 0.95 },
        { topic: 'High Topic', severity: 'high', gapScore: 0.7 },
        { topic: 'Low Topic', severity: 'low', gapScore: 0.2 },
      ];

      const priorities = await detector.determinePriorities(gaps);

      expect(priorities).toBeDefined();
      expect(Array.isArray(priorities)).toBe(true);
      expect(priorities.length).toBeGreaterThan(0);

      // Should be sorted by priority (highest first)
      expect(priorities[0].topic).toMatch(/Critical|High/i);
    });

    it('should sort by severity', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'Low', severity: 'low', gapScore: 0.1 },
        { topic: 'Critical', severity: 'critical', gapScore: 0.9 },
        { topic: 'Medium', severity: 'medium', gapScore: 0.5 },
      ];

      const priorities = await detector.determinePriorities(gaps);

      expect(priorities[0].priorityScore).toBeGreaterThanOrEqual(
        priorities[1].priorityScore,
      );
    });

    it('should assign priority scores', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'Topic1', severity: 'high', gapScore: 0.8 },
      ];

      const priorities = await detector.determinePriorities(gaps);

      expect(priorities[0].priorityScore).toBeDefined();
      expect(typeof priorities[0].priorityScore).toBe('number');
      expect(priorities[0].priorityScore).toBeGreaterThan(0);
    });
  });

  describe('generateEscalations', () => {
    it('should recommend escalation for low confidence', async () => {
      const patterns: ConfidencePattern[] = [
        {
          topic: 'Risky',
          confidenceScore: 0.2,
          riskLevel: 'high',
        },
      ];

      const escalations = await detector.generateEscalations(patterns);

      expect(escalations).toBeDefined();
      expect(Array.isArray(escalations)).toBe(true);
      const riskEscalation = escalations.find(
        (e: any) => e.reason === 'low_confidence',
      );
      expect(riskEscalation).toBeDefined();
    });

    it('should not escalate high confidence topics', async () => {
      const patterns: ConfidencePattern[] = [
        {
          topic: 'Solid',
          confidenceScore: 0.95,
          riskLevel: 'low',
        },
      ];

      const escalations = await detector.generateEscalations(patterns);

      expect(escalations.filter((e: any) => e.topic === 'Solid').length).toBe(
        0,
      );
    });

    it('should provide escalation recommendations', async () => {
      const patterns: ConfidencePattern[] = [
        {
          topic: 'Query',
          confidenceScore: 0.35,
          riskLevel: 'high',
        },
      ];

      const escalations = await detector.generateEscalations(patterns);

      if (escalations.length > 0) {
        expect(escalations[0]).toHaveProperty('recommendation');
        expect(typeof escalations[0].recommendation).toBe('string');
      }
    });
  });

  describe('recommendNextTopics', () => {
    it('should recommend research topics for next cycle', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'Vectors', severity: 'high', gapScore: 0.8 },
        { topic: 'Matrices', severity: 'medium', gapScore: 0.5 },
      ];

      const bridges: TopicBridge[] = [
        {
          topic1: 'Vectors',
          topic2: 'Linear Algebra',
          sharedConcepts: ['transformation'],
          bridgeStrength: 0.7,
        },
      ];

      const recommendations = await detector.recommendNextTopics(gaps, bridges);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);

      recommendations.forEach((r: any) => {
        expect(r.topic).toBeDefined();
        expect(r.reason).toBeDefined();
        expect(r.recommendationStrength).toBeGreaterThanOrEqual(0);
      });
    });

    it('should prioritize high-gap topics', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'Priority1', severity: 'critical', gapScore: 0.95 },
        { topic: 'Priority2', severity: 'low', gapScore: 0.1 },
      ];

      const recommendations = await detector.recommendNextTopics(gaps, []);

      const highPriority = recommendations.find(
        (r: any) => r.topic === 'Priority1',
      );
      expect(highPriority).toBeDefined();
      if (highPriority) {
        expect(highPriority.recommendationStrength).toBeGreaterThan(0.5);
      }
    });

    it('should suggest bridge-connected topics', async () => {
      const gaps: KnowledgeGap[] = [
        { topic: 'AI', severity: 'high', gapScore: 0.7 },
      ];

      const bridges: TopicBridge[] = [
        {
          topic1: 'AI',
          topic2: 'Machine Learning',
          sharedConcepts: ['algorithms', 'data'],
          bridgeStrength: 0.8,
        },
      ];

      const recommendations = await detector.recommendNextTopics(gaps, bridges);

      const mlRec = recommendations.find(
        (r: any) => r.topic === 'Machine Learning',
      );
      expect(mlRec).toBeDefined();
    });
  });

  describe('Integration: Full analysis flow', () => {
    it('should complete end-to-end pattern analysis', async () => {
      const reports = [
        {
          topic: 'Transformers',
          findings: [
            'attention mechanism',
            'encoder-decoder',
            'self-attention',
          ],
          sources: ['paper1', 'paper2', 'paper3'],
          confidence: 0.9,
        },
        {
          topic: 'Attention',
          findings: ['query-key-value', 'scaling factor'],
          sources: ['paper2', 'paper4'],
          confidence: 0.85,
        },
        {
          topic: 'Optimization',
          findings: [],
          sources: [],
          confidence: 0,
        },
      ];

      const result = await detector.analyzePatterns(reports);

      // Verify all analysis sections completed
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.escalations).toBeDefined();
      expect(result.priorities.length).toBeGreaterThan(0);

      // Verify gap for Optimization
      const optGap = result.gaps.find((g: any) => g.topic === 'Optimization');
      expect(optGap).toBeDefined();
      if (optGap) {
        expect(optGap.severity).toMatch(/critical|high/i);
      }

      // Verify bridge between Transformers and Attention
      const bridge = result.bridges.find(
        (b: any) =>
          (b.topic1 === 'Transformers' && b.topic2 === 'Attention') ||
          (b.topic1 === 'Attention' && b.topic2 === 'Transformers'),
      );
      expect(bridge).toBeDefined();
    });

    it('should handle empty report list', async () => {
      const result = await detector.analyzePatterns([]);

      expect(result).toBeDefined();
      expect(result.gaps).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
    });

    it('should handle single report', async () => {
      const reports = [
        {
          topic: 'Solo',
          findings: ['finding1', 'finding2'],
          sources: ['source1'],
          confidence: 0.7,
        },
      ];

      const result = await detector.analyzePatterns(reports);

      expect(result.gaps).toBeDefined();
      expect(result.priorities.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should handle reports with missing fields', async () => {
      const reports = [
        {
          topic: 'Incomplete',
          findings: undefined,
          sources: null,
          confidence: 0.5,
        } as any,
      ];

      await expect(detector.analyzePatterns(reports)).rejects.toThrow();
    });

    it('should validate confidence is 0-1', async () => {
      const reports = [
        {
          topic: 'Invalid',
          findings: ['f'],
          sources: ['s'],
          confidence: 1.5,
        },
      ];

      await expect(detector.analyzePatterns(reports)).rejects.toThrow(
        /confidence/i,
      );
    });
  });

  describe('Performance', () => {
    it('should handle large report sets', async () => {
      const reports = Array.from({ length: 50 }, (_, i) => ({
        topic: `Topic${i}`,
        findings: ['f1', 'f2'],
        sources: ['s1'],
        confidence: 0.5 + Math.random() * 0.5,
      }));

      const start = Date.now();
      const result = await detector.analyzePatterns(reports);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    it('should analyze in reasonable time', async () => {
      const reports = Array.from({ length: 20 }, (_, i) => ({
        topic: `Topic${i}`,
        findings: Array.from({ length: 5 }, (_, j) => `finding${j}`),
        sources: Array.from({ length: 3 }, (_, j) => `source${j}`),
        confidence: 0.7,
      }));

      const start = Date.now();
      await detector.analyzePatterns(reports);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000);
    });
  });
});
