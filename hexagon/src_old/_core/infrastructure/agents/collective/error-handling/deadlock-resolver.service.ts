import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveTask, CollectiveTaskDocument, TaskState, TaskLevel } from '../entities/collective-task.entity';
import { Collective, CollectiveDocument, CollectiveStatus } from '../entities/collective.entity';
import { EventType, ActorType } from '../entities/collective-event.entity';
import { DeadlockDetectionService, DeadlockInfo } from '../services/deadlock-detection.service';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { CommunicationService } from '../communication/communication.service';
import { PMToolsService } from '../services/pm-tools.service';

/**
 * DeadlockResolverService
 * 
 * Intelligent deadlock resolution for Collective Agent system.
 * 
 * Responsibilities:
 * - Analyze deadlock cycles
 * - Determine optimal resolution strategy
 * - Execute resolution (cancel, reassign, remove dependency, etc.)
 * - Monitor resolution success
 * - Escalate to human if automated resolution fails
 * 
 * Resolution Strategies:
 * 1. Cancel least-important task in cycle
 * 2. Remove circular dependency
 * 3. Reassign task to break agent contention
 * 4. Mark task as unblocked (manual override)
 * 5. Escalate to human for decision
 */
@Injectable()
export class DeadlockResolverService {
  private readonly logger = new Logger(DeadlockResolverService.name);

  // Resolution attempt tracking
  private readonly resolutionAttempts = new Map<string, number>(); // deadlockId -> attempts
  private readonly MAX_AUTO_RESOLUTION_ATTEMPTS = 3;

  constructor(
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    private readonly deadlockDetection: DeadlockDetectionService,
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
    private readonly communication: CommunicationService,
    private readonly pmTools: PMToolsService,
  ) {}

