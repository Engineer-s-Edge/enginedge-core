import { Injectable, Inject } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { ExpertPoolManager } from './expert-pool.service';
import { TopicCatalogService } from './topic-catalog.service';
import { CategoryService } from './category.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import {
  LearningMode,
  UserDirectedConfig,
  AutonomousConfig,
  ScheduledConfig,
  LearningSessionResult,
  TopicSelectionCriteria,
  LearningStatistics,
} from '../types/learning-mode.types';
import { ExpertReport } from '../types/expert-pool.types';
import { GeniusAgentIdType } from '@core/infrastructure/database/utils/custom_types';
import { TopicCatalogEntry, TopicStatus } from '../entities/topic-catalog.entity';

/**
 * Learning Mode Service
 * 
 * Implements the 3 learning modes for Genius Agent:
 * 1. User-Directed: User explicitly selects topics to research
 * 2. Autonomous: Agent auto-selects high-priority topics from catalog
 * 3. Scheduled: Cron-based automated research cycles
 * 
 * Each mode uses ExpertPoolManager to spawn Expert Agents for research.
 */
@Injectable()
export class LearningModeService {
  private sessionCounter = 0;
  private sessionHistory: LearningSessionResult[] = [];
  private readonly maxHistorySize = 100;

  constructor(
    @Inject(ExpertPoolManager)
    private readonly expertPool: ExpertPoolManager,
    @Inject(TopicCatalogService)
    private readonly topicCatalog: TopicCatalogService,
    @Inject(CategoryService)
    private readonly categoryService: CategoryService,
    @Inject(KnowledgeGraphService)
    private readonly knowledgeGraph: KnowledgeGraphService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info('LearningModeService initialized', LearningModeService.name);
  }

  // ========================================
  // User-Directed Learning Mode
  // ========================================

  /**
   * Start User-Directed learning session
   * User explicitly selects which topics to research
   */
  async startUserDirectedSession(
    geniusAgentId: GeniusAgentIdType,
    config: UserDirectedConfig,
  ): Promise<LearningSessionResult> {
    this.logger.info(
      `Starting User-Directed session for ${config.topicIds.length} topics`,
      LearningModeService.name,
    );

    const sessionId = this.generateSessionId();
    const startTime = new Date();

    // Update pool config if specified
    if (config.maxConcurrentExperts) {
      this.expertPool.updateConfig({
        maxConcurrentExperts: config.maxConcurrentExperts,
      });
    }

    // Fetch topics
    const topics = await Promise.all(
      config.topicIds.map((id) => this.topicCatalog.getById(id)),
    );

    const validTopics = topics.filter((t: TopicCatalogEntry | null): t is TopicCatalogEntry => t !== null);

    if (validTopics.length === 0) {
      throw new Error('No valid topics found for the provided IDs');
    }

    // Sort by priority if specified
    const sortedTopics = config.priority
      ? validTopics.sort((a: TopicCatalogEntry, b: TopicCatalogEntry) => b.researchPriority - a.researchPriority)
      : validTopics;

    // Mark topics as in-progress
    await Promise.all(
      sortedTopics.map((topic: TopicCatalogEntry) =>
        this.topicCatalog.updateStatus(topic.id, TopicStatus.IN_PROGRESS),
      ),
    );

    // Research topics
    const expertReports: ExpertReport[] = [];
    const errors: string[] = [];

    if (config.waitForCompletion) {
      // Sequential/parallel with wait
      for (const topic of sortedTopics) {
        try {
          const report = await this.researchTopic(geniusAgentId, topic);
          expertReports.push(report);
        } catch (error) {
          const info = getErrorInfo(error);
          errors.push(`Topic "${topic.name}": ${info.message}`);
          this.logger.error(
            `Failed to research topic "${topic.name}": ${info.message}`,
            LearningModeService.name,
          );
        }
      }
    } else {
      // Fire and forget
      sortedTopics.forEach((topic: TopicCatalogEntry) => {
        this.researchTopic(geniusAgentId, topic)
          .then((report) => expertReports.push(report))
          .catch((error) => {
            const info = getErrorInfo(error);
            errors.push(`Topic "${topic.name}": ${info.message}`);
          });
      });
    }

    const endTime = new Date();
    const result = await this.buildSessionResult(
      sessionId,
      LearningMode.USER_DIRECTED,
      geniusAgentId,
      startTime,
      endTime,
      expertReports,
      errors.length > 0 ? errors : undefined,
    );

    this.addToHistory(result);
    return result;
  }

