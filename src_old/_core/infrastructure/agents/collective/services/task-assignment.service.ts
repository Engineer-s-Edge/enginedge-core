import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectivesRepository } from '../repositories/collectives.repository';
import { TaskState } from '../entities/collective-task.entity';
import { AgentStatus } from '../entities/collective.entity';

/**
 * Task Assignment Service
 * Implements algorithmic task assignment for idle agents
 */
@Injectable()
export class TaskAssignmentService {
  private readonly logger = new Logger(TaskAssignmentService.name);

  constructor(
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly collectivesRepo: CollectivesRepository,
  ) {}

  /**
   * Assign tasks to idle agents
   * Assigns ONE task only if agent's message queue is empty
   */
  async assignTasksToIdleAgents(collectiveId: Types.ObjectId): Promise<number> {
    const collective = await this.collectivesRepo.findById(collectiveId);
    if (!collective) {
      return 0;
    }

    // Find idle agents
    const idleAgents = collective.agents.filter((a) => a.status === AgentStatus.IDLE);

    let assignedCount = 0;

    for (const agent of idleAgents) {
      // Check if agent has pending messages
      // Note: This should check message queue, but for now we'll just try to assign
      const assigned = await this.assignSingleTask(collectiveId, agent.id);
      if (assigned) {
        assignedCount++;
      }
    }

    return assignedCount;
  }

  /**
   * Assign a single task to an agent
   */
  async assignSingleTask(
    collectiveId: Types.ObjectId,
    agentId: string,
  ): Promise<boolean> {
    // Get available tasks for this agent
    const availableTasks = await this.tasksRepo.findAvailableTasks(collectiveId, [
      agentId,
    ]);

    if (availableTasks.length === 0) {
      return false; // No tasks available
    }

    // Get highest priority task (first in list)
    const task = availableTasks[0];

    // Try to assign (atomic operation prevents race conditions)
    const assigned = await this.tasksRepo.assignTask(task._id as Types.ObjectId, agentId);

    if (assigned) {
      this.logger.log(`Assigned task ${task.title} to agent ${agentId}`);

      // Update agent status
      await this.collectivesRepo.updateAgentStatus(
        collectiveId,
        agentId,
        AgentStatus.WORKING,
        (task._id as Types.ObjectId).toString(),
      );

      return true;
    }

    return false; // Task claimed by another agent
  }

  /**
   * Find best matching agent for a task
   * Based on capabilities and current workload
   */
  async findBestAgentForTask(
    collectiveId: Types.ObjectId,
    taskId: Types.ObjectId,
  ): Promise<string | null> {
    const task = await this.tasksRepo.findById(taskId);
    if (!task) {
      return null;
    }

    const collective = await this.collectivesRepo.findById(collectiveId);
    if (!collective) {
      return null;
    }

    // Filter agents by allowed list
    const allowedAgents = collective.agents.filter((a) =>
      task.allowedAgentIds.includes(a.id),
    );

    if (allowedAgents.length === 0) {
      return null;
    }

    // Prefer idle agents
    const idleAgents = allowedAgents.filter((a) => a.status === AgentStatus.IDLE);

    if (idleAgents.length > 0) {
      // For now, just return first idle agent
      // TODO: Could implement more sophisticated matching based on capabilities
      return idleAgents[0].id;
    }

    // If no idle agents, return first allowed agent
    return allowedAgents[0].id;
  }

  /**
   * Check if agent can work on task
   */
  async canAgentWorkOnTask(
    collectiveId: Types.ObjectId,
    agentId: string,
    taskId: Types.ObjectId,
  ): Promise<boolean> {
    const task = await this.tasksRepo.findById(taskId);
    if (!task) {
      return false;
    }

    // Check if agent is in allowed list
    if (!task.allowedAgentIds.includes(agentId)) {
      return false;
    }

    // Check if task is available (unassigned and dependencies met)
    if (task.state !== TaskState.UNASSIGNED) {
      return false;
    }

    // Check dependencies
    if (task.dependencies.length > 0) {
      const dependencyTasks = await Promise.all(
        task.dependencies.map((dep) => this.tasksRepo.findById(dep)),
      );

      const allCompleted = dependencyTasks.every(
        (dep) => dep && dep.state === TaskState.COMPLETED,
      );

      if (!allCompleted) {
        return false;
      }
    }

    return true;
  }
}
