/**
 * Learning Orchestrator Service
 * 
 * Domain-layer service that orchestrates Genius Agent learning cycles.
 * 
 * Responsibilities:
 * - Coordinate expert pool for parallel research
 * - Select topics based on learning mode and priorities
 * - Allocate experts by topic complexity
 * - Validate expert work
 * - Integrate results into knowledge base
 * - Track learning metrics and patterns
 * 
 * This service implements the core learning intelligence:
 * - User-Directed mode: Execute on selected topics
 * - Autonomous mode: Auto-select high-priority, under-researched topics
 * - Scheduled mode: Cron-based recurring research cycles
 */

export interface LearningTopicSelection {
  topicId: string;
  topicName: string;
  complexity: 1 | 2 | 3 | 4 | 5 | 6; // ICS layers
  priority: number;
  researchGap: number; // 0-1 indicating how much is unknown
}

export interface ExpertAllocation {
  topicId: string;
  expertCount: number;
  specializations: string[];
}

export interface LearningSessionMetrics {
  topicsAttempted: number;
  topicsCompleted: number;
  totalSourcesFound: number;
  averageConfidence: number;
  successRate: number;
  escalationsTriggered: number;
  executionTimeMs: number;
}

export interface LearningSessionResult {
  sessionId: string;
  mode: 'user-directed' | 'autonomous' | 'scheduled';
  topicsProcessed: LearningTopicSelection[];
  expertReports: any[];
  integrationStats: {
    nodesAdded: number;
    edgesAdded: number;
    conflictsResolved: number;
  };
  metrics: LearningSessionMetrics;
  startTime: Date;
  endTime: Date;
}

export class LearningOrchestrator {
  private sessionHistory: LearningSessionResult[] = [];
  private readonly maxHistorySize = 50;
  private metrics = {
    totalSessionsCompleted: 0,
    totalTopicsResearched: 0,
    totalExpertsSpawned: 0,
    averageSessionDuration: 0,
    successRate: 0.8,
  };

  /**
   * Orchestrate a complete learning cycle
   * 
   * Workflow:
   * 1. Select topics based on learning mode
   * 2. Allocate experts by complexity
   * 3. Execute research in parallel
   * 4. Validate results
   * 5. Integrate into knowledge base
   * 6. Update metrics and history
   */
  async orchestrateLearningCycle(
    config: {
      mode: 'user-directed' | 'autonomous' | 'scheduled';
      topicIds?: string[];
      maxTopics?: number;
      maxConcurrentExperts?: number;
      autoValidate?: boolean;
    },
  ): Promise<LearningSessionResult> {
    const sessionId = `lsess_${Date.now()}`;
    const startTime = new Date();

    // Phase 1: Topic Selection
    const selectedTopics = await this.selectTopics(config);

    // Phase 2: Expert Allocation
    const allocations = this.allocateExperts(selectedTopics, config.maxConcurrentExperts || 1);

    // Phase 3: Parallel Research (would be coordinated via expert pool)
    const expertReports = await this.executeResearch(allocations);

    // Phase 4: Validation (if enabled)
    if (config.autoValidate !== false) {
      await this.validateReports(expertReports);
    }

    // Phase 5: Integration
    const integrationStats = await this.integrateResults(expertReports);

    // Phase 6: Metrics Update
    const endTime = new Date();
    const metrics = this.buildMetrics(expertReports, endTime.getTime() - startTime.getTime());

    const result: LearningSessionResult = {
      sessionId,
      mode: config.mode,
      topicsProcessed: selectedTopics,
      expertReports,
      integrationStats,
      metrics,
      startTime,
      endTime,
    };

    // Update history
    this.sessionHistory.push(result);
    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory.shift();
    }

    // Update global metrics
    this.updateGlobalMetrics(result);