  /**
   * Resolve all detected deadlocks in a collective.
   */
  async resolveDeadlocks(collectiveId: string | Types.ObjectId): Promise<{
    resolved: number;
    failed: number;
    escalated: number;
    strategies: Record<string, number>;
  }> {
    const deadlocks = await this.deadlockDetection.detectDeadlocks(collectiveId as any);

    if (deadlocks.length === 0) {
      return { resolved: 0, failed: 0, escalated: 0, strategies: {} };
    }

    this.logger.log(`Resolving ${deadlocks.length} deadlocks in collective ${collectiveId}`);

    const results = {
      resolved: 0,
      failed: 0,
      escalated: 0,
      strategies: {} as Record<string, number>,
    };

    for (const deadlock of deadlocks) {
      const deadlockId = this.getDeadlockId(deadlock);
      const attempts = this.resolutionAttempts.get(deadlockId) || 0;

      if (attempts >= this.MAX_AUTO_RESOLUTION_ATTEMPTS) {
        // Escalate to human
        await this.escalateDeadlockToHuman(collectiveId, deadlock);
        results.escalated++;
        continue;
      }

      try {
        const strategy = await this.determineResolutionStrategy(collectiveId, deadlock);
        await this.executeResolutionStrategy(collectiveId, deadlock, strategy);

        // Track attempt
        this.resolutionAttempts.set(deadlockId, attempts + 1);

        // Verify resolution
        const stillExists = await this.verifyDeadlockResolved(collectiveId, deadlock);
        if (!stillExists) {
          this.logger.log(`Deadlock resolved using strategy: ${strategy}`);
          results.resolved++;
          results.strategies[strategy] = (results.strategies[strategy] || 0) + 1;
          this.resolutionAttempts.delete(deadlockId);
        } else {
          this.logger.warn(`Deadlock still exists after ${strategy} strategy`);
          results.failed++;
        }
      } catch (error) {
        this.logger.error(`Error resolving deadlock:`, error);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Determine the best resolution strategy for a deadlock.
   */
  private async determineResolutionStrategy(
    collectiveId: string | Types.ObjectId,
    deadlock: DeadlockInfo,
  ): Promise<string> {
    // Load tasks in cycle
    const tasks = await Promise.all(
      deadlock.cycle.map(taskId => this.taskModel.findById(taskId)),
    );

    const validTasks = tasks.filter(t => t !== null) as CollectiveTaskDocument[];

    if (validTasks.length === 0) {
      return 'none'; // No tasks to resolve
    }

    // Strategy 1: Cancel least important task
    const leastImportant = this.findLeastImportantTask(validTasks);
    if (leastImportant && this.canCancelTask(leastImportant)) {
      return 'cancel_task';
    }

    // Strategy 2: Remove safest dependency
    const safestDependency = await this.findSafestDependencyToRemove(validTasks);
    if (safestDependency) {
      return 'remove_dependency';
    }

    // Strategy 3: Reassign task to break contention
    if (deadlock.involvedAgents.length > 1) {
      return 'reassign_task';
    }

    // Strategy 4: Mark task as unblocked (override)
    const blockableTask = validTasks.find(t => t.state === TaskState.BLOCKED);
    if (blockableTask) {
      return 'force_unblock';
    }

    // Default: Escalate to human
    return 'escalate';
  }

  /**
   * Execute a resolution strategy.
   */
  private async executeResolutionStrategy(
    collectiveId: string | Types.ObjectId,
    deadlock: DeadlockInfo,
    strategy: string,
  ): Promise<void> {
    this.logger.log(`Executing deadlock resolution strategy: ${strategy}`);

    const tasks = await Promise.all(
      deadlock.cycle.map(taskId => this.taskModel.findById(taskId)),
    );

    const validTasks = tasks.filter(t => t !== null) as CollectiveTaskDocument[];

    switch (strategy) {
      case 'cancel_task':
        await this.cancelLeastImportantTask(collectiveId, validTasks);
        break;

      case 'remove_dependency':
        await this.removeSafestDependency(collectiveId, validTasks);
        break;

      case 'reassign_task':
        await this.reassignTaskToBreakContention(collectiveId, deadlock, validTasks);
        break;

      case 'force_unblock':
        await this.forceUnblockTask(collectiveId, validTasks);
        break;

      case 'escalate':
        await this.escalateDeadlockToHuman(collectiveId, deadlock);
        break;

      default:
        this.logger.warn(`Unknown resolution strategy: ${strategy}`);
    }

    // Log resolution event
    await this.eventsRepo.create({
      collectiveId: collectiveId as any,
      type: EventType.DEADLOCK_RESOLVED,
      actorId: 'pm_agent',
      actorType: ActorType.AGENT,
      timestamp: new Date(),
      description: `Deadlock resolution attempted using strategy: ${strategy}`,
      metadata: {
        strategy,
        deadlockCycle: deadlock.cycle,
        involvedAgents: deadlock.involvedAgents,
      },
    });
  }

  /**
   * Cancel the least important task in the cycle.
   */
  private async cancelLeastImportantTask(
    collectiveId: string | Types.ObjectId,
    tasks: CollectiveTaskDocument[],
  ): Promise<void> {
    const leastImportant = this.findLeastImportantTask(tasks);
    if (!leastImportant) {
      throw new Error('No task to cancel');
    }

    await this.pmTools.cancelTask({
      collectiveId: collectiveId as any,
      taskId: leastImportant._id as any,
      reason: 'Cancelled to resolve deadlock (least important task in cycle)',
    });

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Resolved deadlock by cancelling task "${leastImportant.title}"`,
      { priority: 'HIGH' },
    );

    this.logger.log(`Cancelled task ${leastImportant._id} to resolve deadlock`);
  }

  /**
   * Remove the safest dependency to break the cycle.
   */
  private async removeSafestDependency(
    collectiveId: string | Types.ObjectId,
    tasks: CollectiveTaskDocument[],
  ): Promise<void> {
    const dependency = await this.findSafestDependencyToRemove(tasks);
    if (!dependency) {
      throw new Error('No safe dependency to remove');
    }

    const { fromTask, toTask } = dependency;
    const toTaskId = toTask._id as Types.ObjectId;

    // Remove dependency
    fromTask.dependencies = fromTask.dependencies?.filter(
      depId => depId.toString() !== toTaskId.toString(),
    );
    await fromTask.save();

    // Note: 'blockers' property doesn't exist on CollectiveTaskDocument
    // This code was referencing a non-existent property and has been commented out
    // If needed, implement blockers tracking in a different way
    /*
    if (fromTask.blockers) {
      fromTask.blockers = fromTask.blockers.filter(
        (blocker: any) => !blocker.description.includes(toTask.title),
      );
      await fromTask.save();
    }
    */

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Resolved deadlock by removing dependency: "${fromTask.title}" no longer depends on "${toTask.title}"`,
      { priority: 'HIGH' },
    );

    this.logger.log(`Removed dependency from ${fromTask._id} to ${toTask._id}`);
  }

  /**
   * Reassign a task to break agent contention.
   */
  private async reassignTaskToBreakContention(
    collectiveId: string | Types.ObjectId,
    deadlock: DeadlockInfo,
    tasks: CollectiveTaskDocument[],
  ): Promise<void> {
    // Find task that can be reassigned
    const taskToReassign = tasks.find(t => t.assignedAgentId);
    if (!taskToReassign) {
      throw new Error('No task to reassign');
    }

    // Get collective to find available agents
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error('Collective not found');
    }

    // Find agent not involved in deadlock
    const availableAgent = collective.agents.find(
      agent => !deadlock.involvedAgents.includes(agent.id) && agent.status === 'idle',
    );

    if (!availableAgent) {
      throw new Error('No available agent to reassign to');
    }

    // Reassign task
    await this.pmTools.reassignTask({
      collectiveId: collectiveId as any,
      taskId: taskToReassign._id as any,
      fromAgentId: taskToReassign.assignedAgentId || '',
      toAgentId: availableAgent.id,
      reason: 'Reassigned to resolve deadlock',
    });

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Resolved deadlock by reassigning task "${taskToReassign.title}" to ${availableAgent.id}`,
      { priority: 'HIGH' },
    );

    this.logger.log(`Reassigned task ${taskToReassign._id} to ${availableAgent.id}`);
  }

  /**
   * Force unblock a task (manual override).
   */
  private async forceUnblockTask(
    collectiveId: string | Types.ObjectId,
    tasks: CollectiveTaskDocument[],
  ): Promise<void> {
    const blockedTask = tasks.find(t => t.state === TaskState.BLOCKED);
    if (!blockedTask) {
      throw new Error('No blocked task to unblock');
    }

    // Note: 'blockers' property doesn't exist on CollectiveTaskDocument
    // Clear blockers (if we had that property)
    // blockedTask.blockers = [];
    blockedTask.state = TaskState.UNASSIGNED;
    await blockedTask.save();

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Resolved deadlock by force-unblocking task "${blockedTask.title}" (manual override)`,
      { priority: 'HIGH' },
    );

    this.logger.log(`Force-unblocked task ${blockedTask._id}`);
  }

