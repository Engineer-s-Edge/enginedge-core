import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { GeniusAgentIdType } from '@core/infrastructure/database/utils/custom_types';
import { ExpertPoolManager } from '../../../components/knowledge/services/expert-pool.service';
import { LearningModeService } from '../../../components/knowledge/services/learning-mode.service';
import { ScheduledLearningManager } from '../../../components/knowledge/services/scheduled-learning.service';
import { ValidationService } from '../../../components/knowledge/services/validation.service';
import { TopicCatalogService } from '../../../components/knowledge/services/topic-catalog.service';
import { KnowledgeGraphService } from '../../../components/knowledge/services/knowledge-graph.service';
import { NewsIntegrationService } from '../../../components/knowledge/services/news-integration.service';
import {
  LearningMode,
  UserDirectedConfig,
  AutonomousConfig,
  ScheduledConfig,
  LearningSessionResult,
} from '../../../components/knowledge/types/learning-mode.types';
import { ValidationResult } from '../../../components/knowledge/types/validation.types';

/**
 * Genius Agent Options
 */
export interface GeniusAgentOptions {
  /** Genius Agent ID */
  geniusAgentId?: GeniusAgentIdType;
  
  /** Enable automatic validation of expert work */
  autoValidate?: boolean;
  
  /** Default learning mode */
  defaultLearningMode?: LearningMode;
  
  /** Auto-start autonomous learning on initialization */
  autoStartLearning?: boolean;
}

/**
 * Genius Agent
 * 
 * Meta-learning orchestrator that continuously expands the knowledge graph.
 * 
 * Key Capabilities:
 * - Commands multiple Expert Agents for parallel research
 * - 3 Learning Modes: User-Directed, Autonomous, Scheduled
 * - Topic discovery via Wikipedia + organic growth
 * - Automatic validation of expert work
 * - News integration for current events
 * - Escalation system for user involvement
 * - ICS-based knowledge organization (L1-L6)
 * 
 * Architecture:
 * - Standalone orchestrator (doesn't inherit from BaseAgent)
 * - Uses ExpertPoolManager for concurrent expert orchestration
 * - Integrates LearningModeService for flexible research modes
 * - Employs ValidationService for quality control
 * - Connects to TopicCatalogService for research planning
 * 
 * Workflow:
 * 1. Select topics (user-directed, autonomous, or scheduled)
 * 2. Spawn Expert Agents via ExpertPoolManager
 * 3. Experts execute AIM-SHOOT-SKIN research cycle
 * 4. Validate expert work via ValidationService
 * 5. Integrate results into knowledge graph
 * 6. Update topic catalog and statistics
 * 7. Escalate issues if needed
 * 8. Repeat continuously
 */
export class GeniusAgent {
  private geniusAgentId: GeniusAgentIdType;
  private autoValidate: boolean;
  private defaultLearningMode: LearningMode;
  private isLearning = false;
  private currentSession?: LearningSessionResult;
  private logger: MyLogger;

  // Injected services (would be provided via DI in production)
  private expertPool?: ExpertPoolManager;
  private learningMode?: LearningModeService;
  private scheduledLearning?: ScheduledLearningManager;
  private validation?: ValidationService;
  private topicCatalog?: TopicCatalogService;
  private knowledgeGraph?: KnowledgeGraphService;
  private newsIntegration?: NewsIntegrationService;

  constructor(options: GeniusAgentOptions, logger: MyLogger) {
    this.logger = logger;
    this.geniusAgentId = options.geniusAgentId || this.generateGeniusId();
    this.autoValidate = options.autoValidate ?? true;
    this.defaultLearningMode = options.defaultLearningMode || LearningMode.AUTONOMOUS;

    this.logger.info(
      `GeniusAgent ${this.geniusAgentId} initialized (mode: ${this.defaultLearningMode})`,
      GeniusAgent.name,
    );

    // Auto-start learning if requested
    if (options.autoStartLearning) {
      this.startAutonomousLearning().catch((error) => {
        const info = getErrorInfo(error);
        this.logger.error(
          `Failed to auto-start learning: ${info.message}`,
          GeniusAgent.name,
          info.stack,
        );
      });
    }
  }

