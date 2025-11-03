import { Injectable, Inject } from '@nestjs/common';
import { Semaphore } from '@common/utils/semaphore';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import {
  ExpertPoolConfig,
  KGModification,
  ExpertReport,
  ActiveExpert,
  ExpertPoolStats,
  CollisionResult,
} from '../types/expert-pool.types';
import {
  ExpertAgentIdType,
  KnowledgeNodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { KnowledgeGraphService } from './knowledge-graph.service';

/**
 * Expert Pool Manager
 * 
 * Manages a pool of Expert Agents for the Genius Agent.
 * Handles:
 * - Concurrent expert spawning with semaphore limits
 * - Collision detection and resolution
 * - Expert work logging and audit trails
 * - Lifecycle management (spawn, monitor, cleanup)
 * - Resource control and timeouts
 */
@Injectable()
export class ExpertPoolManager {
  private config: ExpertPoolConfig;
  
  // Semaphores for resource control
  private expertSemaphore: Semaphore;
  private kgWriteSemaphore: Semaphore;
  
  // Active expert tracking
  private activeExperts: Map<ExpertAgentIdType, ActiveExpert> = new Map();
  private expertWorkLogs: Map<ExpertAgentIdType, KGModification[]> = new Map();
  
  // Statistics
  private stats: ExpertPoolStats = {
    activeExperts: 0,
    totalExpertsSpawned: 0,
    totalTopicsCompleted: 0,
    totalTopicsFailed: 0,
    totalTimeout: 0,
    totalEscalations: 0,
    averageCompletionTimeMs: 0,
    collisionCount: 0,
    queuedRequests: 0,
  };
  
  private completionTimes: number[] = [];

  constructor(
    @Inject(KnowledgeGraphService)
    private readonly knowledgeGraph: KnowledgeGraphService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    // Default configuration
    this.config = {
      maxConcurrentExperts: 1, // Start conservative
      expertTimeout: 10 * 60 * 1000, // 10 minutes
      maxRetriesPerTopic: 3,
      knowledgeGraphWriteSemaphore: 5,
      verbose: false,
    };
    
    this.expertSemaphore = new Semaphore(this.config.maxConcurrentExperts);
    this.kgWriteSemaphore = new Semaphore(this.config.knowledgeGraphWriteSemaphore);
    
    this.logger.info('ExpertPoolManager initialized', ExpertPoolManager.name);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExpertPoolConfig>): void {
    const oldMax = this.config.maxConcurrentExperts;
    this.config = { ...this.config, ...config };
    
    // Recreate semaphore if max changed
    if (config.maxConcurrentExperts && config.maxConcurrentExperts !== oldMax) {
      this.expertSemaphore = new Semaphore(config.maxConcurrentExperts);
      this.logger.info(
        `Updated max concurrent experts: ${oldMax} → ${config.maxConcurrentExperts}`,
        ExpertPoolManager.name,
      );
    }
    
    if (config.knowledgeGraphWriteSemaphore) {
      this.kgWriteSemaphore = new Semaphore(config.knowledgeGraphWriteSemaphore);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ExpertPoolConfig {
    return { ...this.config };
  }

  /**
   * Spawn an expert to research a topic
   * 
   * This is the main entry point for the Genius Agent to delegate research
   * 
   * @param topic - The topic to research
   * @param topicId - Optional topic catalog ID
   * @param expertFactory - Function that creates and executes the expert
   * @returns Expert report with results
   */
  async spawnExpert<T>(
    topic: string,
    topicId: string | undefined,
    expertFactory: (expertId: ExpertAgentIdType) => Promise<T>,
  ): Promise<ExpertReport> {
    // Generate expert ID
    const expertId = this.generateExpertId();
    
    this.logger.info(
      `Spawning expert ${expertId} for topic: "${topic}"`,
      ExpertPoolManager.name,
    );
    
    // Wait for available slot
    await this.expertSemaphore.acquire();
    this.stats.totalExpertsSpawned++;
    this.stats.queuedRequests = this.expertSemaphore.queueLength();
    
    const startTime = new Date();
    let status: 'completed' | 'failed' | 'timeout' | 'escalated' = 'completed';
    let result: T | undefined;
    let error: string | undefined;
    
    // Initialize work log for this expert
    this.expertWorkLogs.set(expertId, []);
    
    try {
      // Create timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Expert ${expertId} timed out after ${this.config.expertTimeout}ms`));
        }, this.config.expertTimeout);
        
        // Store for cleanup
        this.activeExperts.set(expertId, {
          expertId,
          topic,
          topicId,
          startTime,
          timeout,
          promise: expertFactory(expertId) as unknown as Promise<ExpertReport>,
        });
      });
      
      // Race between expert execution and timeout
      result = await Promise.race([
        expertFactory(expertId),
        timeoutPromise,
      ]);
      
      this.stats.totalTopicsCompleted++;
      
    } catch (err) {
      const info = getErrorInfo(err);
      error = info.message;
      
      if (info.message.includes('timed out')) {
        status = 'timeout';
        this.stats.totalTimeout++;
        this.logger.warn(
          `Expert ${expertId} timed out researching "${topic}"`,
          ExpertPoolManager.name,
        );
      } else if (info.message.includes('escalat')) {
        status = 'escalated';
        this.stats.totalEscalations++;
        this.logger.info(
          `Expert ${expertId} escalated topic "${topic}": ${info.message}`,
          ExpertPoolManager.name,
        );
      } else {
        status = 'failed';
        this.stats.totalTopicsFailed++;
        this.logger.error(
          `Expert ${expertId} failed: ${info.message}`,
          ExpertPoolManager.name,
          info.stack,
        );
      }
    } finally {
      // Cleanup
      const activeExpert = this.activeExperts.get(expertId);
      if (activeExpert?.timeout) {
        clearTimeout(activeExpert.timeout);
      }
      this.activeExperts.delete(expertId);
      
      // Release semaphore
      this.expertSemaphore.release();
      this.stats.queuedRequests = this.expertSemaphore.queueLength();
    }
    
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    
    // Update average completion time
    if (status === 'completed') {
      this.completionTimes.push(durationMs);
      if (this.completionTimes.length > 100) {
        this.completionTimes.shift(); // Keep last 100
      }
      this.stats.averageCompletionTimeMs = Math.round(
        this.completionTimes.reduce((a, b) => a + b, 0) / this.completionTimes.length
      );
    }
    
    // Get work log
    const modifications = this.expertWorkLogs.get(expertId) || [];
    const sourcesUsed = modifications.filter(m => m.operationType === 'add-research').length;
    const avgConfidence = this.calculateAvgConfidence(modifications);
    
    // Build report
    const report: ExpertReport = {
      expertId,
      topicResearched: topic,
      topicId,
      startTime,
      endTime,
      durationMs,
      modifications,
      sourcesUsed,
      avgConfidence,
      issuesEncountered: error ? [error] : [],
      escalationRequired: status === 'escalated',
      escalationReason: status === 'escalated' ? error : undefined,
      status,
      result,
    };
    
    // Cleanup work log
    this.expertWorkLogs.delete(expertId);
    
    this.logger.info(
      `Expert ${expertId} finished (${status}) in ${durationMs}ms`,
      ExpertPoolManager.name,
    );
    
    return report;
  }

  /**
   * Log a knowledge graph modification by an expert
   * Expert Agents should call this for every KG operation
   */
  logModification(modification: KGModification): void {
    const log = this.expertWorkLogs.get(modification.expertId);
    if (log) {
      log.push(modification);
      
      if (this.config.verbose) {
        this.logger.debug(
          `Expert ${modification.expertId} ${modification.operationType} ${modification.success ? 'success' : 'failed'}`,
          ExpertPoolManager.name,
        );
      }
    }
  }

  /**
   * Handle node collision
   * Called when an expert tries to create/modify a node that's locked or exists
   */
  async handleNodeCollision(
    expertId: ExpertAgentIdType,
    nodeId: KnowledgeNodeIdType,
    operation: 'create' | 'update' | 'lock',
  ): Promise<CollisionResult> {
    this.stats.collisionCount++;
    
    this.logger.info(
      `Collision detected: Expert ${expertId} attempting ${operation} on ${nodeId}`,
      ExpertPoolManager.name,
    );
    
    try {
      // Check node state
      const node = await this.knowledgeGraph.getNode(nodeId);
      
      if (!node) {
        // Node doesn't exist, safe to create
        return {
          handled: true,
          action: 'skipped',
          message: 'Node does not exist, safe to proceed',
        };
      }
      
      if (node.lock) {
        // Node is locked by another expert
        if (node.lock.lockedBy === expertId) {
          // This expert owns the lock
          return {
            handled: true,
            action: 'skipped',
            message: 'Expert already owns lock',
          };
        }
        
        // Check if lock is stale (> 15 minutes old)
        const lockAge = Date.now() - node.lock.lockedAt.getTime();
        if (lockAge > 15 * 60 * 1000) {
          this.logger.warn(
            `Stale lock detected on ${nodeId}, releasing`,
            ExpertPoolManager.name,
          );
          await this.knowledgeGraph.unlockNode(nodeId, node.lock.lockedBy as ExpertAgentIdType);
          
          return {
            handled: true,
            action: 'merged',
            message: 'Released stale lock, can proceed',
          };
        }
        
        // Wait briefly and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check again
        const nodeAfterWait = await this.knowledgeGraph.getNode(nodeId);
        if (!nodeAfterWait?.lock) {
          return {
            handled: true,
            action: 'waited',
            message: 'Lock released after wait, can proceed',
          };
        }
        
        // Still locked, skip this node
        this.logger.info(
          `Expert ${expertId} skipping ${nodeId} (locked by ${node.lock.lockedBy})`,
          ExpertPoolManager.name,
        );
        
        return {
          handled: true,
          action: 'skipped',
          message: `Node locked by ${node.lock.lockedBy}`,
        };
      }
      
      // Node exists but not locked
      if (operation === 'create') {
        // Can't create, already exists - just skip
        return {
          handled: true,
          action: 'skipped',
          message: 'Node already exists, skipping creation',
        };
      }
      
      // For update, proceed
      return {
        handled: true,
        action: 'merged',
        message: 'Node exists, proceeding with update',
      };
      
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error handling collision for ${nodeId}: ${info.message}`,
        ExpertPoolManager.name,
        info.stack,
      );
      
      return {
        handled: false,
        action: 'failed',
        message: `Collision handling failed: ${info.message}`,
      };
    }
  }

  /**
   * Get work log for a specific expert
   */
  getExpertWorkLog(expertId: ExpertAgentIdType): KGModification[] {
    return this.expertWorkLogs.get(expertId) || [];
  }

  /**
   * Get currently active experts
   */
  getActiveExperts(): ActiveExpert[] {
    return Array.from(this.activeExperts.values());
  }

  /**
   * Get pool statistics
   */
  getStatistics(): ExpertPoolStats {
    return {
      ...this.stats,
      activeExperts: this.activeExperts.size,
      queuedRequests: this.expertSemaphore.queueLength(),
    };
  }

  /**
   * Wait for all active experts to complete
   */
  async waitForAll(): Promise<void> {
    const promises = Array.from(this.activeExperts.values()).map(e => e.promise);
    await Promise.allSettled(promises);
  }

  /**
   * Abort all active experts
   */
  async abortAll(): Promise<void> {
    this.logger.warn(
      `Aborting ${this.activeExperts.size} active experts`,
      ExpertPoolManager.name,
    );
    
    for (const expert of this.activeExperts.values()) {
      if (expert.timeout) {
        clearTimeout(expert.timeout);
      }
      if (expert.abortController) {
        expert.abortController.abort();
      }
    }
    
    this.activeExperts.clear();
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      activeExperts: 0,
      totalExpertsSpawned: 0,
      totalTopicsCompleted: 0,
      totalTopicsFailed: 0,
      totalTimeout: 0,
      totalEscalations: 0,
      averageCompletionTimeMs: 0,
      collisionCount: 0,
      queuedRequests: 0,
    };
    this.completionTimes = [];
  }

  // ========================================
  // Private Helpers
  // ========================================

  /**
   * Generate a unique expert ID
   */
  private generateExpertId(): ExpertAgentIdType {
    // Use timestamp + random to generate unique ID
    // In production, use proper ObjectId from MongoDB
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `ea_${timestamp}${random}` as ExpertAgentIdType;
  }

  /**
   * Calculate average confidence from modifications
   */
  private calculateAvgConfidence(modifications: KGModification[]): number {
    const confidenceValues = modifications
      .filter(m => m.metadata?.confidence !== undefined)
      .map(m => m.metadata!.confidence as number);
    
    if (confidenceValues.length === 0) return 0.5;
    
    return confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
  }
}