  /**
   * Escalate deadlock to human for manual resolution.
   */
  private async escalateDeadlockToHuman(
    collectiveId: string | Types.ObjectId,
    deadlock: DeadlockInfo,
  ): Promise<void> {
    // Build context summary
    const tasks = await Promise.all(
      deadlock.cycle.map(taskId => this.taskModel.findById(taskId)),
    );

    const validTasks = tasks.filter(t => t !== null) as CollectiveTaskDocument[];

    const summary = this.buildDeadlockSummary(deadlock, validTasks);

    // Escalate to PM conversation (for human review)
    await this.communication.escalateToPM(
      collectiveId,
      'pm_agent',
      `DEADLOCK DETECTED - HUMAN INTERVENTION REQUIRED\n\n${summary}`,
      {
        reason: 'Automatic resolution failed after 3 attempts',
        metadata: {
          deadlockCycle: deadlock.cycle,
          involvedAgents: deadlock.involvedAgents,
        },
      },
    );

    // Pause collective
    const collective = await this.collectiveModel.findById(collectiveId);
    if (collective) {
      collective.status = CollectiveStatus.PAUSED;
      await collective.save();
    }

    this.logger.warn(`Escalated deadlock to human for collective ${collectiveId}`);
  }

  /**
   * Verify that a deadlock has been resolved.
   */
  private async verifyDeadlockResolved(
    collectiveId: string | Types.ObjectId,
    originalDeadlock: DeadlockInfo,
  ): Promise<boolean> {
    // Re-run deadlock detection
    const currentDeadlocks = await this.deadlockDetection.detectDeadlocks(
      collectiveId as any,
    );

    // Check if the same cycle still exists
    for (const deadlock of currentDeadlocks) {
      if (this.isSameDeadlock(originalDeadlock, deadlock)) {
        return true; // Deadlock still exists
      }
    }

    return false; // Deadlock resolved
  }

