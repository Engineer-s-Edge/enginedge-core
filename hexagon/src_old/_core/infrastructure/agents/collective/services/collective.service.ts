import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CollectivesRepository } from '../repositories/collectives.repository';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { CollectiveArtifactsRepository } from '../repositories/collective-artifacts.repository';
import { CollectiveConversationsRepository } from '../repositories/collective-conversations.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { PMToolsService } from './pm-tools.service';
import { DeadlockDetectionService } from './deadlock-detection.service';
import { TaskAssignmentService } from './task-assignment.service';
import { CollectiveRuntimeService } from '../runtime/collective-runtime.service';
import { CollectiveStatus } from '../entities/collective.entity';
import { TaskLevel, TaskCategory } from '../entities/collective-task.entity';
import { EventType, ActorType } from '../entities/collective-event.entity';
import { CreateCollectiveDto } from '@features/assistants/collective/dto/collective.dto';
import { CreateTaskDto } from '@features/assistants/collective/dto/task.dto';

/**
 * Collective Service
 * Main orchestration service for collective agent system
 */
@Injectable()
export class CollectiveService {
  private readonly logger = new Logger(CollectiveService.name);

  constructor(
    private readonly collectivesRepo: CollectivesRepository,
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly messagesRepo: CollectiveMessagesRepository,
    private readonly artifactsRepo: CollectiveArtifactsRepository,
    private readonly conversationsRepo: CollectiveConversationsRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
    private readonly pmTools: PMToolsService,
    private readonly deadlockDetection: DeadlockDetectionService,
    private readonly taskAssignment: TaskAssignmentService,
    private readonly runtime: CollectiveRuntimeService,
  ) {}

  /**
   * Create a new collective
   */
  async createCollective(
    userId: Types.ObjectId,
    dto: CreateCollectiveDto,
  ): Promise<any> {
    this.logger.log(`Creating collective: ${dto.name}`);

    const collective = await this.collectivesRepo.create({
      name: dto.name,
      description: dto.description,
      vision: dto.vision,
      userId,
      agents: dto.agents as any,
      pmAgent: dto.pmAgent as any,
      status: CollectiveStatus.INITIALIZING,
    });

    // Create Level 0 Vision task
    await this.pmTools.createTask({
      collectiveId: collective._id as Types.ObjectId,
      level: TaskLevel.VISION,
      title: dto.name,
      description: dto.vision,
      category: TaskCategory.VISION,
      allowedAgentIds: ['pm'], // PM will decompose this
    });

    // Log creation event
    await this.eventsRepo.create({
      collectiveId: collective._id as Types.ObjectId,
      type: EventType.COLLECTIVE_STARTED,
      actorId: userId.toString(),
      actorType: ActorType.USER,
      description: `Collective created: ${dto.name}`,
      metadata: {
        agentCount: dto.agents.length,
        vision: dto.vision,
      },
    });

    return this.mapCollectiveToResponse(collective);
  }

  /**
   * Start a collective
   */
  async startCollective(collectiveId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);
    const collective = await this.collectivesRepo.findById(id);

    if (!collective) {
      throw new NotFoundException('Collective not found');
    }

    await this.collectivesRepo.updateStatus(id, CollectiveStatus.RUNNING, {
      startedAt: new Date(),
    });

    await this.eventsRepo.create({
      collectiveId: id,
      type: EventType.COLLECTIVE_STARTED,
      actorId: collective.userId.toString(),
      actorType: ActorType.USER,
      description: 'Collective started',
    });

    this.logger.log(`Started collective: ${collective.name}`);

    // Start runtime (PM main loop and agent execution)
    await this.runtime.startCollective(collectiveId);

