import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveArtifact, CollectiveArtifactDocument } from '../entities/collective-artifact.entity';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { EventType, ActorType, TargetType } from '../entities/collective-event.entity';

/**
 * ArtifactLockingService
 * 
 * Prevents concurrent modification conflicts through optimistic and pessimistic locking.
 * 
 * Lock Types:
 * - READ: Multiple agents can read, no writes allowed
 * - WRITE: Exclusive access for one agent, no reads/writes by others
 * 
 * Features:
 * - Automatic lock expiration (prevents deadlocks from crashed agents)
 * - Lock queue for fair access
 * - Lock upgrade (READ → WRITE)
 * - Lock statistics and monitoring
 * 
 * Use Cases:
 * - Agent A writing to shared document while Agent B wants to read
 * - Multiple agents trying to update same artifact
 * - PM reviewing artifact while agent is updating it
 */
@Injectable()
export class ArtifactLockingService {
  private readonly logger = new Logger(ArtifactLockingService.name);

  // In-memory lock tracking (in production, use Redis)
  private readonly activeLocks = new Map<string, LockInfo>();
  private readonly lockQueues = new Map<string, QueuedLockRequest[]>();

  // Configuration
  private readonly DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_LOCK_WAIT_MS = 30 * 1000; // 30 seconds
  private readonly LOCK_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

  constructor(
    @InjectModel(CollectiveArtifact.name) private artifactModel: Model<CollectiveArtifactDocument>,
    private readonly eventsRepo: CollectiveEventsRepository,
  ) {
    // Start periodic lock cleanup
    this.startLockCleanup();
  }

  /**
   * Acquire a lock on an artifact.
   * 
   * @param artifactId - Artifact to lock
   * @param agentId - Agent requesting lock
   * @param lockType - 'READ' or 'WRITE'
   * @param timeoutMs - Lock timeout in milliseconds
   * @returns Lock token if successful, null if lock not available
   */
  async acquireLock(
    artifactId: string | Types.ObjectId,
    agentId: string,
    lockType: 'READ' | 'WRITE',
    timeoutMs: number = this.DEFAULT_LOCK_TIMEOUT_MS,
  ): Promise<string | null> {
    const artifactIdStr = artifactId.toString();
    
    this.logger.log(`Agent ${agentId} requesting ${lockType} lock on artifact ${artifactIdStr}`);

    // Check if lock can be granted immediately
    if (this.canGrantLock(artifactIdStr, lockType)) {
      return this.grantLock(artifactIdStr, agentId, lockType, timeoutMs);
    }

    // Add to queue and wait
    const queuedRequest: QueuedLockRequest = {
      artifactId: artifactIdStr,
      agentId,
      lockType,
      requestedAt: new Date(),
      timeoutMs,
      resolve: null as any,
      reject: null as any,
    };

    const promise = new Promise<string | null>((resolve, reject) => {
      queuedRequest.resolve = resolve;
      queuedRequest.reject = reject;
    });

    // Add to queue
    const queue = this.lockQueues.get(artifactIdStr) || [];
    queue.push(queuedRequest);
    this.lockQueues.set(artifactIdStr, queue);

    // Set timeout for queue wait
    setTimeout(() => {
      if (!queuedRequest.resolve) return; // Already resolved
      this.removeFromQueue(artifactIdStr, queuedRequest);
      queuedRequest.resolve(null); // Timeout - lock not acquired
    }, this.MAX_LOCK_WAIT_MS);

    return promise;
  }

  /**
   * Release a lock on an artifact.
   */
  async releaseLock(
    artifactId: string | Types.ObjectId,
    lockToken: string,
  ): Promise<boolean> {
    const artifactIdStr = artifactId.toString();
    const lock = this.activeLocks.get(artifactIdStr);

    if (!lock) {
      this.logger.warn(`No active lock found for artifact ${artifactIdStr}`);
      return false;
    }

    if (lock.token !== lockToken) {
      this.logger.warn(`Invalid lock token for artifact ${artifactIdStr}`);
      return false;
    }

    this.logger.log(`Releasing ${lock.type} lock on artifact ${artifactIdStr} by ${lock.agentId}`);

    // Remove lock
    this.activeLocks.delete(artifactIdStr);

    // Log release event
    await this.eventsRepo.create({
      collectiveId: lock.collectiveId as any,
      type: EventType.ARTIFACT_UNLOCKED,
      timestamp: new Date(),
      actorId: lock.agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.ARTIFACT,
      targetId: artifactIdStr,
      description: 'Artifact unlocked',
      metadata: {
        lockType: lock.type,
        lockDuration: Date.now() - lock.acquiredAt.getTime(),
      },
    });

    // Process queue
    await this.processLockQueue(artifactIdStr);

    return true;
  }

