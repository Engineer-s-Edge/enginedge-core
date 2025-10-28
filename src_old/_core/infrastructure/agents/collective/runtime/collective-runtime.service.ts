import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collective, CollectiveDocument, AgentStatus, CollectiveStatus } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskDocument } from '../entities/collective-task.entity';
import { CollectiveMessage, CollectiveMessageDocument, MessageType, MessagePriority, MessageStatus } from '../entities/collective-message.entity';
import { CollectiveConversation, CollectiveConversationDocument, ConversationStatus } from '../entities/collective-conversation.entity';
import { CollectiveEvent, CollectiveEventDocument, EventType, ActorType } from '../entities/collective-event.entity';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { CollectiveConversationsRepository } from '../repositories/collective-conversations.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { TaskAssignmentService } from '../services/task-assignment.service';
import { DeadlockDetectionService } from '../services/deadlock-detection.service';
import { AgentExecutor } from './agent-executor.service';

/**
 * CollectiveRuntimeService
 * 
 * Orchestrates the execution of a Collective, managing the PM agent's main loop
 * and coordinating the lifecycle of all worker agents.
 * 
 * Responsibilities:
 * - Start/stop collective execution
 * - Run PM agent main loop (priority-based event processing)
 * - Monitor agent health and task progress
 * - Trigger deadlock detection
 * - Manage collective pause/resume
 * - Emit lifecycle events
 * 
 * PM Main Loop:
 * 1. Process high-priority messages (CRITICAL → HIGH)
 * 2. Assign tasks to idle agents (if available)
 * 3. Check for deadlocks periodically
 * 4. Process normal-priority messages
 * 5. Handle task decomposition (background)
 * 6. Process low-priority messages
 * 7. Sleep interval, then repeat
 */
@Injectable()
export class CollectiveRuntimeService {
  private readonly logger = new Logger(CollectiveRuntimeService.name);
  
  // Active runtime loops (collectiveId -> interval handle)
  private readonly runtimeLoops = new Map<string, NodeJS.Timeout>();
  
  // PM loop configuration
  private readonly PM_LOOP_INTERVAL_MS = 1000; // 1 second
  private readonly DEADLOCK_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_TASKS_PER_ASSIGNMENT_CYCLE = 5; // Prevent overwhelming agents
  
  // Last deadlock check timestamps
  private readonly lastDeadlockCheck = new Map<string, number>();

  constructor(
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(CollectiveMessage.name) private messageModel: Model<CollectiveMessageDocument>,
    @InjectModel(CollectiveConversation.name) private conversationModel: Model<CollectiveConversationDocument>,
    @InjectModel(CollectiveEvent.name) private eventModel: Model<CollectiveEventDocument>,
    private readonly tasksRepository: CollectiveTasksRepository,
    private readonly messagesRepository: CollectiveMessagesRepository,
    private readonly conversationsRepository: CollectiveConversationsRepository,
    private readonly eventsRepository: CollectiveEventsRepository,
    private readonly taskAssignmentService: TaskAssignmentService,
    private readonly deadlockDetectionService: DeadlockDetectionService,
    private readonly agentExecutor: AgentExecutor,
  ) {}

  /**
   * Start the runtime for a collective.
   * Initializes PM agent and starts the main event loop.
   */
  async startCollective(collectiveId: string): Promise<void> {
    // Check if already running
    if (this.runtimeLoops.has(collectiveId)) {
      this.logger.warn(`Collective ${collectiveId} runtime already running`);
      return;
    }

    // Verify collective exists and is in correct state
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error(`Collective ${collectiveId} not found`);
    }

    if (collective.status !== 'running') {
      throw new Error(`Collective ${collectiveId} is not in running state (current: ${collective.status})`);
    }

    this.logger.log(`Starting collective runtime for ${collectiveId}`);

    // Initialize PM agent conversation if not exists
    await this.initializePMConversation(collectiveId);