    return { message: 'Collective started successfully' };
  }

  /**
   * Pause a collective
   */
  async pauseCollective(collectiveId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);

    await this.collectivesRepo.updateStatus(id, CollectiveStatus.PAUSED);

    await this.eventsRepo.create({
      collectiveId: id,
      type: EventType.COLLECTIVE_PAUSED,
      actorId: 'user',
      actorType: ActorType.USER,
      description: 'Collective paused by user',
    });

    // Pause runtime
    await this.runtime.pauseCollective(collectiveId);

    this.logger.log(`Paused collective: ${collectiveId}`);

    return { message: 'Collective paused successfully' };
  }

  /**
   * Resume a collective
   */
  async resumeCollective(collectiveId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);

    await this.collectivesRepo.updateStatus(id, CollectiveStatus.RUNNING);

    await this.eventsRepo.create({
      collectiveId: id,
      type: EventType.COLLECTIVE_RESUMED,
      actorId: 'user',
      actorType: ActorType.USER,
      description: 'Collective resumed by user',
    });

    // Resume runtime
    await this.runtime.resumeCollective(collectiveId);

    this.logger.log(`Resumed collective: ${collectiveId}`);

    return { message: 'Collective resumed successfully' };
  }

  /**
   * Get collective by ID
   */
  async getCollectiveById(collectiveId: string): Promise<any> {
    const collective = await this.collectivesRepo.findById(collectiveId);

    if (!collective) {
      throw new NotFoundException('Collective not found');
    }

    return this.mapCollectiveToResponse(collective);
  }

  /**
   * Get user's collectives
   */
  async getUserCollectives(userId: string): Promise<any[]> {
    const collectives = await this.collectivesRepo.findByUserId(userId);
    return collectives.map((c) => this.mapCollectiveToResponse(c));
  }

  /**
   * Get collective tasks
   */
  async getCollectiveTasks(collectiveId: string): Promise<any[]> {
    const id = new Types.ObjectId(collectiveId);
    const tasks = await this.tasksRepo.findByCollectiveId(id);

    return tasks.map((task) => ({
      id: (task._id as Types.ObjectId).toString(),
      collectiveId: task.collectiveId.toString(),
      level: task.level,
      parentTaskId: task.parentTaskId?.toString(),
      childTaskIds: task.childTaskIds.map((c: any) => c.toString()),
      title: task.title,
      description: task.description,
      category: task.category,
      state: task.state,
      assignedAgentId: task.assignedAgentId,
      allowedAgentIds: task.allowedAgentIds,
      dependencies: task.dependencies.map((d: any) => d.toString()),
      blockedBy: task.blockedBy.map((b: any) => b.toString()),
      conversationId: task.conversationId,
      output: task.output,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  }

  /**
   * Create a task (manual user creation or PM tool call)
   */
  async createTask(dto: CreateTaskDto): Promise<any> {
    const collectiveId = new Types.ObjectId(dto.collectiveId);

    const taskId = await this.pmTools.createTask({
      collectiveId,
      level: dto.level,
      parentTaskId: dto.parentTaskId ? new Types.ObjectId(dto.parentTaskId) : undefined,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      allowedAgentIds: dto.allowedAgentIds,
      dependencies: dto.dependencies?.map((d: string) => new Types.ObjectId(d)),
    });

    const task = await this.tasksRepo.findById(taskId);

    return {
      id: (task?._id as Types.ObjectId | undefined)?.toString(),
      title: task?.title,
      state: task?.state,
    };
  }

  /**
   * Get task hierarchy (tree structure)
   */
  async getTaskHierarchy(collectiveId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);
    const tasks = await this.tasksRepo.findByCollectiveId(id);

    // Build tree structure
    const taskMap = new Map();
    tasks.forEach((task) => {
      taskMap.set((task._id as Types.ObjectId).toString(), {
        id: (task._id as Types.ObjectId).toString(),
        level: task.level,
        title: task.title,
        state: task.state,
        category: task.category,
        assignedAgentId: task.assignedAgentId,
        children: [],
      });
    });

    const roots: any[] = [];

    tasks.forEach((task) => {
      const node = taskMap.get((task._id as Types.ObjectId).toString());

      if (task.parentTaskId) {
        const parent = taskMap.get(task.parentTaskId.toString());
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Get collective events (audit log)
   */
  async getCollectiveEvents(
    collectiveId: string,
    limit = 100,
  ): Promise<any[]> {
    const id = new Types.ObjectId(collectiveId);
    const events = await this.eventsRepo.findByCollectiveId(id, limit);

    return events.map((event) => ({
      id: (event._id as Types.ObjectId).toString(),
      type: event.type,
      actorId: event.actorId,
      actorType: event.actorType,
      targetId: event.targetId,
      targetType: event.targetType,
      description: event.description,
      metadata: event.metadata,
      timestamp: event.timestamp,
    }));
  }

  /**
   * Detect deadlocks in collective
   */
  async detectDeadlocks(collectiveId: string): Promise<any[]> {
    const id = new Types.ObjectId(collectiveId);
    const deadlocks = await this.deadlockDetection.detectDeadlocks(id);

    return deadlocks.map((d) => ({
      id: d.id,
      cycle: d.cycle,
      involvedAgents: d.involvedAgents,
      detectedAt: d.detectedAt,
    }));
  }

  /**
   * Get agent status
   */
  async getAgentStatus(collectiveId: string, agentId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);
    return this.pmTools.viewAgentStatus(id, agentId);
  }

  /**
   * Delete collective (cleanup)
   */
  async deleteCollective(collectiveId: string): Promise<any> {
    const id = new Types.ObjectId(collectiveId);

    // Delete all related data
    await this.tasksRepo.deleteByCollectiveId(id);
    await this.messagesRepo.deleteByCollectiveId(id);
    await this.artifactsRepo.deleteByCollectiveId(id);
    await this.conversationsRepo.deleteByCollectiveId(id);
    await this.eventsRepo.deleteByCollectiveId(id);
    await this.collectivesRepo.delete(id);

    this.logger.log(`Deleted collective: ${collectiveId}`);

    return { message: 'Collective deleted successfully' };
  }

  /**
   * Map collective document to response DTO
   */
  private mapCollectiveToResponse(collective: any): any {
    return {
      id: collective._id.toString(),
      name: collective.name,
      description: collective.description,
      vision: collective.vision,
      userId: collective.userId.toString(),
      status: collective.status,
      agents: collective.agents,
      pmAgent: collective.pmAgent,
      createdAt: collective.createdAt,
      updatedAt: collective.updatedAt,
      startedAt: collective.startedAt,
      completedAt: collective.completedAt,
    };
  }
}