  // ========================================
  // Autonomous Learning Mode
  // ========================================

  /**
   * Start Autonomous learning session
   * Agent auto-selects high-priority topics from catalog
   */
  async startAutonomousSession(
    geniusAgentId: GeniusAgentIdType,
    config: AutonomousConfig,
  ): Promise<LearningSessionResult> {
    this.logger.info(
      `Starting Autonomous session (batch size: ${config.batchSize})`,
      LearningModeService.name,
    );

    const sessionId = this.generateSessionId();
    const startTime = new Date();

    // Update pool config
    if (config.maxConcurrentExperts) {
      this.expertPool.updateConfig({
        maxConcurrentExperts: config.maxConcurrentExperts,
      });
    }

    // Build selection criteria
    const criteria: TopicSelectionCriteria = {
      minPriority: config.minPriority ?? 0,
      limit: config.batchSize,
      categoryWeights: config.categoryWeights,
      maxCategoryDistance: config.maxCategoryDistance,
      includeOrganic: config.preferOrganic ?? true,
      excludeRecentlyResearched: 24, // Don't re-research within 24 hours
    };

    // Select topics
    const topics = await this.selectTopics(criteria);

    if (topics.length === 0) {
      this.logger.warn('No topics selected for autonomous session', LearningModeService.name);
      const endTime = new Date();
      return this.buildSessionResult(
        sessionId,
        LearningMode.AUTONOMOUS,
        geniusAgentId,
        startTime,
        endTime,
        [],
        ['No topics available matching criteria'],
      );
    }

    this.logger.info(
      `Selected ${topics.length} topics for autonomous research`,
      LearningModeService.name,
    );

    // Mark as in-progress
    await Promise.all(
      topics.map(topic => this.topicCatalog.updateStatus(topic.id, TopicStatus.IN_PROGRESS)),
    );

    // Research topics
    const expertReports: ExpertReport[] = [];
    const errors: string[] = [];
    let completed = 0;

    for (const topic of topics) {
      // Check stop condition
      if (config.stopAfter && config.stopAfter > 0 && completed >= config.stopAfter) {
        this.logger.info(
          `Stopping autonomous session after ${completed} completed topics`,
          LearningModeService.name,
        );
        break;
      }

      try {
        const report = await this.researchTopic(geniusAgentId, topic);
        expertReports.push(report);
        
        if (report.status === 'completed') {
          completed++;
        }
      } catch (error) {
        const info = getErrorInfo(error);
        errors.push(`Topic "${topic.name}": ${info.message}`);
      }
    }

    const endTime = new Date();
    const result = await this.buildSessionResult(
      sessionId,
      LearningMode.AUTONOMOUS,
      geniusAgentId,
      startTime,
      endTime,
      expertReports,
      errors.length > 0 ? errors : undefined,
    );

    this.addToHistory(result);
    return result;
  }

  // ========================================
  // Scheduled Learning Mode
  // ========================================

