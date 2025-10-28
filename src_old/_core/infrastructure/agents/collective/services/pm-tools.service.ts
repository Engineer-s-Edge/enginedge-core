import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import {
  TaskLevel,
  TaskCategory,
  TaskState,
} from '../entities/collective-task.entity';
import { MessagePriority, MessageType } from '../entities/collective-message.entity';
import { EventType, ActorType, TargetType } from '../entities/collective-event.entity';

/**
 * PM Agent Special Tools
 * These tools are exclusive to the PM agent for orchestrating the collective
 */
@Injectable()
export class PMToolsService {
  constructor(
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly messagesRepo: CollectiveMessagesRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
  ) {}

  /**
   * Create a new task in the project board
   */
  async createTask(params: {
    collectiveId: Types.ObjectId;
    level: TaskLevel;
    parentTaskId?: Types.ObjectId;
    title: string;
    description: string;
    category: TaskCategory;
    allowedAgentIds: string[];
    dependencies?: Types.ObjectId[];
  }): Promise<Types.ObjectId> {
    const task = await this.tasksRepo.create({
      collectiveId: params.collectiveId,
      level: params.level,
      parentTaskId: params.parentTaskId,
      childTaskIds: [],
      title: params.title,
      description: params.description,
      category: params.category,
      state: TaskState.UNASSIGNED,
      allowedAgentIds: params.allowedAgentIds,
      dependencies: params.dependencies || [],
      blockedBy: [],
      artifacts: [],
      createdBy: 'pm',
    });

    // If parent task exists, add this as child
    if (params.parentTaskId) {
      await this.tasksRepo.addChildTask(params.parentTaskId, task._id as Types.ObjectId);
    }

    // Log event
    await this.eventsRepo.create({
      collectiveId: params.collectiveId,
      type: EventType.TASK_CREATED,
      actorId: 'pm',
      actorType: ActorType.PM,
      targetId: (task._id as Types.ObjectId).toString(),
      targetType: TargetType.TASK,
      description: `PM created task: ${params.title}`,
      metadata: { level: params.level, category: params.category },
    });

    return task._id as Types.ObjectId;
  }

  /**
   * Update an existing task
   */
  async updateTask(params: {
    taskId: Types.ObjectId;
    updates: {
      title?: string;
      description?: string;
      allowedAgentIds?: string[];
      state?: TaskState;
    };
  }): Promise<boolean> {
    const task = await this.tasksRepo.updateState(params.taskId, params.updates.state || TaskState.UNASSIGNED, {
      title: params.updates.title,
      description: params.updates.description,
      allowedAgentIds: params.updates.allowedAgentIds,
    });

    return task !== null;
  }

  /**
   * Assign task to specific agent
   */
  async assignTask(params: {
    collectiveId: Types.ObjectId;
    taskId: Types.ObjectId;
    agentId: string;
    reason?: string;
  }): Promise<boolean> {
    const task = await this.tasksRepo.assignTask(params.taskId, params.agentId);

    if (task) {
      await this.eventsRepo.create({
        collectiveId: params.collectiveId,
        type: EventType.TASK_ASSIGNED,
        actorId: 'pm',
        actorType: ActorType.PM,
        targetId: (task._id as Types.ObjectId).toString(),
        targetType: TargetType.TASK,
        description: `PM assigned task to ${params.agentId}${params.reason ? ': ' + params.reason : ''}`,
        metadata: { agentId: params.agentId, reason: params.reason },
      });

      return true;
    }

    return false;
  }

  /**
   * Cancel a task
   */
  async cancelTask(params: {
    collectiveId: Types.ObjectId;
    taskId: Types.ObjectId;
    reason: string;
  }): Promise<boolean> {
    const task = await this.tasksRepo.updateState(params.taskId, TaskState.CANCELLED, {
      output: `Cancelled by PM: ${params.reason}`,
    });

    if (task) {
      await this.eventsRepo.create({
        collectiveId: params.collectiveId,
        type: EventType.TASK_CANCELLED,
        actorId: 'pm',
        actorType: ActorType.PM,
        targetId: (task._id as Types.ObjectId).toString(),
        targetType: TargetType.TASK,
        description: `PM cancelled task: ${params.reason}`,
        metadata: { reason: params.reason },
      });

      return true;
    }

    return false;
  }

  /**
   * Reassign task from one agent to another
   */
  async reassignTask(params: {
    collectiveId: Types.ObjectId;
    taskId: Types.ObjectId;
    fromAgentId: string;
    toAgentId: string;
    reason: string;
  }): Promise<boolean> {
    const task = await this.tasksRepo.updateState(params.taskId, TaskState.ASSIGNED, {
      assignedAgentId: params.toAgentId,
    });

    if (task) {
      await this.eventsRepo.create({
        collectiveId: params.collectiveId,
        type: EventType.TASK_ASSIGNED,
        actorId: 'pm',
        actorType: ActorType.PM,
        targetId: (task._id as Types.ObjectId).toString(),
        targetType: TargetType.TASK,
        description: `PM reassigned task from ${params.fromAgentId} to ${params.toAgentId}: ${params.reason}`,
        metadata: {
          fromAgentId: params.fromAgentId,
          toAgentId: params.toAgentId,
          reason: params.reason,
        },
      });

      return true;
    }

    return false;
  }

