import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { LearningModeService } from './learning-mode.service';
import {
  ScheduledConfig,
  ScheduledJobStatus,
  LearningSessionResult,
} from '../types/learning-mode.types';
import { GeniusAgentIdType } from '@core/infrastructure/database/utils/custom_types';
import * as cron from 'node-cron';

/**
 * Job definition stored in memory
 */
interface ScheduledJob {
  jobId: string;
  geniusAgentId: GeniusAgentIdType;
  config: ScheduledConfig;
  task: cron.ScheduledTask;
  lastRun?: Date;
  lastResult?: LearningSessionResult;
  totalRuns: number;
  totalTopicsResearched: number;
  isRunning: boolean;
}

/**
 * Scheduled Learning Manager
 * 
 * Manages cron-based scheduled learning cycles for Genius Agent.
 * Handles:
 * - Creating and managing scheduled jobs
 * - Executing jobs on cron schedule
 * - Tracking job status and history
 * - Graceful shutdown
 */
@Injectable()
export class ScheduledLearningManager implements OnModuleInit, OnModuleDestroy {
  private jobs: Map<string, ScheduledJob> = new Map();
  private jobCounter = 0;

  constructor(
    @Inject(LearningModeService)
    private readonly learningMode: LearningModeService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {}

  async onModuleInit() {
    this.logger.info('ScheduledLearningManager initialized', ScheduledLearningManager.name);
  }

  async onModuleDestroy() {
    this.logger.info('Shutting down scheduled jobs', ScheduledLearningManager.name);
    await this.stopAll();
  }

  /**
   * Create a new scheduled learning job
   */
  createScheduledJob(
    geniusAgentId: GeniusAgentIdType,
    config: ScheduledConfig,
  ): ScheduledJobStatus {
    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`);
    }

    const jobId = this.generateJobId();

    this.logger.info(
      `Creating scheduled job ${jobId} with expression: ${config.cronExpression}`,
      ScheduledLearningManager.name,
    );

    // Create cron task
    const task = cron.schedule(
      config.cronExpression,
      async () => {
        if (!config.enabled) {
          this.logger.debug(`Job ${jobId} is disabled, skipping`, ScheduledLearningManager.name);
          return;
        }

        const job = this.jobs.get(jobId);
        if (!job) {
          this.logger.warn(`Job ${jobId} not found`, ScheduledLearningManager.name);
          return;
        }

        if (job.isRunning) {
          this.logger.warn(
            `Job ${jobId} is already running, skipping this cycle`,
            ScheduledLearningManager.name,
          );
          return;
        }

        await this.executeJob(jobId);
      },
      {
        timezone: 'America/New_York', // TODO: Make configurable
      },
    );

    // Start task if enabled
    if (config.enabled) {
      task.start();
    }

    // Store job
    const job: ScheduledJob = {
      jobId,
      geniusAgentId,
      config,
      task,
      totalRuns: 0,
      totalTopicsResearched: 0,
      isRunning: false,
    };

    this.jobs.set(jobId, job);

    this.logger.info(`Scheduled job ${jobId} created`, ScheduledLearningManager.name);

    return this.getJobStatus(jobId)!;
  }

  /**
   * Update scheduled job configuration
   */
  updateScheduledJob(jobId: string, config: Partial<ScheduledConfig>): ScheduledJobStatus {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const oldConfig = job.config;
    job.config = { ...oldConfig, ...config };

    // If cron expression changed, recreate task
    if (config.cronExpression && config.cronExpression !== oldConfig.cronExpression) {
      if (!cron.validate(config.cronExpression)) {
        throw new Error(`Invalid cron expression: ${config.cronExpression}`);
      }

      this.logger.info(
        `Updating job ${jobId} cron: ${oldConfig.cronExpression} → ${config.cronExpression}`,
        ScheduledLearningManager.name,
      );

      // Stop old task
      job.task.stop();

      // Create new task
      job.task = cron.schedule(
        config.cronExpression,
        async () => {
          if (!job.config.enabled) return;
          if (job.isRunning) {
            this.logger.warn(`Job ${jobId} already running`, ScheduledLearningManager.name);
            return;
          }
          await this.executeJob(jobId);
        },
        {
          timezone: 'America/New_York',
        },
      );

      // Start task if enabled
      if (job.config.enabled) {
        job.task.start();
      }
    }

    // Handle enabled/disabled
    if (config.enabled !== undefined) {
      if (config.enabled) {
        job.task.start();
        this.logger.info(`Job ${jobId} enabled`, ScheduledLearningManager.name);
      } else {
        job.task.stop();
        this.logger.info(`Job ${jobId} disabled`, ScheduledLearningManager.name);
      }
    }

    return this.getJobStatus(jobId)!;
  }

  /**
   * Delete a scheduled job
   */
  deleteScheduledJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    this.logger.info(`Deleting job ${jobId}`, ScheduledLearningManager.name);

    job.task.stop();
    this.jobs.delete(jobId);
  }

  /**
   * Execute a job immediately (outside of schedule)
   */
  async executeJobNow(jobId: string): Promise<LearningSessionResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    this.logger.info(`Manually executing job ${jobId}`, ScheduledLearningManager.name);

    return this.executeJob(jobId);
  }

  /**
   * Get status of a job
   */
  getJobStatus(jobId: string): ScheduledJobStatus | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    // Calculate next run (approximate - cron library doesn't expose this directly)
    // For simplicity, we'll just say "next run unknown"
    const nextRun = new Date(Date.now() + 60000); // Placeholder: 1 minute from now

    return {
      jobId: job.jobId,
      config: job.config,
      lastRun: job.lastRun,
      nextRun,
      isRunning: job.isRunning,
      lastResult: job.lastResult,
      totalRuns: job.totalRuns,
      totalTopicsResearched: job.totalTopicsResearched,
    };
  }

  /**
   * Get all job statuses
   */
  getAllJobStatuses(): ScheduledJobStatus[] {
    return Array.from(this.jobs.keys())
      .map(jobId => this.getJobStatus(jobId))
      .filter((status): status is ScheduledJobStatus => status !== null);
  }

  /**
   * Stop all jobs
   */
  async stopAll(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.logger.info('All scheduled jobs stopped', ScheduledLearningManager.name);
  }

  /**
   * Start all jobs
   */
  startAll(): void {
    for (const job of this.jobs.values()) {
      if (job.config.enabled) {
        job.task.start();
      }
    }
    this.logger.info('All enabled scheduled jobs started', ScheduledLearningManager.name);
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Execute a scheduled job
   */
  private async executeJob(jobId: string): Promise<LearningSessionResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.isRunning = true;
    job.lastRun = new Date();

    this.logger.info(`Executing scheduled job ${jobId}`, ScheduledLearningManager.name);

    try {
      const result = await this.learningMode.executeScheduledCycle(
        job.geniusAgentId,
        job.config,
      );

      job.lastResult = result;
      job.totalRuns++;
      job.totalTopicsResearched += result.topicsCompleted;

      this.logger.info(
        `Job ${jobId} completed: ${result.topicsCompleted}/${result.topicsAttempted} topics successful`,
        ScheduledLearningManager.name,
      );

      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Job ${jobId} failed: ${info.message}`,
        ScheduledLearningManager.name,
        info.stack,
      );
      throw error;
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    this.jobCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.jobCounter.toString(36).padStart(4, '0');
    return `sj_${timestamp}_${counter}`;
  }
}