  /**
   * Execute a scheduled learning cycle
   * Called by cron scheduler
   */
  async executeScheduledCycle(
    geniusAgentId: GeniusAgentIdType,
    config: ScheduledConfig,
  ): Promise<LearningSessionResult> {
    this.logger.info(
      `Executing scheduled learning cycle (${config.cronExpression})`,
      LearningModeService.name,
    );

    if (!config.enabled) {
      throw new Error('Scheduled learning is disabled');
    }

    const sessionId = this.generateSessionId();
    const startTime = new Date();

    // Update pool config
    if (config.maxConcurrentExperts) {
      this.expertPool.updateConfig({
        maxConcurrentExperts: config.maxConcurrentExperts,
      });
    }

    // Build criteria from config
    const criteria: TopicSelectionCriteria = {
      minPriority: config.minPriority ?? 0,
      limit: config.batchSize,
      categoryWeights: config.categoryWeights,
      includeOrganic: true,
      excludeRecentlyResearched: 48, // Don't repeat within 48 hours for scheduled
    };

    // Select topics
    const topics = await this.selectTopics(criteria);

    if (topics.length === 0) {
      this.logger.warn('No topics for scheduled cycle', LearningModeService.name);
      const endTime = new Date();
      return this.buildSessionResult(
        sessionId,
        LearningMode.SCHEDULED,
        geniusAgentId,
        startTime,
        endTime,
        [],
        ['No topics available'],
      );
    }

    // Mark as in-progress
    await Promise.all(
      topics.map((topic: TopicCatalogEntry) => this.topicCatalog.updateStatus(topic.id, TopicStatus.IN_PROGRESS)),
    );

    // Research with time budget
    const expertReports: ExpertReport[] = [];
    const errors: string[] = [];
    const timeBudget = config.timeBudgetMs ?? 30 * 60 * 1000; // Default 30 min
    const deadline = startTime.getTime() + timeBudget;

    for (const topic of topics) {
      // Check time budget
      if (Date.now() >= deadline) {
        this.logger.info('Scheduled cycle reached time budget', LearningModeService.name);
        break;
      }

      try {
        const report = await this.researchTopic(geniusAgentId, topic);
        expertReports.push(report);
      } catch (error) {
        const info = getErrorInfo(error);
        errors.push(`Topic "${topic.name}": ${info.message}`);
      }
    }

    const endTime = new Date();
    const result = await this.buildSessionResult(
      sessionId,
      LearningMode.SCHEDULED,
      geniusAgentId,
      startTime,
      endTime,
      expertReports,
      errors.length > 0 ? errors : undefined,
    );

    this.addToHistory(result);
    return result;
  }

  // ========================================
  // Topic Selection
  // ========================================

  /**
   * Select topics based on criteria
   * Used by Autonomous and Scheduled modes
   */
  private async selectTopics(criteria: TopicSelectionCriteria): Promise<TopicCatalogEntry[]> {
    // Get all not-started topics
    const candidates = await this.topicCatalog.findByStatus(TopicStatus.NOT_STARTED);

    // Filter by priority
    let filtered = candidates.filter((t: TopicCatalogEntry) => t.researchPriority >= criteria.minPriority);

    // Filter by recent research
    if (criteria.excludeRecentlyResearched) {
      const cutoff = new Date(Date.now() - criteria.excludeRecentlyResearched * 60 * 60 * 1000);
      filtered = filtered.filter((t: TopicCatalogEntry) => !t.lastUpdated || t.lastUpdated < cutoff);
    }

    // Filter by organic if preferred
    if (criteria.includeOrganic) {
      const organic = filtered.filter((t: TopicCatalogEntry) => t.sourceType === 'organic');
      if (organic.length > 0) {
        // Prefer organic, but include others if not enough
        const nonOrganic = filtered.filter((t: TopicCatalogEntry) => t.sourceType !== 'organic');
        filtered = [...organic, ...nonOrganic.slice(0, Math.max(0, criteria.limit - organic.length))];
      }
    }

    // Apply category weights
    if (criteria.categoryWeights) {
      filtered = this.applyWeights(filtered, criteria.categoryWeights);
    }

    // Apply category distance filter
    if (criteria.maxCategoryDistance !== undefined) {
      filtered = await this.filterByDistance(filtered, criteria.maxCategoryDistance);
    }

    // Sort by priority
    filtered.sort((a: TopicCatalogEntry, b: TopicCatalogEntry) => b.researchPriority - a.researchPriority);

    // Limit
    return filtered.slice(0, criteria.limit);
  }