    // Log runtime start event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.COLLECTIVE_STARTED,
      actorId: 'system',
      actorType: ActorType.SYSTEM,
      timestamp: new Date(),
      description: 'Collective runtime started',
      metadata: {
        pmLoopInterval: this.PM_LOOP_INTERVAL_MS,
        deadlockCheckInterval: this.DEADLOCK_CHECK_INTERVAL_MS,
      },
    });

    // Start PM main loop
    const loopHandle = setInterval(
      () => this.runPMMainLoop(collectiveId),
      this.PM_LOOP_INTERVAL_MS,
    );

    this.runtimeLoops.set(collectiveId, loopHandle);
    this.logger.log(`Collective ${collectiveId} runtime started successfully`);
  }

  /**
   * Stop the runtime for a collective.
   * Gracefully shuts down PM agent and worker agents.
   */
  async stopCollective(collectiveId: string): Promise<void> {
    const loopHandle = this.runtimeLoops.get(collectiveId);
    if (!loopHandle) {
      this.logger.warn(`Collective ${collectiveId} runtime not running`);
      return;
    }

    this.logger.log(`Stopping collective runtime for ${collectiveId}`);

    // Stop PM main loop
    clearInterval(loopHandle);
    this.runtimeLoops.delete(collectiveId);
    this.lastDeadlockCheck.delete(collectiveId);

    // Stop all agent executors
    await this.agentExecutor.stopAllAgents(collectiveId);

    // Log runtime stop event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.COLLECTIVE_COMPLETED,
      actorId: 'system',
      actorType: ActorType.SYSTEM,
      timestamp: new Date(),
      description: 'Collective runtime stopped',
      metadata: {},
    });

    this.logger.log(`Collective ${collectiveId} runtime stopped successfully`);
  }

  /**
   * Pause a running collective.
   * Freezes all agent activity but keeps runtime loop alive.
   */
  async pauseCollective(collectiveId: string): Promise<void> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error(`Collective ${collectiveId} not found`);
    }

    // Pause all agents
    for (const agent of collective.agents) {
      agent.status = AgentStatus.IDLE;
      agent.currentTaskId = undefined;
    }

    await collective.save();

    // Log pause event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.COLLECTIVE_PAUSED,
      actorId: 'pm_agent',
      actorType: ActorType.AGENT,
      timestamp: new Date(),
      description: 'Collective paused',
      metadata: {},
    });

    this.logger.log(`Collective ${collectiveId} paused`);
  }

  /**
   * Resume a paused collective.
   * Resumes agent activity and task assignment.
   */
  async resumeCollective(collectiveId: string): Promise<void> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error(`Collective ${collectiveId} not found`);
    }

    // Log resume event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.COLLECTIVE_RESUMED,
      actorId: 'pm_agent',
      actorType: ActorType.AGENT,
      timestamp: new Date(),
      description: 'Collective resumed',
      metadata: {},
    });

    this.logger.log(`Collective ${collectiveId} resumed`);
  }

  /**
   * PM Agent Main Loop
   * 
   * Priority-based event processing:
   * 1. CRITICAL/HIGH priority messages → immediate processing
   * 2. Task assignment → assign to idle agents
   * 3. Deadlock detection → periodic check
   * 4. NORMAL priority messages → process batch
   * 5. Task decomposition → background processing
   * 6. LOW/BACKGROUND messages → process if time permits
   */
  private async runPMMainLoop(collectiveId: string): Promise<void> {
    try {
      const collective = await this.collectiveModel.findById(collectiveId);
      if (!collective) {
        this.logger.error(`Collective ${collectiveId} not found, stopping runtime`);
        await this.stopCollective(collectiveId);
        return;
      }

      // Skip if paused
      if (collective.status === 'paused') {
        return;
      }

      // Skip if completed or failed
      if (collective.status === 'completed' || collective.status === 'failed') {
        this.logger.log(`Collective ${collectiveId} finished (${collective.status}), stopping runtime`);
        await this.stopCollective(collectiveId);
        return;
      }

      // Step 1: Process CRITICAL and HIGH priority messages
      await this.processHighPriorityMessages(collectiveId);

      // Step 2: Assign tasks to idle agents
      await this.assignTasksToIdleAgents(collectiveId);

      // Step 3: Periodic deadlock detection
      await this.checkForDeadlocks(collectiveId);

      // Step 4: Process NORMAL priority messages
      await this.processNormalPriorityMessages(collectiveId);

      // Step 5: Task decomposition (background)
      await this.performTaskDecomposition(collectiveId);

      // Step 6: Process LOW and BACKGROUND priority messages
      await this.processLowPriorityMessages(collectiveId);

      // Step 7: Check if all tasks completed
      await this.checkCollectiveCompletion(collectiveId);

    } catch (error) {
      this.logger.error(`Error in PM main loop for collective ${collectiveId}:`, error);
      
      const err = error as Error;
      // Log error event
      await this.eventsRepository.create({
        collectiveId: new Types.ObjectId(collectiveId),
        type: EventType.TASK_FAILED,
        actorId: 'pm_agent',
        actorType: ActorType.AGENT,
        timestamp: new Date(),
        description: 'PM loop error',
        metadata: {
          error: err.message,
          stack: err.stack,
        },
      });
    }
  }

  /**
   * Initialize PM agent conversation.
   * Creates initial conversation for PM agent to interact with user.
   */
  private async initializePMConversation(collectiveId: string): Promise<void> {
    const existing = await this.conversationModel.findOne({
      collectiveId: new Types.ObjectId(collectiveId),
      agentId: 'pm_agent',
      taskId: undefined, // PM conversation is not tied to specific task
    });

    if (existing) {
      return; // Already initialized
    }

    await this.conversationsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      agentId: 'pm_agent',
      taskId: undefined,
      messages: [
        {
          role: 'system',
          content: 'PM Agent initialized. Ready to coordinate collective execution.',
          timestamp: new Date(),
        },
      ],
      summary: 'PM agent coordination conversation',
      status: ConversationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.log(`PM conversation initialized for collective ${collectiveId}`);
  }

  /**
   * Process CRITICAL and HIGH priority messages.
   */
  private async processHighPriorityMessages(collectiveId: string): Promise<void> {
    const messages = await this.messagesRepository.findPendingByPriority(
      collectiveId,
      [MessagePriority.CRITICAL, MessagePriority.HIGH],
      10, // Process up to 10 high-priority messages per cycle
    );

    for (const message of messages) {
      await this.processMessage(collectiveId, message);
    }
  }

  /**
   * Assign tasks to idle agents.
   */
  private async assignTasksToIdleAgents(collectiveId: string): Promise<void> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) return;

    // Find idle agents (not paused, not working)
    const idleAgents = collective.agents.filter(
      agent => agent.status === AgentStatus.IDLE && agent.id !== 'pm_agent',
    );

    if (idleAgents.length === 0) {
      return; // No idle agents
    }

    // Assign tasks (up to MAX_TASKS_PER_ASSIGNMENT_CYCLE)
    let assignedCount = 0;
    for (const agent of idleAgents) {
      if (assignedCount >= this.MAX_TASKS_PER_ASSIGNMENT_CYCLE) {
        break;
      }

      const wasAssigned = await this.taskAssignmentService.assignSingleTask(
        new Types.ObjectId(collectiveId),
        agent.id,
      );

      if (wasAssigned) {
        assignedCount++;
        
        // Note: In full implementation, we would get the actual task ID
        // and start agent executor. For now, just log the assignment.
        this.logger.debug(`Task assigned to agent ${agent.id}`);
      }
    }

    if (assignedCount > 0) {
      this.logger.log(`Assigned ${assignedCount} tasks to idle agents in collective ${collectiveId}`);
    }
  }

  /**
   * Periodic deadlock detection.
   */
  private async checkForDeadlocks(collectiveId: string): Promise<void> {
    const now = Date.now();
    const lastCheck = this.lastDeadlockCheck.get(collectiveId) || 0;

    if (now - lastCheck < this.DEADLOCK_CHECK_INTERVAL_MS) {
      return; // Not time yet
    }

    this.lastDeadlockCheck.set(collectiveId, now);

    const deadlocks = await this.deadlockDetectionService.detectDeadlocks(new Types.ObjectId(collectiveId));

    if (deadlocks.length > 0) {
      this.logger.warn(`Detected ${deadlocks.length} deadlocks in collective ${collectiveId}`);

      // Log deadlock event
      await this.eventsRepository.create({
        collectiveId: new Types.ObjectId(collectiveId),
        type: EventType.DEADLOCK_DETECTED,
        actorId: 'pm_agent',
        actorType: ActorType.AGENT,
        timestamp: new Date(),
        description: `Detected ${deadlocks.length} deadlocks`,
        metadata: {
          deadlockCount: deadlocks.length,
          cycles: deadlocks.map(d => d.cycle),
        },
      });

      // TODO Phase 4: Implement deadlock resolution
      // For now, just log and create message for PM
      await this.messagesRepository.create({
        collectiveId: new Types.ObjectId(collectiveId),
        sourceAgentId: 'system',
        targetAgentId: 'pm_agent',
        type: MessageType.PM_DIRECTIVE,
        priority: MessagePriority.CRITICAL,
        conversationId: 'pm_conversation',
        taskId: new Types.ObjectId(), // Placeholder - no specific task
        message: `Deadlock detected involving ${deadlocks.length} cycle(s). Manual intervention may be required.`,
        metadata: { deadlocks },
        status: MessageStatus.PENDING,
        createdAt: new Date(),
      });
    }
  }

  /**
   * Process NORMAL priority messages.
   */
  private async processNormalPriorityMessages(collectiveId: string): Promise<void> {
    const messages = await this.messagesRepository.findPendingByPriority(
      collectiveId,
      [MessagePriority.NORMAL],
      5, // Process up to 5 normal messages per cycle
    );

    for (const message of messages) {
      await this.processMessage(collectiveId, message);
    }
  }

  /**
   * Perform task decomposition in background.
   * PM agent can break down high-level tasks into subtasks.
   */
  private async performTaskDecomposition(collectiveId: string): Promise<void> {
    // Find tasks that need decomposition (VISION, PORTFOLIO, PROGRAM, EPIC levels)
    // that are in TODO state and have no children yet
    const tasksNeedingDecomposition = await this.taskModel.find({
      collectiveId,
      level: { $in: ['VISION', 'PORTFOLIO', 'PROGRAM', 'EPIC'] },
      state: 'TODO',
      $or: [
        { childTaskIds: { $exists: false } },
        { childTaskIds: { $size: 0 } },
      ],
    }).limit(1); // Decompose one task per cycle

    if (tasksNeedingDecomposition.length === 0) {
      return;
    }

    const task = tasksNeedingDecomposition[0];
    const taskId = task._id as Types.ObjectId;

    // TODO Phase 2 continuation: Implement LLM-based task decomposition
    // For now, just log that decomposition is needed
    this.logger.debug(`Task ${taskId} (${task.level}) needs decomposition`);
    
    // Create message for PM to handle decomposition
    await this.messagesRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      sourceAgentId: 'system',
      targetAgentId: 'pm_agent',
      type: MessageType.PM_DIRECTIVE,
      priority: MessagePriority.NORMAL,
      conversationId: 'pm_conversation',
      taskId: taskId,
      message: `Task "${task.title}" (${task.level}) needs to be decomposed into subtasks.`,
      metadata: { taskId: taskId.toString() },
      status: MessageStatus.PENDING,
      createdAt: new Date(),
    });
  }

  /**
   * Process LOW and BACKGROUND priority messages.
   */
  private async processLowPriorityMessages(collectiveId: string): Promise<void> {
    const messages = await this.messagesRepository.findPendingByPriority(
      collectiveId,
      [MessagePriority.LOW, MessagePriority.BACKGROUND],
      3, // Process up to 3 low-priority messages per cycle
    );

    for (const message of messages) {
      await this.processMessage(collectiveId, message);
    }
  }

  /**
   * Process a single message.
   * Routes message to appropriate handler based on type.
   */
  private async processMessage(
    collectiveId: string,
    message: CollectiveMessageDocument,
  ): Promise<void> {
    try {
      this.logger.debug(`Processing message ${message._id} (${message.type}, ${message.priority})`);

      // Mark as processing
      message.status = MessageStatus.IN_PROGRESS;
      await message.save();

      // Route based on message type
      // Note: These message types need to be mapped to actual MessageType enum values
      // Current MessageType enum: DELEGATION, HELP_REQUEST, INFO_REQUEST, PM_DIRECTIVE, STATUS_UPDATE, RESULT, HUMAN_MESSAGE
      switch (message.type) {
        case MessageType.STATUS_UPDATE:
          await this.handleTaskUpdateMessage(collectiveId, message);
          break;
        
        case MessageType.HELP_REQUEST:
          await this.handleQuestionMessage(collectiveId, message);
          break;
        
        case MessageType.PM_DIRECTIVE:
          await this.handleDirectiveMessage(collectiveId, message);
          break;
        
        case MessageType.DELEGATION:
          await this.handleBroadcastMessage(collectiveId, message);
          break;
        
        default:
          this.logger.warn(`Unknown or unhandled message type: ${message.type}`);
      }

      // Mark as completed
      message.status = MessageStatus.COMPLETED;
      await message.save();

    } catch (error) {
      this.logger.error(`Error processing message ${message._id}:`, error);
      message.status = MessageStatus.EXPIRED;
      await message.save();
    }
  }

  /**
   * Handle task update messages (agent reporting progress).
   */
  private async handleTaskUpdateMessage(
    _collectiveId: string,
    message: CollectiveMessageDocument,
  ): Promise<void> {
    // Log the task update - in a full implementation, this would update task progress
    this.logger.debug(`Task update from ${message.sourceAgentId}: ${message.message}`);
    
    // TODO: Add to PM conversation or update task state based on the update
  }

  /**
   * Handle question messages (agent asking PM for help).
   */
  private async handleQuestionMessage(
    _collectiveId: string,
    message: CollectiveMessageDocument,
  ): Promise<void> {
    // TODO Phase 2 continuation: Invoke PM agent to answer question
    this.logger.debug(`PM needs to answer question from ${message.sourceAgentId}: ${message.message}`);
  }

  /**
   * Handle directive messages (PM instructing agent).
   */
  private async handleDirectiveMessage(
    _collectiveId: string,
    message: CollectiveMessageDocument,
  ): Promise<void> {
    // Forward directive to target agent
    this.logger.debug(`PM directive to ${message.targetAgentId}: ${message.message}`);
    
    // TODO: In full implementation, this would add the directive to the agent's task conversation
  }

  /**
   * Handle broadcast messages (PM broadcasting to all agents).
   */
  private async handleBroadcastMessage(
    _collectiveId: string,
    message: CollectiveMessageDocument,
  ): Promise<void> {
    // Log broadcast
    this.logger.debug(`Broadcast message: ${message.message}`);
  }

  /**
   * Check if collective has completed all tasks.
   */
  private async checkCollectiveCompletion(collectiveId: string): Promise<void> {
    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) return;

    // Count task states
    const taskCounts = await this.taskModel.aggregate([
      { $match: { collectiveId } },
      { $group: { _id: '$state', count: { $sum: 1 } } },
    ]);

    const stateMap = new Map(taskCounts.map(t => [t._id, t.count]));
    
    const totalTasks = Array.from(stateMap.values()).reduce((a, b) => a + b, 0);
    const completedTasks = stateMap.get('COMPLETED') || 0;
    const failedTasks = stateMap.get('FAILED') || 0;
    const cancelledTasks = stateMap.get('CANCELLED') || 0;

    // Check if all tasks are in terminal states
    const terminalTasks = completedTasks + failedTasks + cancelledTasks;

    if (terminalTasks === totalTasks && totalTasks > 0) {
      // Collective complete!
      collective.status = CollectiveStatus.COMPLETED;
      collective.completedAt = new Date();
      await collective.save();

      // Log completion event
      await this.eventsRepository.create({
        collectiveId: new Types.ObjectId(collectiveId),
        type: EventType.COLLECTIVE_COMPLETED,
        actorId: 'pm_agent',
        actorType: ActorType.AGENT,
        timestamp: new Date(),
        description: 'Collective execution completed',
        metadata: {
          totalTasks,
          completedTasks,
          failedTasks,
          cancelledTasks,
        },
      });

      this.logger.log(`Collective ${collectiveId} completed successfully`);

      // Runtime will stop on next loop iteration
    }
  }

  /**
   * Get runtime status for a collective.
   */
  isRunning(collectiveId: string): boolean {
    return this.runtimeLoops.has(collectiveId);
  }

  /**
   * Cleanup on module destroy.
   */
  onModuleDestroy() {
    this.logger.log('Shutting down all collective runtimes');
    for (const collectiveId of this.runtimeLoops.keys()) {
      this.stopCollective(collectiveId);
    }
  }
}