  /**
   * Inject services (dependency injection)
   * In production, these would be injected via NestJS DI
   */
  injectServices(services: {
    expertPool: ExpertPoolManager;
    learningMode: LearningModeService;
    scheduledLearning: ScheduledLearningManager;
    validation: ValidationService;
    topicCatalog: TopicCatalogService;
    knowledgeGraph: KnowledgeGraphService;
    newsIntegration: NewsIntegrationService;
  }): void {
    this.expertPool = services.expertPool;
    this.learningMode = services.learningMode;
    this.scheduledLearning = services.scheduledLearning;
    this.validation = services.validation;
    this.topicCatalog = services.topicCatalog;
    this.knowledgeGraph = services.knowledgeGraph;
    this.newsIntegration = services.newsIntegration;

    this.logger.info('Services injected into GeniusAgent', GeniusAgent.name);
  }

  // ========================================
  // Learning Mode Control
  // ========================================

  /**
   * Start user-directed learning session
   * User explicitly selects topics to research
   */
  async startUserDirectedLearning(config: UserDirectedConfig): Promise<LearningSessionResult> {
    this.assertServicesInjected();

    this.logger.info(
      `Starting user-directed learning for ${config.topicIds.length} topics`,
      GeniusAgent.name,
    );

    this.isLearning = true;

    try {
      const result = await this.learningMode!.startUserDirectedSession(this.geniusAgentId, config);
      
      this.currentSession = result;

      // Validate if enabled
      if (this.autoValidate) {
        await this.validateSession(result);
      }

      this.logger.info(
        `User-directed session complete: ${result.topicsCompleted}/${result.topicsAttempted} topics`,
        GeniusAgent.name,
      );

      return result;
    } finally {
      this.isLearning = false;
    }
  }

  /**
   * Start autonomous learning session
   * Agent auto-selects high-priority topics
   */
  async startAutonomousLearning(config?: Partial<AutonomousConfig>): Promise<LearningSessionResult> {
    this.assertServicesInjected();

    const defaultConfig: AutonomousConfig = {
      batchSize: 5,
      minPriority: 50,
      maxConcurrentExperts: 1,
      preferOrganic: true,
      ...config,
    };

    this.logger.info(
      `Starting autonomous learning (batch size: ${defaultConfig.batchSize})`,
      GeniusAgent.name,
    );

    this.isLearning = true;

    try {
      const result = await this.learningMode!.startAutonomousSession(
        this.geniusAgentId,
        defaultConfig,
      );
      
      this.currentSession = result;

      // Validate if enabled
      if (this.autoValidate) {
        await this.validateSession(result);
      }

      this.logger.info(
        `Autonomous session complete: ${result.topicsCompleted}/${result.topicsAttempted} topics`,
        GeniusAgent.name,
      );

      return result;
    } finally {
      this.isLearning = false;
    }
  }

  /**
   * Schedule recurring learning cycles
   */
  createSchedule(config: ScheduledConfig): string {
    this.assertServicesInjected();

    this.logger.info(
      `Creating scheduled learning: ${config.cronExpression}`,
      GeniusAgent.name,
    );

    const jobStatus = this.scheduledLearning!.createScheduledJob(this.geniusAgentId, config);
    
    return jobStatus.jobId;
  }

  /**
   * Stop learning
   */
  async stopLearning(): Promise<void> {
    this.logger.info('Stopping learning', GeniusAgent.name);
    
    if (this.expertPool) {
      await this.expertPool.abortAll();
    }
    
    this.isLearning = false;
  }

  /**
   * Get learning status
   */
  getLearningStatus(): {
    isLearning: boolean;
    currentSession?: LearningSessionResult;
    expertPoolStats?: ReturnType<ExpertPoolManager['getStatistics']>;
    learningStats?: ReturnType<LearningModeService['getStatistics']>;
  } {
    return {
      isLearning: this.isLearning,
      currentSession: this.currentSession,
      expertPoolStats: this.expertPool?.getStatistics(),
      learningStats: undefined, // Would need async call
    };
  }

  // ========================================
  // Topic Management
  // ========================================

  /**
   * Add topic to catalog manually
   */
  async addTopic(
    name: string,
    category: string,
    options?: {
      priority?: number;
      complexity?: number;
      description?: string;
    },
  ): Promise<number> {
    this.assertServicesInjected();

    this.logger.info(`Adding topic: "${name}" (${category})`, GeniusAgent.name);

    const count = await this.topicCatalog!.seedManual([
      {
        name,
        category,
        description: options?.description,
      },
    ]);

    return count;
  }