  /**
   * Find the least important task in a set.
   * Priority: SUBTASK > TASK > STORY > FEATURE > EPIC > PROGRAM > PORTFOLIO > VISION
   */
  private findLeastImportantTask(
    tasks: CollectiveTaskDocument[],
  ): CollectiveTaskDocument | null {
    if (tasks.length === 0) return null;

    // TaskLevel is numeric: VISION=0, PORTFOLIO=1, ...  SUBTASK=7
    // Higher level number = less important, easier to cancel
    // So we want the highest level number
    return tasks.reduce((least, current) => {
      return current.level > least.level ? current : least;
    });
  }

  /**
   * Check if a task can be safely cancelled.
   */
  private canCancelTask(task: CollectiveTaskDocument): boolean {
    // Don't cancel VISION level tasks (too important)
    if (task.level === TaskLevel.VISION) return false;

    // Don't cancel if it has many child tasks
    if (task.childTaskIds && task.childTaskIds.length > 5) return false;

    // Don't cancel if it's nearly complete or in progress
    // Note: 'result' property doesn't exist on CollectiveTaskDocument
    if (task.state === TaskState.IN_PROGRESS) return false;

    return true;
  }

  /**
   * Find the safest dependency to remove from the cycle.
   */
  private async findSafestDependencyToRemove(
    tasks: CollectiveTaskDocument[],
  ): Promise<{ fromTask: CollectiveTaskDocument; toTask: CollectiveTaskDocument } | null> {
    // Look for dependencies where:
    // 1. The dependent task is not yet started (state = TODO)
    // 2. The dependency is not critical

    for (const fromTask of tasks) {
      if (fromTask.state !== TaskState.UNASSIGNED) continue;
      if (!fromTask.dependencies || fromTask.dependencies.length === 0) continue;

      for (const depId of fromTask.dependencies) {
        const toTask = tasks.find(t => (t._id as Types.ObjectId).toString() === depId.toString());
        if (toTask) {
          // Safe to remove if fromTask hasn't started
          return { fromTask, toTask };
        }
      }
    }

    return null;
  }

  /**
   * Build a human-readable deadlock summary.
   */
  private buildDeadlockSummary(
    deadlock: DeadlockInfo,
    tasks: CollectiveTaskDocument[],
  ): string {
    let summary = `**Deadlock Cycle:**\n`;

    for (let i = 0; i < deadlock.cycle.length; i++) {
      const taskId = deadlock.cycle[i];
      const task = tasks.find(t => (t._id as Types.ObjectId).toString() === taskId);

      if (task) {
        summary += `${i + 1}. "${task.title}" (${task.level}, ${task.state})`;
        if (task.assignedAgentId) {
          summary += ` - assigned to ${task.assignedAgentId}`;
        }
        summary += '\n';
      }
    }

    summary += `\n**Involved Agents:** ${deadlock.involvedAgents.join(', ')}\n`;
    summary += `\n**Suggested Actions:**\n`;
    summary += `1. Cancel one of the least important tasks\n`;
    summary += `2. Remove a circular dependency\n`;
    summary += `3. Reassign a task to a different agent\n`;
    summary += `4. Force-unblock a task (override)\n`;

    return summary;
  }

  /**
   * Generate a unique ID for a deadlock (based on cycle).
   */
  private getDeadlockId(deadlock: DeadlockInfo): string {
    return deadlock.cycle.sort().join('-');
  }

  /**
   * Check if two deadlocks are the same (same cycle).
   */
  private isSameDeadlock(deadlock1: DeadlockInfo, deadlock2: DeadlockInfo): boolean {
    const cycle1 = deadlock1.cycle.sort().join('-');
    const cycle2 = deadlock2.cycle.sort().join('-');
    return cycle1 === cycle2;
  }

  /**
   * Clear resolution attempt history (useful after collective completion).
   */
  clearResolutionHistory(collectiveId: string): void {
    // Remove all entries for this collective
    const keysToDelete: string[] = [];
    for (const [key, _] of this.resolutionAttempts.entries()) {
      if (key.includes(collectiveId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.resolutionAttempts.delete(key));
  }
}
