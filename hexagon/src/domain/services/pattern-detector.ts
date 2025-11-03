/**
 * Pattern Detector Service
 *
 * Domain-layer service that analyzes research patterns to identify:
 * - Knowledge gaps (topics mentioned but not fully researched)
 * - Topic bridges (connections between related concepts)
 * - Learning priorities (which topics should be researched next)
 * - Confidence patterns (areas with low research quality)
 *
 * Used by Genius Agent to guide autonomous learning and identify escalations.
 */

export interface KnowledgeGap {
  description: string;
  mentionedIn: string[];
  estimatedComplexity: number;
  priority: number;
}

export interface TopicBridge {
  topicA: string;
  topicB: string;
  connectionStrength: number; // 0-1
  bridgingConcepts: string[];
}

export interface ConfidencePattern {
  topic: string;
  averageConfidence: number;
  lowConfidenceAreas: string[];
  recommendedResearch: string;
}

export interface DetectionResult {
  knowledgeGaps: KnowledgeGap[];
  bridges: TopicBridge[];
  confidencePatterns: ConfidencePattern[];
  nextPriorities: string[];
  escalationRecommendations: string[];
}

export class PatternDetector {
  /**
   * Analyze research reports to detect patterns
   *
   * @param reports Expert research reports
   * @param knowledgeGraph Current knowledge graph state
   * @returns Pattern analysis result
   */
  analyzePatterns(reports: any[], _knowledgeGraph?: any): DetectionResult {
    const result: DetectionResult = {
      knowledgeGaps: [],
      bridges: [],
      confidencePatterns: [],
      nextPriorities: [],
      escalationRecommendations: [],
    };

    // Phase 1: Detect knowledge gaps
    result.knowledgeGaps = this.detectKnowledgeGaps(reports);

    // Phase 2: Identify topic bridges
    result.bridges = this.identifyBridges(reports);

    // Phase 3: Analyze confidence patterns
    result.confidencePatterns = this.analyzeConfidence(reports);

    // Phase 4: Determine learning priorities
    result.nextPriorities = this.determinePriorities(result);

    // Phase 5: Generate escalation recommendations
    result.escalationRecommendations = this.generateEscalations(result);

    return result;
  }

  /**
   * Detect knowledge gaps by analyzing research limitations
   */
  private detectKnowledgeGaps(reports: any[]): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];

    for (const report of reports) {
      // Look for mentioned but not fully researched topics
      if (report.concepts && report.concepts.length > 0) {
        for (const concept of report.concepts) {
          if (report.confidence && report.confidence < 0.6) {
            gaps.push({
              description: `Incomplete research on "${concept}"`,
              mentionedIn: [report.topicResearched || 'unknown'],
              estimatedComplexity: 3,
              priority: Math.ceil((1 - report.confidence) * 10),
            });
          }
        }
      }
    }

    // Deduplicate by description
    const seen = new Set<string>();
    return gaps.filter((gap) => {
      if (seen.has(gap.description)) return false;
      seen.add(gap.description);
      return true;
    });
  }

  /**
   * Identify connections between topics (bridges)
   */
  private identifyBridges(reports: any[]): TopicBridge[] {
    const bridges: TopicBridge[] = [];
    const topicConcepts = new Map<string, Set<string>>();

    // Build topic-concept map
    for (const report of reports) {
      const topic = report.topicResearched || 'unknown';
      if (!topicConcepts.has(topic)) {
        topicConcepts.set(topic, new Set());
      }

      if (report.concepts) {
        for (const concept of report.concepts) {
          topicConcepts.get(topic)!.add(concept);
        }
      }
    }

    // Find overlapping concepts (bridges)
    const topics = Array.from(topicConcepts.keys());
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const topicA = topics[i];
        const topicB = topics[j];
        const conceptsA = topicConcepts.get(topicA) || new Set();
        const conceptsB = topicConcepts.get(topicB) || new Set();

        const intersection = new Set(
          Array.from(conceptsA).filter((c) => conceptsB.has(c)),
        );

        if (intersection.size > 0) {
          bridges.push({
            topicA,
            topicB,
            connectionStrength:
              intersection.size / Math.max(conceptsA.size, conceptsB.size),
            bridgingConcepts: Array.from(intersection),
          });
        }
      }
    }

    return bridges;
  }

  /**
   * Analyze confidence patterns in research
   */
  private analyzeConfidence(reports: any[]): ConfidencePattern[] {
    const patterns: ConfidencePattern[] = [];

    for (const report of reports) {
      const confidence = report.confidence || 0.7;
      const lowConfidenceAreas: string[] = [];

      // Identify areas with low confidence
      if (confidence < 0.5) {
        lowConfidenceAreas.push('overall research quality');
      }

      if (report.sourcesUsed && report.sourcesUsed < 3) {
        lowConfidenceAreas.push('insufficient sources');
      }

      patterns.push({
        topic: report.topicResearched || 'unknown',
        averageConfidence: confidence,
        lowConfidenceAreas,
        recommendedResearch: `Additional research needed for "${report.topicResearched}"`,
      });
    }

    return patterns;
  }

  /**
   * Determine next research priorities based on patterns
   */
  private determinePriorities(result: DetectionResult): string[] {
    const priorities: string[] = [];

    // Priority 1: High-priority knowledge gaps
    const highPriorityGaps = result.knowledgeGaps
      .filter((gap) => gap.priority >= 7)
      .slice(0, 3)
      .map((gap) => gap.description);
    priorities.push(...highPriorityGaps);

    // Priority 2: Bridge topics for knowledge integration
    const bridgeTopics = result.bridges
      .filter((b) => b.connectionStrength > 0.6)
      .slice(0, 2)
      .map((b) => `Bridge: ${b.topicA} ↔ ${b.topicB}`);
    priorities.push(...bridgeTopics);

    // Priority 3: Low confidence areas
    const lowConfidenceTopics = result.confidencePatterns
      .filter((p) => p.averageConfidence < 0.6)
      .slice(0, 2)
      .map((p) => `Re-research: ${p.topic}`);
    priorities.push(...lowConfidenceTopics);

    return priorities;
  }

  /**
   * Generate escalation recommendations
   */
  private generateEscalations(result: DetectionResult): string[] {
    const escalations: string[] = [];

    // Escalate if many knowledge gaps
    if (result.knowledgeGaps.length > 5) {
      escalations.push(
        'High number of knowledge gaps detected - consider broader research',
      );
    }

    // Escalate if low average confidence
    const avgConfidence =
      result.confidencePatterns.length > 0
        ? result.confidencePatterns.reduce(
            (sum, p) => sum + p.averageConfidence,
            0,
          ) / result.confidencePatterns.length
        : 0.7;

    if (avgConfidence < 0.5) {
      escalations.push(
        'Low overall research confidence - escalate for expert review',
      );
    }

    // Escalate if conflicting information
    const conflictingTopics = result.bridges.filter(
      (b) => b.connectionStrength < 0.2,
    ).length;
    if (conflictingTopics > 2) {
      escalations.push('Conflicting information detected across topics');
    }

    return escalations;
  }

  /**
   * Recommend topics for next learning cycle
   */
  recommendNextTopics(lastResult: DetectionResult, limit = 5): string[] {
    return lastResult.nextPriorities.slice(0, limit);
  }
}
