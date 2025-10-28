/**
 * Genius Service
 * 
 * Service facade for the Genius Agent API.
 * Wraps core infrastructure services for use in the features layer.
 */

import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { GeniusAgent } from '@core/infrastructure/agents/core/agents/structures/genius';
import { ExpertPoolManager } from '@core/infrastructure/agents/components/knowledge/services/expert-pool.service';
import { LearningModeService } from '@core/infrastructure/agents/components/knowledge/services/learning-mode.service';
import { ScheduledLearningManager } from '@core/infrastructure/agents/components/knowledge/services/scheduled-learning.service';
import { ValidationService } from '@core/infrastructure/agents/components/knowledge/services/validation.service';
import { TopicCatalogService } from '@core/infrastructure/agents/components/knowledge/services/topic-catalog.service';
import { KnowledgeGraphService } from '@core/infrastructure/agents/components/knowledge/services/knowledge-graph.service';
import { NewsIntegrationService } from '@core/infrastructure/agents/components/knowledge/services/news-integration.service';
import {
  StartUserDirectedLearningDto,
  StartAutonomousLearningDto,
  CreateScheduleDto,
  UpdateScheduleDto,
  LearningStatusResponse,
  StatisticsResponse,
  JobStatusResponse,
} from './dto/genius.dto';

@Injectable()
export class GeniusService {
  private geniusAgent: GeniusAgent;

  constructor(
    private expertPool: ExpertPoolManager,
    private learningMode: LearningModeService,
    private scheduledLearning: ScheduledLearningManager,
    private validation: ValidationService,
    private topicCatalog: TopicCatalogService,
    private knowledgeGraph: KnowledgeGraphService,
    private newsIntegration: NewsIntegrationService,
    private logger: MyLogger,
  ) {
    // Initialize Genius Agent
    this.geniusAgent = new GeniusAgent(
      {
        autoValidate: true,
        autoStartLearning: false,
      },
      logger,
    );

    // Inject services
    this.geniusAgent.injectServices({
      expertPool: this.expertPool,
      learningMode: this.learningMode,
      scheduledLearning: this.scheduledLearning,
      validation: this.validation,
      topicCatalog: this.topicCatalog,
      knowledgeGraph: this.knowledgeGraph,
      newsIntegration: this.newsIntegration,
    });

    this.logger.info('GeniusService initialized', GeniusService.name);
  }

  // ========================================
  // Learning Control
  // ========================================

  async startUserDirectedLearning(dto: StartUserDirectedLearningDto): Promise<any> {
    this.logger.info(
      `Starting user-directed learning for ${dto.topicIds.length} topics`,
      GeniusService.name,
    );

    // TODO: Get userId from auth context
    const userId = 'u_default_user' as any;

    return this.geniusAgent.startUserDirectedLearning({
      userId,
      topicIds: dto.topicIds as any,
      maxConcurrentExperts: dto.maxConcurrentExperts || 1,
      waitForCompletion: dto.waitForCompletion ?? true,
    });
  }

  async startAutonomousLearning(dto: StartAutonomousLearningDto): Promise<any> {
    this.logger.info('Starting autonomous learning', GeniusService.name);

    return this.geniusAgent.startAutonomousLearning({
      batchSize: dto.batchSize || 5,
      minPriority: dto.minPriority || 50,
      maxConcurrentExperts: dto.maxConcurrentExperts || 1,
      preferOrganic: dto.preferOrganic ?? true,
      categoryWeights: dto.categoryWeights,
      maxCategoryDistance: dto.maxCategoryDistance,
    });
  }

  async stopLearning(): Promise<void> {
    this.logger.info('Stopping learning', GeniusService.name);
    await this.geniusAgent.stopLearning();
  }

  async getStatus(): Promise<LearningStatusResponse> {
    const status = this.geniusAgent.getLearningStatus();

    return {
      isLearning: status.isLearning,
      currentSession: status.currentSession
        ? {
            startTime: status.currentSession.startTime,
            topicsAttempted: status.currentSession.topicsAttempted,
            topicsCompleted: status.currentSession.topicsCompleted,
            expertReports: status.currentSession.expertReports,
          }
        : undefined,
      expertPoolStats: status.expertPoolStats,
    };
  }

  async getStatistics(): Promise<StatisticsResponse> {
    const stats = await this.geniusAgent.getStatistics();

    return {
      geniusAgentId: stats.geniusAgentId,
      expertPoolStats: stats.expertPoolStats,
      validationStats: stats.validationStats,
      topicCatalogStats: stats.topicCatalogStats,
      knowledgeGraphStats: stats.knowledgeGraphStats,
      newsIntegrationStats: stats.newsIntegrationStats,
    };
  }

  // ========================================
  // Scheduled Learning
  // ========================================

  async createSchedule(dto: CreateScheduleDto): Promise<JobStatusResponse> {
    this.logger.info(`Creating schedule: ${dto.name}`, GeniusService.name);

    const jobId = this.geniusAgent.createSchedule(dto as any);
    const status = await this.scheduledLearning.getJobStatus(jobId);

    return this.mapJobStatus(status);
  }

  async listSchedules(): Promise<JobStatusResponse[]> {
    const statuses = await this.scheduledLearning.getAllJobStatuses();
    return statuses.map((s) => this.mapJobStatus(s));
  }

  async getSchedule(jobId: string): Promise<JobStatusResponse> {
    const status = await this.scheduledLearning.getJobStatus(jobId);
    return this.mapJobStatus(status);
  }

  async updateSchedule(jobId: string, dto: UpdateScheduleDto): Promise<JobStatusResponse> {
    this.logger.info(`Updating schedule: ${jobId}`, GeniusService.name);

    await this.scheduledLearning.updateScheduledJob(jobId, dto as any);
    const status = await this.scheduledLearning.getJobStatus(jobId);

    return this.mapJobStatus(status);
  }

  async deleteSchedule(jobId: string): Promise<void> {
    this.logger.info(`Deleting schedule: ${jobId}`, GeniusService.name);
    await this.scheduledLearning.deleteScheduledJob(jobId);
  }

  async executeSchedule(jobId: string): Promise<void> {
    this.logger.info(`Executing schedule immediately: ${jobId}`, GeniusService.name);
    await this.scheduledLearning.executeJobNow(jobId);
  }

  // ========================================
  // Helper Methods
  // ========================================

  private mapJobStatus(status: any): JobStatusResponse {
    return {
      jobId: status.jobId,
      name: status.config.name,
      cronExpression: status.config.cronExpression,
      enabled: status.config.enabled,
      isRunning: status.isRunning,
      lastRun: status.lastRun,
      nextRun: status.nextRun,
      totalRuns: status.totalRuns,
      totalTopicsResearched: status.totalTopicsResearched,
    };
  }
}