    return result;
  }

  /**
   * Select topics based on learning mode and criteria
   */
  private async selectTopics(config: any): Promise<LearningTopicSelection[]> {
    // User-Directed: use provided IDs
    if (config.mode === 'user-directed' && config.topicIds?.length) {
      return config.topicIds.slice(0, config.maxTopics || 5).map((id: string) => ({
        topicId: id,
        topicName: `Topic ${id}`,
        complexity: 3 as const,
        priority: 10,
        researchGap: 0.5,
      }));
    }

    // Autonomous: auto-select by priority and research gaps
    return [
      {
        topicId: 'auto_1',
        topicName: 'Auto-selected Topic 1',
        complexity: 3 as const,
        priority: 15,
        researchGap: 0.8,
      },
      {
        topicId: 'auto_2',
        topicName: 'Auto-selected Topic 2',
        complexity: 2 as const,
        priority: 12,
        researchGap: 0.7,
      },
    ].slice(0, config.maxTopics || 5);
  }

  /**
   * Allocate experts based on topic complexity
   * 
   * Strategy:
   * - Simple topics (L1-L2): 1 expert
   * - Medium topics (L3-L4): 2 experts
   * - Complex topics (L5-L6): 3+ experts
   */
  private allocateExperts(
    topics: LearningTopicSelection[],
    maxConcurrent: number,
  ): ExpertAllocation[] {
    return topics.map((topic) => {
      let expertCount = 1;
      const specializations: string[] = [];

      if (topic.complexity <= 2) {
        expertCount = 1;
        specializations.push('general');
      } else if (topic.complexity <= 4) {
        expertCount = Math.min(2, maxConcurrent);
        specializations.push('primary', 'validation');
      } else {
        expertCount = Math.min(3, maxConcurrent);
        specializations.push('primary', 'secondary', 'synthesis');
      }

      return {
        topicId: topic.topicId,
        expertCount,
        specializations,
      };
    });
  }

  /**
   * Execute research across allocated experts
   */
  private async executeResearch(_allocations: ExpertAllocation[]): Promise<any[]> {
    // In production, this coordinates with ExpertPoolManager
    // For now, return mock reports
    return [
      {
        expertId: 'exp_1',
        topicId: 'topic_1',
        status: 'completed',
        sourcesFound: 5,
        confidence: 0.85,
        executionTimeMs: 5000,
      },
    ];
  }

  /**
   * Validate expert reports for quality
   */
  private async validateReports(_reports: any[]): Promise<void> {
    // In production, coordinates with ValidationService
    // Checks for: citation quality, source reliability, confidence scores, etc.
  }

  /**
   * Integrate results into knowledge base
   */
  private async integrateResults(_reports: any[]): Promise<any> {
    // In production, coordinates with KnowledgeGraphService
    // Merges new nodes/edges, resolves conflicts, updates indices
    return {
      nodesAdded: 3,
      edgesAdded: 2,
      conflictsResolved: 0,
    };
  }

  /**
   * Build session metrics from expert reports
   */
  private buildMetrics(reports: any[], durationMs: number): LearningSessionMetrics {
    const completed = reports.filter((r) => r.status === 'completed').length;
    const totalSources = reports.reduce((sum, r) => sum + (r.sourcesFound || 0), 0);
    const avgConfidence =
      reports.length > 0 ? reports.reduce((sum, r) => sum + (r.confidence || 0.7), 0) / reports.length : 0.7;

    return {
      topicsAttempted: reports.length,
      topicsCompleted: completed,
      totalSourcesFound: totalSources,
      averageConfidence: avgConfidence,
      successRate: reports.length > 0 ? completed / reports.length : 0,
      escalationsTriggered: 0,
      executionTimeMs: durationMs,
    };
  }

  /**
   * Update global metrics
   */
  private updateGlobalMetrics(result: LearningSessionResult): void {
    this.metrics.totalSessionsCompleted++;
    this.metrics.totalTopicsResearched += result.metrics.topicsAttempted;
    this.metrics.totalExpertsSpawned += result.expertReports.length;
    this.metrics.successRate = (this.metrics.successRate + result.metrics.successRate) / 2;

    const totalDuration =
      this.metrics.averageSessionDuration * (this.metrics.totalSessionsCompleted - 1) +
      result.metrics.executionTimeMs;
    this.metrics.averageSessionDuration = totalDuration / this.metrics.totalSessionsCompleted;
  }

  /**
   * Get session history
   */
  getSessionHistory(): LearningSessionResult[] {
    return [...this.sessionHistory];
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}
