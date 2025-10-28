/**
 * Meta-Learning Strategies Service
 * 
 * Application-layer service that defines strategies for autonomous learning.
 * 
 * Strategies:
 * - Topic prioritization: Which topics to research first
 * - Expert allocation: How many experts per topic
 * - Knowledge integration: How to merge new knowledge
 * - Escalation triggers: When to involve user
 * 
 * These strategies guide the Genius Agent's autonomous learning behavior.
 */

export interface TopicPriority {
  topicId: string;
  score: number; // 0-100
  reasoning: string;
}

export interface ExpertAllocationStrategy {
  complexity: number;
  expertCount: number;
  specializations: string[];
  timebudget?: number; // milliseconds
}

export interface KnowledgeIntegrationStrategy {
  mode: 'append' | 'merge' | 'replace';
  conflictResolution: 'manual' | 'auto-merge' | 'keep-existing' | 'prefer-new';
  sourceWeighting: boolean;
}

export interface EscalationStrategy {
  confidenceThreshold: number;
  conflictThreshold: number;
  maxRetries: number;
  manualReviewRequired: boolean;
}

export class MetaLearningStrategies {
  /**
   * Calculate topic prioritization scores
   * 
   * Factors:
   * - Research gap (how much is unknown)
   * - User interest (explicit or implicit)
   * - Knowledge prerequisites (foundational topics)
   * - Time budget
   */
  calculateTopicPriorities(
    topics: any[],
    config?: {
      maxTopics?: number;
      timebudgetMs?: number;
      userPreferences?: string[];
    },
  ): TopicPriority[] {
    const priorities: TopicPriority[] = [];

    for (const topic of topics) {
      let score = 50; // Base score

      // Factor 1: Research gap (high gap = high priority)
      if (topic.researchGap) {
        score += topic.researchGap * 30; // 0-30 points
      }

      // Factor 2: Priority level
      if (topic.priority) {
        score += Math.min(topic.priority, 20); // 0-20 points
      }

      // Factor 3: User preference
      if (config?.userPreferences?.includes(topic.topicId)) {
        score += 15;
      }

      // Factor 4: Complexity (balance: not too hard, not too easy)
      if (topic.complexity) {
        const optimalComplexity = 3; // Medium complexity preferred
        const complexityDiff = Math.abs(topic.complexity - optimalComplexity);
        score -= complexityDiff * 2; // Favor medium complexity
      }

      priorities.push({
        topicId: topic.topicId,
        score: Math.min(100, Math.max(0, score)),
        reasoning: `Gap: ${topic.researchGap?.toFixed(2) || '?'}, Priority: ${topic.priority || '?'}, Complexity: ${topic.complexity || '?'}`,
      });
    }

    // Sort by score descending
    priorities.sort((a, b) => b.score - a.score);

    // Limit by config
    if (config?.maxTopics) {
      return priorities.slice(0, config.maxTopics);
    }

    return priorities;
  }

  /**
   * Determine expert allocation based on topic complexity
   * 
   * Strategy:
   * - L1-L2 (Simple): 1 expert
   * - L3-L4 (Medium): 2 experts (primary + validation)
   * - L5-L6 (Complex): 3+ experts (primary + secondary + synthesis)
   */
  allocateExpertsByComplexity(complexity: number): ExpertAllocationStrategy {
    if (complexity <= 2) {
      return {
        complexity,
        expertCount: 1,
        specializations: ['general'],
        timebudget: 300000, // 5 minutes
      };
    }

    if (complexity <= 4) {
      return {
        complexity,
        expertCount: 2,
        specializations: ['primary', 'validation'],
        timebudget: 600000, // 10 minutes
      };
    }

    return {
      complexity,
      expertCount: 3,
      specializations: ['primary', 'secondary', 'synthesis'],
      timebudget: 900000, // 15 minutes
    };
  }