  /**
   * Try to upgrade a READ lock to a WRITE lock.
   */
  async upgradeLock(
    artifactId: string | Types.ObjectId,
    lockToken: string,
  ): Promise<string | null> {
    const artifactIdStr = artifactId.toString();
    const lock = this.activeLocks.get(artifactIdStr);

    if (!lock || lock.token !== lockToken) {
      return null;
    }

    if (lock.type === 'WRITE') {
      return lockToken; // Already a WRITE lock
    }

    // Check if we can upgrade (no other READ locks)
    const otherReadLocks = Array.from(this.activeLocks.values()).filter(
      l => l.artifactId === artifactIdStr && l.token !== lockToken,
    );

    if (otherReadLocks.length > 0) {
      this.logger.log(`Cannot upgrade lock - ${otherReadLocks.length} other READ locks exist`);
      return null; // Cannot upgrade while others hold READ locks
    }

    // Upgrade to WRITE
    lock.type = 'WRITE';
    this.logger.log(`Upgraded lock to WRITE for artifact ${artifactIdStr}`);

    return lockToken;
  }

  /**
   * Check if an artifact is currently locked.
   */
  isLocked(artifactId: string | Types.ObjectId): boolean {
    return this.activeLocks.has(artifactId.toString());
  }

  /**
   * Get current lock info for an artifact.
   */
  getLockInfo(artifactId: string | Types.ObjectId): LockInfo | null {
    return this.activeLocks.get(artifactId.toString()) || null;
  }

  /**
   * Get all locks held by an agent.
   */
  getAgentLocks(agentId: string): LockInfo[] {
    return Array.from(this.activeLocks.values()).filter(
      lock => lock.agentId === agentId,
    );
  }

  /**
   * Force release all locks held by an agent (e.g., when agent crashes).
   */
  async releaseAgentLocks(agentId: string): Promise<number> {
    const locks = this.getAgentLocks(agentId);
    
    this.logger.log(`Force releasing ${locks.length} locks for agent ${agentId}`);

    for (const lock of locks) {
      await this.releaseLock(lock.artifactId, lock.token);
    }

    return locks.length;
  }

  /**
   * Get lock statistics.
   */
  async getLockStats(collectiveId: string | Types.ObjectId): Promise<{
    activeLocks: number;
    readLocks: number;
    writeLocks: number;
    queuedRequests: number;
    avgLockDuration: number;
  }> {
    const locks = Array.from(this.activeLocks.values()).filter(
      lock => lock.collectiveId === collectiveId.toString(),
    );

    const stats = {
      activeLocks: locks.length,
      readLocks: locks.filter(l => l.type === 'READ').length,
      writeLocks: locks.filter(l => l.type === 'WRITE').length,
      queuedRequests: 0,
      avgLockDuration: 0,
    };

    // Count queued requests
    for (const queue of this.lockQueues.values()) {
      stats.queuedRequests += queue.length;
    }

    // Calculate average lock duration
    if (locks.length > 0) {
      const totalDuration = locks.reduce((sum, lock) => {
        return sum + (Date.now() - lock.acquiredAt.getTime());
      }, 0);
      stats.avgLockDuration = totalDuration / locks.length;
    }

    return stats;
  }