  /**
   * Apply category weights to topic list
   */
  private applyWeights(
    topics: TopicCatalogEntry[],
    weights: Record<string, number>,
  ): TopicCatalogEntry[] {
    // Calculate weighted scores
    const scored = topics.map(topic => {
      const weight = weights[topic.category] ?? 1.0;
      return {
        topic,
        score: topic.researchPriority * weight,
      };
    });

    // Sort by weighted score
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.topic);
  }

  /**
   * Filter topics by category distance from existing graph
   */
  private async filterByDistance(
    topics: TopicCatalogEntry[],
    maxDistance: number,
  ): Promise<TopicCatalogEntry[]> {
    // Get all categories in knowledge graph
    const graphStats = await this.knowledgeGraph.getGraphStatistics();
    const existingCategories = Object.keys(graphStats.nodesByCategory);

    if (existingCategories.length === 0) {
      // Empty graph, allow all
      return topics;
    }

    // Filter by minimum distance to any existing category
    const filtered: TopicCatalogEntry[] = [];

    for (const topic of topics) {
      let minDistance = Infinity;

      for (const existingCat of existingCategories) {
        const distance = this.categoryService.getCategoryDistance(topic.category, existingCat);
        minDistance = Math.min(minDistance, distance);
      }

      if (minDistance <= maxDistance) {
        filtered.push(topic);
      }
    }

    return filtered;
  }

  // ========================================
  // Expert Orchestration
  // ========================================

  /**
   * Research a single topic using Expert Pool
   */
  private async researchTopic(
    geniusAgentId: GeniusAgentIdType,
    topic: TopicCatalogEntry,
  ): Promise<ExpertReport> {
    this.logger.info(`Researching topic: "${topic.name}"`, LearningModeService.name);

    // Create expert factory
    const expertFactory = async (expertId: string) => {
      // This is a placeholder - actual Expert Agent execution happens here
      // In real implementation, this would:
      // 1. Create Expert Agent instance
      // 2. Execute AIM phase (analyze topic)
      // 3. Execute SHOOT phase (gather sources)
      // 4. Execute SKIN phase (synthesize and integrate)
      // 5. Return results
      
      this.logger.info(
        `Expert ${expertId} starting research on "${topic.name}"`,
        LearningModeService.name,
      );

      // Simulate expert work
      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        success: true,
        nodesAdded: 0,
        edgesAdded: 0,
      };
    };

    // Spawn expert through pool
    const report = await this.expertPool.spawnExpert(topic.name, topic.id, expertFactory);

    // Update topic status based on result
    if (report.status === 'completed') {
      await this.topicCatalog.updateStatus(topic.id, TopicStatus.COMPLETED);
      await this.topicCatalog.recordResearch(topic.id);
    } else if (report.status === 'escalated') {
      await this.topicCatalog.updateStatus(topic.id, TopicStatus.USER_ESCALATED);
    } else if (report.status === 'timeout' || report.status === 'failed') {
      await this.topicCatalog.updateStatus(topic.id, TopicStatus.BLOCKED);
    }

    return report;
  }

  // ========================================
  // Session Management
  // ========================================

  /**
   * Build session result from expert reports
   */
  private async buildSessionResult(
    sessionId: string,
    mode: LearningMode,
    geniusAgentId: GeniusAgentIdType,
    startTime: Date,
    endTime: Date,
    expertReports: ExpertReport[],
    errors?: string[],
  ): Promise<LearningSessionResult> {
    const durationMs = endTime.getTime() - startTime.getTime();

    // Count statuses
    const completed = expertReports.filter(r => r.status === 'completed').length;
    const failed = expertReports.filter(r => r.status === 'failed').length;
    const timedOut = expertReports.filter(r => r.status === 'timeout').length;
    const escalated = expertReports.filter(r => r.status === 'escalated').length;

    // Count KG modifications
    const nodesAdded = expertReports.reduce(
      (sum, r) => sum + r.modifications.filter(m => m.operationType === 'create-node').length,
      0,
    );
    const edgesAdded = expertReports.reduce(
      (sum, r) => sum + r.modifications.filter(m => m.operationType === 'create-edge').length,
      0,
    );

    // TODO: Track component merges (requires GraphComponentService integration)
    const componentsMerged = 0;

    return {
      sessionId,
      mode,
      geniusAgentId,
      startTime,
      endTime,
      durationMs,
      topicsAttempted: expertReports.length,
      topicsCompleted: completed,
      topicsFailed: failed,
      topicsTimedOut: timedOut,
      topicsEscalated: escalated,
      expertReports,
      nodesAdded,
      edgesAdded,
      componentsMerged,
      errors,
    };
  }

  /**
   * Add session to history
   */
  private addToHistory(result: LearningSessionResult): void {
    this.sessionHistory.push(result);
    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory.shift();
    }
  }

  /**
   * Get session history
   */
  getSessionHistory(limit?: number): LearningSessionResult[] {
    if (limit) {
      return this.sessionHistory.slice(-limit);
    }
    return [...this.sessionHistory];
  }

  /**
   * Get learning statistics
   */
  async getStatistics(): Promise<LearningStatistics> {
    const sessions = this.sessionHistory;

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        sessionsByMode: {
          [LearningMode.USER_DIRECTED]: 0,
          [LearningMode.AUTONOMOUS]: 0,
          [LearningMode.SCHEDULED]: 0,
        },
        totalTopicsResearched: 0,
        successRate: 0,
        avgSessionDurationMs: 0,
        avgTopicsPerSession: 0,
        totalNodesAdded: 0,
        totalEdgesAdded: 0,
        categoryDistribution: {},
      };
    }

    const totalSessions = sessions.length;
    const sessionsByMode = {
      [LearningMode.USER_DIRECTED]: sessions.filter(s => s.mode === LearningMode.USER_DIRECTED).length,
      [LearningMode.AUTONOMOUS]: sessions.filter(s => s.mode === LearningMode.AUTONOMOUS).length,
      [LearningMode.SCHEDULED]: sessions.filter(s => s.mode === LearningMode.SCHEDULED).length,
    };

    const totalTopicsResearched = sessions.reduce((sum, s) => sum + s.topicsAttempted, 0);
    const totalCompleted = sessions.reduce((sum, s) => sum + s.topicsCompleted, 0);
    const successRate = totalTopicsResearched > 0 ? totalCompleted / totalTopicsResearched : 0;

    const avgSessionDurationMs = Math.round(
      sessions.reduce((sum, s) => sum + s.durationMs, 0) / totalSessions,
    );
    const avgTopicsPerSession = totalTopicsResearched / totalSessions;

    const totalNodesAdded = sessions.reduce((sum, s) => sum + s.nodesAdded, 0);
    const totalEdgesAdded = sessions.reduce((sum, s) => sum + s.edgesAdded, 0);

    // Get category distribution from graph
    const graphStats = await this.knowledgeGraph.getGraphStatistics();

    return {
      totalSessions,
      sessionsByMode,
      totalTopicsResearched,
      successRate,
      avgSessionDurationMs,
      avgTopicsPerSession,
      totalNodesAdded,
      totalEdgesAdded,
      categoryDistribution: graphStats.nodesByCategory,
    };
  }

  /**
   * Clear session history
   */
  clearHistory(): void {
    this.sessionHistory = [];
    this.logger.info('Cleared session history', LearningModeService.name);
  }

  // ========================================
  // Helpers
  // ========================================

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    return `ls_${timestamp}_${counter}`;
  }
}