  /**
   * View agent status
   */
  async viewAgentStatus(
    collectiveId: Types.ObjectId,
    agentId: string,
  ): Promise<{
    agentId: string;
    currentTasks: any[];
    messageQueueCount: number;
  }> {
    const tasks = await this.tasksRepo.findByAssignedAgent(collectiveId, agentId);
    const messages = await this.messagesRepo.findPendingForAgent(collectiveId, agentId);

    return {
      agentId,
      currentTasks: tasks.map((t) => ({
        id: (t._id as Types.ObjectId).toString(),
        title: t.title,
        state: t.state,
        level: t.level,
      })),
      messageQueueCount: messages.length,
    };
  }

  /**
   * Send directive to agent (adds to their message queue)
   */
  async sendDirective(params: {
    collectiveId: Types.ObjectId;
    agentId: string;
    taskId: Types.ObjectId;
    directive: string;
    priority: 'critical' | 'high' | 'normal';
  }): Promise<boolean> {
    const priorityMap = {
      critical: MessagePriority.CRITICAL,
      high: MessagePriority.HIGH,
      normal: MessagePriority.NORMAL,
    };

    const message = await this.messagesRepo.create({
      collectiveId: params.collectiveId,
      targetAgentId: params.agentId,
      sourceAgentId: 'pm',
      priority: priorityMap[params.priority],
      type: MessageType.PM_DIRECTIVE,
      conversationId: `pm-directive-${Date.now()}`,
      taskId: params.taskId,
      message: params.directive,
    });

    await this.eventsRepo.create({
      collectiveId: params.collectiveId,
      type: EventType.PM_DIRECTIVE,
      actorId: 'pm',
      actorType: ActorType.PM,
      targetId: params.agentId,
      targetType: TargetType.AGENT,
      description: `PM sent directive to ${params.agentId}`,
      metadata: { priority: params.priority, directive: params.directive },
    });

    return message !== null;
  }

  /**
   * Broadcast message to multiple agents
   */
  async broadcastMessage(params: {
    collectiveId: Types.ObjectId;
    targetAgentIds: string[];
    message: string;
    priority: 'normal' | 'low';
  }): Promise<boolean> {
    const priorityMap = {
      normal: MessagePriority.NORMAL,
      low: MessagePriority.LOW,
    };

    const conversationId = `pm-broadcast-${Date.now()}`;

    for (const agentId of params.targetAgentIds) {
      await this.messagesRepo.create({
        collectiveId: params.collectiveId,
        targetAgentId: agentId,
        sourceAgentId: 'pm',
        priority: priorityMap[params.priority],
        type: MessageType.INFO_REQUEST,
        conversationId,
        taskId: new Types.ObjectId(), // Dummy task ID for broadcast
        message: params.message,
      });
    }

    return true;
  }

  /**
   * Escalate to human
   */
  async escalateToHuman(params: {
    collectiveId: Types.ObjectId;
    severity: 'low' | 'medium' | 'high' | 'critical';
    subject: string;
    context: string;
    taskId?: Types.ObjectId;
    agentId?: string;
  }): Promise<boolean> {
    await this.eventsRepo.create({
      collectiveId: params.collectiveId,
      type: EventType.USER_INTERVENTION,
      actorId: 'pm',
      actorType: ActorType.PM,
      targetId: params.taskId?.toString() || params.agentId || 'collective',
      targetType: params.taskId ? TargetType.TASK : params.agentId ? TargetType.AGENT : TargetType.COLLECTIVE,
      description: `[${params.severity.toUpperCase()}] ${params.subject}: ${params.context}`,
      metadata: {
        severity: params.severity,
        subject: params.subject,
        context: params.context,
      },
    });

    return true;
  }

  /**
   * Retry task with hints
   */
  async retryTaskWithHints(params: {
    collectiveId: Types.ObjectId;
    taskId: Types.ObjectId;
    agentId: string;
    hints: string;
    retryStrategy: 'same_approach' | 'different_approach' | 'simplified';
  }): Promise<boolean> {
    // Reset task to assigned state
    await this.tasksRepo.updateState(params.taskId, TaskState.ASSIGNED, {
      errorInfo: undefined,
      failedAt: undefined,
    });

    // Send hints as PM directive
    await this.sendDirective({
      collectiveId: params.collectiveId,
      agentId: params.agentId,
      taskId: params.taskId,
      directive: `Retry with ${params.retryStrategy} strategy. Hints: ${params.hints}`,
      priority: 'high',
    });

    return true;
  }
}