  /**
   * Execute a function with a lock (automatic acquire/release).
   */
  async withLock<T>(
    artifactId: string | Types.ObjectId,
    agentId: string,
    lockType: 'READ' | 'WRITE',
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockToken = await this.acquireLock(artifactId, agentId, lockType);
    
    if (!lockToken) {
      throw new Error(`Failed to acquire ${lockType} lock on artifact ${artifactId}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(artifactId, lockToken);
    }
  }

  /**
   * Check if a lock can be granted.
   */
  private canGrantLock(artifactId: string, lockType: 'READ' | 'WRITE'): boolean {
    const existingLocks = Array.from(this.activeLocks.values()).filter(
      lock => lock.artifactId === artifactId,
    );

    if (existingLocks.length === 0) {
      return true; // No locks, can grant
    }

    if (lockType === 'WRITE') {
      return false; // WRITE requires exclusive access
    }

    // READ can be granted if all existing locks are READ
    return existingLocks.every(lock => lock.type === 'READ');
  }

  /**
   * Grant a lock.
   */
  private grantLock(
    artifactId: string,
    agentId: string,
    lockType: 'READ' | 'WRITE',
    timeoutMs: number,
  ): string {
    const token = this.generateLockToken();
    
    const lock: LockInfo = {
      artifactId,
      agentId,
      type: lockType,
      token,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + timeoutMs),
      collectiveId: '', // Will be set from artifact
    };

    this.activeLocks.set(artifactId, lock);

    // Log lock event (async, no await)
    this.artifactModel.findById(artifactId).then(artifact => {
      if (artifact) {
        lock.collectiveId = artifact.collectiveId.toString();
        this.eventsRepo.create({
          collectiveId: artifact.collectiveId as any,
          type: EventType.ARTIFACT_LOCKED,
          timestamp: new Date(),
          actorId: agentId,
          actorType: ActorType.AGENT,
          targetType: TargetType.ARTIFACT,
          targetId: artifactId,
          description: 'Artifact locked',
          metadata: {
            lockType,
            expiresAt: lock.expiresAt.toISOString(),
          },
        });
      }
    });

    this.logger.log(`Granted ${lockType} lock on artifact ${artifactId} to ${agentId}`);

    return token;
  }

  /**
   * Process queued lock requests for an artifact.
   */
  private async processLockQueue(artifactId: string): Promise<void> {
    const queue = this.lockQueues.get(artifactId);
    if (!queue || queue.length === 0) return;

    // Try to grant locks to queued requests
    const toGrant: QueuedLockRequest[] = [];
    
    for (const request of queue) {
      if (this.canGrantLock(artifactId, request.lockType)) {
        toGrant.push(request);
        
        // If granting WRITE, stop (exclusive access)
        if (request.lockType === 'WRITE') break;
      } else {
        break; // Can't grant this one, stop checking
      }
    }

    // Grant locks
    for (const request of toGrant) {
      const token = this.grantLock(
        request.artifactId,
        request.agentId,
        request.lockType,
        request.timeoutMs,
      );
      
      if (request.resolve) {
        request.resolve(token);
        request.resolve = null; // Mark as resolved
      }

      // Remove from queue
      this.removeFromQueue(artifactId, request);
    }
  }

  /**
   * Remove a request from the queue.
   */
  private removeFromQueue(artifactId: string, request: QueuedLockRequest): void {
    const queue = this.lockQueues.get(artifactId);
    if (!queue) return;

    const index = queue.indexOf(request);
    if (index !== -1) {
      queue.splice(index, 1);
    }

    if (queue.length === 0) {
      this.lockQueues.delete(artifactId);
    }
  }

  /**
   * Generate a unique lock token.
   */
  private generateLockToken(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Periodic cleanup of expired locks.
   */
  private startLockCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.LOCK_CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up expired locks.
   */
  private async cleanupExpiredLocks(): Promise<void> {
    const now = Date.now();
    const expiredLocks: LockInfo[] = [];

    for (const [artifactId, lock] of this.activeLocks.entries()) {
      if (lock.expiresAt.getTime() < now) {
        expiredLocks.push(lock);
        this.activeLocks.delete(artifactId);
      }
    }

    if (expiredLocks.length > 0) {
      this.logger.log(`Cleaned up ${expiredLocks.length} expired locks`);

      // Process queues for expired locks
      for (const lock of expiredLocks) {
        await this.processLockQueue(lock.artifactId);
      }
    }
  }
}

interface LockInfo {
  artifactId: string;
  agentId: string;
  type: 'READ' | 'WRITE';
  token: string;
  acquiredAt: Date;
  expiresAt: Date;
  collectiveId: string;
}

interface QueuedLockRequest {
  artifactId: string;
  agentId: string;
  lockType: 'READ' | 'WRITE';
  requestedAt: Date;
  timeoutMs: number;
  resolve: ((value: string | null) => void) | null;
  reject: ((reason?: any) => void) | null;
}