  /**
   * Allocate experts based on confidence levels
   * 
   * Strategy:
   * - High confidence (>0.8): 1 expert (monitor only)
   * - Medium confidence (0.5-0.8): 2 experts (validate)
   * - Low confidence (<0.5): 3+ experts (deep investigation)
   */
  allocateExpertsByConfidence(currentConfidence: number): ExpertAllocationStrategy {
    if (currentConfidence > 0.8) {
      return {
        complexity: 1,
        expertCount: 1,
        specializations: ['monitor'],
        timebudget: 120000, // 2 minutes
      };
    }

    if (currentConfidence > 0.5) {
      return {
        complexity: 2,
        expertCount: 2,
        specializations: ['primary', 'validation'],
        timebudget: 300000, // 5 minutes
      };
    }

    return {
      complexity: 4,
      expertCount: 3,
      specializations: ['primary', 'secondary', 'conflict-resolution'],
      timebudget: 600000, // 10 minutes
    };
  }

  /**
   * Determine knowledge integration strategy
   * 
   * Modes:
   * - Append: Add new nodes/edges without modification
   * - Merge: Combine with existing knowledge where appropriate
   * - Replace: Prefer new research over old
   */
  getIntegrationStrategy(config?: { preferNew?: boolean }): KnowledgeIntegrationStrategy {
    return {
      mode: 'merge',
      conflictResolution: config?.preferNew ? 'prefer-new' : 'auto-merge',
      sourceWeighting: true,
    };
  }

  /**
   * Determine escalation strategy
   * 
   * Triggers escalation when:
   * - Confidence drops below threshold
   * - Conflicting information detected
   * - Max retries exceeded
   */
  getEscalationStrategy(config?: { strictMode?: boolean }): EscalationStrategy {
    return {
      confidenceThreshold: config?.strictMode ? 0.7 : 0.5,
      conflictThreshold: 0.3, // Connection strength threshold for conflicts
      maxRetries: config?.strictMode ? 1 : 3,
      manualReviewRequired: config?.strictMode ?? false,
    };
  }

  /**
   * Evaluate if escalation should be triggered
   */
  shouldEscalate(
    confidence: number,
    escalationStrategy: EscalationStrategy,
    retryCount = 0,
  ): { shouldEscalate: boolean; reason?: string } {
    if (confidence < escalationStrategy.confidenceThreshold) {
      return {
        shouldEscalate: true,
        reason: `Confidence ${confidence.toFixed(2)} below threshold ${escalationStrategy.confidenceThreshold}`,
      };
    }

    if (retryCount >= escalationStrategy.maxRetries) {
      return {
        shouldEscalate: true,
        reason: `Max retries (${retryCount}) exceeded`,
      };
    }

    if (escalationStrategy.manualReviewRequired) {
      return {
        shouldEscalate: true,
        reason: 'Manual review mode enabled',
      };
    }

    return { shouldEscalate: false };
  }

  /**
   * Optimize batch size based on system load
   * 
   * Adaptive batching:
   * - High load: reduce batch size
   * - Low load: increase batch size
   * - Optimal: balance throughput vs latency
   */
  optimizeBatchSize(
    baseSize: number,
    systemLoad: number, // 0-1
    constraint?: { min?: number; max?: number },
  ): number {
    // Base: half batch if high load, full batch if low load
    const loadFactor = 1 - systemLoad * 0.5;
    let optimized = Math.ceil(baseSize * loadFactor);

    // Apply constraints
    if (constraint?.min) {
      optimized = Math.max(optimized, constraint.min);
    }
    if (constraint?.max) {
      optimized = Math.min(optimized, constraint.max);
    }

    return optimized;
  }

  /**
   * Recommend learning mode based on context
   */
  recommendLearningMode(context: {
    hasUserInput?: boolean;
    isScheduledTime?: boolean;
    hasBacklog?: boolean;
  }): 'user-directed' | 'autonomous' | 'scheduled' {
    if (context.hasUserInput) {
      return 'user-directed';
    }

    if (context.isScheduledTime) {
      return 'scheduled';
    }

    if (context.hasBacklog) {
      return 'autonomous';
    }

    return 'autonomous'; // Default
  }
}
