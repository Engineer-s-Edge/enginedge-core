import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';

export interface DeadlockInfo {
  id: string;
  cycle: string[]; // Task IDs in circular dependency
  involvedAgents: string[];
  detectedAt: Date;
}

/**
 * Deadlock Detection Service
 * Detects circular dependencies in task graph using DFS cycle detection
 */
@Injectable()
export class DeadlockDetectionService {
  private readonly logger = new Logger(DeadlockDetectionService.name);

  constructor(private readonly tasksRepo: CollectiveTasksRepository) {}

  /**
   * Detect all deadlocks in a collective
   */
  async detectDeadlocks(collectiveId: Types.ObjectId): Promise<DeadlockInfo[]> {
    const blockedTasks = await this.tasksRepo.findBlockedTasks(collectiveId);
    const deadlocks: DeadlockInfo[] = [];
    const visitedGlobal = new Set<string>();

    for (const task of blockedTasks) {
      const taskId = (task._id as Types.ObjectId).toString();

      if (visitedGlobal.has(taskId)) {
        continue;
      }

      const visited = new Set<string>();
      const path: string[] = [];
      const cycle = this.detectCycle(taskId, visited, path, blockedTasks);

      if (cycle) {
        // Mark all tasks in cycle as visited globally
        cycle.forEach((id) => visitedGlobal.add(id));

        // Get involved agents
        const involvedAgents = await this.getInvolvedAgents(cycle);

        deadlocks.push({
          id: `deadlock-${Date.now()}-${deadlocks.length}`,
          cycle,
          involvedAgents,
          detectedAt: new Date(),
        });

        this.logger.warn(`Deadlock detected: ${cycle.join(' → ')}`);
      }
    }

    return deadlocks;
  }

  /**
   * DFS cycle detection
   */
  private detectCycle(
    taskId: string,
    visited: Set<string>,
    path: string[],
    allTasks: any[],
  ): string[] | null {
    // Check if we've found a cycle
    const cycleStartIndex = path.indexOf(taskId);
    if (cycleStartIndex !== -1) {
      // Return the cycle
      return path.slice(cycleStartIndex);
    }

    if (visited.has(taskId)) {
      return null;
    }

    visited.add(taskId);
    path.push(taskId);

    // Find the task
    const task = allTasks.find((t) => t._id.toString() === taskId);

    if (!task || !task.blockedBy || task.blockedBy.length === 0) {
      path.pop();
      return null;
    }

    // Explore all blocking tasks
    for (const blockerId of task.blockedBy) {
      const blockerIdStr = blockerId.toString();
      const cycle = this.detectCycle(blockerIdStr, visited, path, allTasks);

      if (cycle) {
        return cycle;
      }
    }

    path.pop();
    return null;
  }

  /**
   * Get agents involved in deadlock
   */
  private async getInvolvedAgents(taskIds: string[]): Promise<string[]> {
    const agents = new Set<string>();

    for (const taskId of taskIds) {
      const task = await this.tasksRepo.findById(taskId);
      if (task?.assignedAgentId) {
        agents.add(task.assignedAgentId);
      }
    }

    return Array.from(agents);
  }

  /**
   * Check if a specific task is in a deadlock
   */
  async isTaskDeadlocked(
    collectiveId: Types.ObjectId,
    taskId: string,
  ): Promise<boolean> {
    const deadlocks = await this.detectDeadlocks(collectiveId);
    return deadlocks.some((d) => d.cycle.includes(taskId));
  }
}