  /**
   * Seed topics from Wikipedia
   */
  async seedTopicsFromWikipedia(categories: string[], limit = 100): Promise<number> {
    this.assertServicesInjected();

    this.logger.info(
      `Seeding topics from Wikipedia: ${categories.join(', ')}`,
      GeniusAgent.name,
    );

    const count = await this.topicCatalog!.seedFromWikipedia(categories, limit);

    this.logger.info(`Seeded ${count} topics from Wikipedia`, GeniusAgent.name);

    return count;
  }

  // ========================================
  // Validation
  // ========================================

  /**
   * Validate a learning session
   */
  private async validateSession(session: LearningSessionResult): Promise<ValidationResult[]> {
    this.assertServicesInjected();

    this.logger.info(
      `Validating session with ${session.expertReports.length} expert reports`,
      GeniusAgent.name,
    );

    const validationResults: ValidationResult[] = [];

    for (const report of session.expertReports) {
      try {
        const result = await this.validation!.validateExpertWork({
          expertReport: report,
          applyFixes: false,
        });

        validationResults.push(result);

        if (result.status === 'failed') {
          this.logger.warn(
            `Expert ${report.expertId} validation failed: ${result.issues.length} issues`,
            GeniusAgent.name,
          );
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Validation failed for ${report.expertId}: ${info.message}`,
          GeniusAgent.name,
        );
      }
    }

    const failedCount = validationResults.filter((r) => r.status === 'failed').length;
    const needsReviewCount = validationResults.filter((r) => r.requiresManualReview).length;

    this.logger.info(
      `Validation complete: ${failedCount} failed, ${needsReviewCount} need review`,
      GeniusAgent.name,
    );

    return validationResults;
  }

  // ========================================
  // News Integration
  // ========================================

  /**
   * Query news articles for a topic
   */
  async queryNews(topic: string, limit = 10): Promise<any> {
    this.assertServicesInjected();

    this.logger.info(`Querying news for topic: "${topic}"`, GeniusAgent.name);

    const result = await this.newsIntegration!.queryNewsArticles({
      topic,
      limit,
      sortBy: 'relevance',
    });

    return result;
  }

  // ========================================
  // Statistics & Monitoring
  // ========================================

  /**
   * Get comprehensive statistics
   */
  async getStatistics(): Promise<{
    geniusAgentId: GeniusAgentIdType;
    expertPoolStats?: ReturnType<ExpertPoolManager['getStatistics']>;
    validationStats?: ReturnType<ValidationService['getStatistics']>;
    topicCatalogStats?: any;
    knowledgeGraphStats?: any;
    newsIntegrationStats?: ReturnType<NewsIntegrationService['getStatistics']>;
  }> {
    return {
      geniusAgentId: this.geniusAgentId,
      expertPoolStats: this.expertPool?.getStatistics(),
      validationStats: this.validation?.getStatistics(),
      topicCatalogStats: this.topicCatalog ? await this.topicCatalog.getStatistics() : undefined,
      knowledgeGraphStats: this.knowledgeGraph ? await this.knowledgeGraph.getGraphStatistics() : undefined,
      newsIntegrationStats: this.newsIntegration?.getStatistics(),
    };
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Generate genius agent ID
   */
  private generateGeniusId(): GeniusAgentIdType {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `gn_${timestamp}${random}` as GeniusAgentIdType;
  }

  /**
   * Assert that services are injected
   */
  private assertServicesInjected(): void {
    if (
      !this.expertPool ||
      !this.learningMode ||
      !this.validation ||
      !this.topicCatalog ||
      !this.knowledgeGraph
    ) {
      throw new Error('Services not injected. Call injectServices() first.');
    }
  }

  /**
   * Override execute method from BaseAgent
   * GeniusAgent doesn't execute like a normal agent - it orchestrates
   */
  async execute(prompt: string): Promise<string> {
    this.logger.info('GeniusAgent execute() called - starting autonomous learning', GeniusAgent.name);
    
    // Interpret prompt as a command
    if (prompt.toLowerCase().includes('stop')) {
      await this.stopLearning();
      return 'Learning stopped';
    }
    
    if (prompt.toLowerCase().includes('status')) {
      const stats = await this.getStatistics();
      return JSON.stringify(stats, null, 2);
    }
    
    // Default: start autonomous learning
    const result = await this.startAutonomousLearning();
    return `Learning session complete: ${result.topicsCompleted}/${result.topicsAttempted} topics researched`;
  }
}

