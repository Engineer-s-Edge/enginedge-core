import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collective, CollectiveDocument, AgentStatus } from '../entities/collective.entity';
import { CollectiveTask, CollectiveTaskDocument, TaskState } from '../entities/collective-task.entity';
import { CollectiveConversation, CollectiveConversationDocument, ConversationStatus } from '../entities/collective-conversation.entity';
import { CollectiveEvent, CollectiveEventDocument, EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import { MessageType, MessagePriority, MessageStatus } from '../entities/collective-message.entity';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { CollectiveConversationsRepository } from '../repositories/collective-conversations.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { CollectiveMessagesRepository } from '../repositories/collective-messages.repository';
import { AgentService } from '../../core/agents/agent.service';

/**
 * AgentExecutorService
 * 
 * Manages the execution of individual worker agents within a Collective.
 * 
 * Responsibilities:
 * - Start agent execution for a specific task
 * - Create and manage conversation-per-task
 * - Invoke agent with proper context
 * - Handle agent responses and tool calls
 * - Update task state based on agent progress
 * - Handle agent failures and retries
 * - Stop agent execution gracefully
 * 
 * Agent Lifecycle:
 * 1. idle → Agent waiting for task assignment
 * 2. working → Agent actively executing task
 * 3. blocked → Agent waiting on dependency/blocker
 * 4. idle → Task completed, agent returns to pool
 * 
 * Conversation-per-Task:
 * - Each task gets its own conversation thread
 * - Conversation includes task context, dependencies, artifacts
 * - Agent tools can access/modify conversation
 * - Conversation summarized periodically to manage token count
 */
@Injectable()
export class AgentExecutor {
  private readonly logger = new Logger(AgentExecutor.name);
  
  // Active agent executions (agentId -> { collectiveId, taskId, abortController })
  private readonly activeExecutions = new Map<string, {
    collectiveId: string;
    taskId: string;
    abortController: AbortController;
  }>();

  constructor(
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(CollectiveConversation.name) private conversationModel: Model<CollectiveConversationDocument>,
    @InjectModel(CollectiveEvent.name) private eventModel: Model<CollectiveEventDocument>,
    private readonly tasksRepository: CollectiveTasksRepository,
    private readonly conversationsRepository: CollectiveConversationsRepository,
    private readonly eventsRepository: CollectiveEventsRepository,
    private readonly messagesRepository: CollectiveMessagesRepository,
    private readonly agentService: AgentService, // Core agent execution service
  ) {}

  /**
   * Start agent execution for a task.
   * Creates conversation, updates agent status, and invokes agent.
   */
  async startAgentExecution(
    collectiveId: string,
    agentId: string,
    taskId: string,
  ): Promise<void> {
    const executionKey = `${collectiveId}:${agentId}`;
    
    // Check if agent already executing
    if (this.activeExecutions.has(executionKey)) {
      this.logger.warn(`Agent ${agentId} already executing in collective ${collectiveId}`);
      return;
    }

    const collective = await this.collectiveModel.findById(collectiveId);
    const task = await this.taskModel.findById(taskId);

    if (!collective || !task) {
      throw new Error('Collective or task not found');
    }

    // Find agent config
    const agentConfig = collective.agents.find(a => a.id === agentId);
    if (!agentConfig) {
      throw new Error(`Agent ${agentId} not found in collective`);
    }

    this.logger.log(`Starting agent ${agentId} execution for task ${taskId}`);

    // Update agent status
    agentConfig.status = AgentStatus.WORKING;
    agentConfig.currentTaskId = taskId;
    await collective.save();

    // Create or resume conversation for this task
    const conversation = await this.getOrCreateConversation(collectiveId, agentId, taskId);

    // Update task state
    task.state = TaskState.IN_PROGRESS;
    task.startedAt = new Date();
    await task.save();

    // Log execution start event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.TASK_ASSIGNED,
      timestamp: new Date(),
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.TASK,
      targetId: taskId,
      description: `Agent ${agentId} started task ${task.title}`,
      metadata: {
        taskTitle: task.title,
        taskLevel: task.level,
      },
    });

    // Start agent execution (async)
    const abortController = new AbortController();
    this.activeExecutions.set(executionKey, { collectiveId, taskId, abortController });

    // Execute agent in background
    this.executeAgent(collectiveId, agentId, taskId, conversation, abortController.signal)
      .catch(error => {
        this.logger.error(`Agent ${agentId} execution failed for task ${taskId}:`, error);
      });
  }

  /**
   * Execute agent for a task.
   * Main agent execution loop with conversation management.
   */
  private async executeAgent(
    collectiveId: string,
    agentId: string,
    taskId: string,
    conversation: CollectiveConversationDocument,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      const collective = await this.collectiveModel.findById(collectiveId);
      if (!collective) {
        throw new Error('Collective not found');
      }

      const agentConfig = collective.agents.find(a => a.id === agentId);
      if (!agentConfig) {
        throw new Error('Agent config not found');
      }

      // Build initial context message if conversation is new
      if (conversation.messages.length <= 1) { // Only system message
        const _contextMessage = await this.buildTaskContext(collective, task);
        // Note: Simplified - proper implementation needs conversation message structure
        this.logger.debug(`Would add context message to conversation for task ${taskId}`);
      }

      // Main agent execution loop
      let iterations = 0;
      const MAX_ITERATIONS = 50; // Prevent infinite loops

      while (!signal.aborted && iterations < MAX_ITERATIONS) {
        iterations++;

        // Reload conversation
        const conv = await this.conversationModel.findById(conversation._id);
        if (!conv) break;

        // Reload task
        const currentTask = await this.taskModel.findById(taskId);
        if (!currentTask) break;

        // Check if task is completed or cancelled
        if (currentTask.state === TaskState.COMPLETED || currentTask.state === TaskState.CANCELLED) {
          this.logger.log(`Task ${taskId} finished (${currentTask.state}), stopping agent ${agentId}`);
          break;
        }

        // Check if task is blocked
        if (currentTask.state === TaskState.BLOCKED) {
          this.logger.log(`Task ${taskId} blocked, pausing agent ${agentId}`);
          await this.pauseAgentExecution(collectiveId, agentId, 'Task blocked');
          break;
        }

        // Invoke agent with conversation history
        const agentResponse = await this.invokeAgent(
          agentConfig,
          conv.messages,
          collectiveId,
          taskId,
        );

        // Add agent response to conversation
        // Note: Simplified - proper implementation needs conversation message structure
        this.logger.debug(`Agent ${agentId} responded for task ${taskId}: ${agentResponse.content?.substring(0, 100)}`);

        // Handle tool calls if present
        if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
          await this.handleToolCalls(collectiveId, agentId, taskId, agentResponse.toolCalls);
        }

        // Check if agent completed task
        if (agentResponse.taskCompleted) {
          await this.completeTask(collectiveId, agentId, taskId, agentResponse.result || 'Task completed');
          break;
        }

        // Check if agent needs help (escalation)
        if (agentResponse.needsHelp) {
          // Note: escalateToPM doesn't exist - using communication service would be proper approach
          this.logger.warn(`Agent ${agentId} needs help on task ${taskId}: ${agentResponse.helpMessage}`);
          await this.pauseAgentExecution(collectiveId, agentId, 'Escalated to PM');
          break;
        }

        // Summarize conversation if getting long
        if (conv.messages.length > 20) {
          await this.summarizeConversation(conversation);
        }

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (iterations >= MAX_ITERATIONS) {
        this.logger.warn(`Agent ${agentId} hit max iterations for task ${taskId}, stopping`);
        await this.pauseAgentExecution(collectiveId, agentId, 'Max iterations reached');
      }

    } catch (error) {
      this.logger.error(`Agent ${agentId} execution error for task ${taskId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Log error event
      await this.eventsRepository.create({
        collectiveId: new Types.ObjectId(collectiveId),
        type: EventType.TASK_FAILED,
        timestamp: new Date(),
        actorId: agentId,
        actorType: ActorType.AGENT,
        targetType: TargetType.TASK,
        targetId: taskId,
        description: `Agent ${agentId} execution error: ${errorMessage}`,
        metadata: {
          error: errorMessage,
          stack: errorStack,
        },
      });

      // Mark task as failed
      await this.failTask(collectiveId, agentId, taskId, errorMessage);

    } finally {
      // Cleanup
      const executionKey = `${collectiveId}:${agentId}`;
      this.activeExecutions.delete(executionKey);

      // Return agent to idle
      const collective = await this.collectiveModel.findById(collectiveId);
      if (collective) {
        const agentConfig = collective.agents.find(a => a.id === agentId);
        if (agentConfig) {
          agentConfig.status = AgentStatus.IDLE;
          agentConfig.currentTaskId = undefined;
          await collective.save();
        }
      }
    }
  }

  /**
   * Get or create conversation for agent-task pair.
   */
  private async getOrCreateConversation(
    collectiveId: string,
    agentId: string,
    taskId: string,
  ): Promise<CollectiveConversationDocument> {
    // Try to find existing conversation
    let conversation = await this.conversationModel.findOne({
      collectiveId: new Types.ObjectId(collectiveId),
      agentId,
      taskId: new Types.ObjectId(taskId),
    });

    if (conversation) {
      // Resume existing conversation
      conversation.status = ConversationStatus.ACTIVE;
      await conversation.save();
      return conversation;
    }

    // Create new conversation
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const newConversation = await this.conversationsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      agentId,
      taskId: new Types.ObjectId(taskId),
      messages: [
        {
          role: 'system',
          content: `You are working on task: "${task.title}". Your goal: ${task.description}`,
          timestamp: new Date(),
        },
      ],
      summary: `Conversation for task: ${task.title}`,
      status: ConversationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newConversation as CollectiveConversationDocument;
  }

  /**
   * Build task context message for agent.
   * Includes task details, dependencies, artifacts, etc.
   */
  private async buildTaskContext(
    collective: CollectiveDocument,
    task: CollectiveTaskDocument,
  ): Promise<string> {
    let context = `# Task: ${task.title}\n\n`;
    context += `**Level:** ${task.level}\n`;
    context += `**Description:** ${task.description}\n\n`;

    // Note: acceptanceCriteria property doesn't exist on CollectiveTask entity
    // Would need to be added to schema if required

    // Add dependency information
    if (task.dependencies && task.dependencies.length > 0) {
      context += `**Dependencies:**\n`;
      for (const depId of task.dependencies) {
        const depTask = await this.taskModel.findById(depId);
        if (depTask) {
          context += `- ${depTask.title} (${depTask.state})\n`;
        }
      }
      context += '\n';
    }

    // Note: blockers property doesn't exist on CollectiveTask entity
    // Would need to be added to schema if required

    // Add parent context if exists
    if (task.parentTaskId) {
      const parentTask = await this.taskModel.findById(task.parentTaskId);
      if (parentTask) {
        context += `**Parent Task:** ${parentTask.title}\n\n`;
      }
    }

    context += `**Instructions:**\n`;
    context += `- Work on this task step by step\n`;
    context += `- Use available tools to accomplish the goal\n`;
    context += `- Report progress regularly\n`;
    context += `- Ask for help if stuck (escalate to PM)\n`;
    context += `- Mark task complete when all acceptance criteria met\n`;

    return context;
  }

  /**
   * Invoke agent with conversation history.
   * Uses core AgentService to execute agent.
   */
  private async invokeAgent(
    agentConfig: any,
    messages: any[],
    collectiveId: string,
    taskId: string,
  ): Promise<{
    content: string;
    toolCalls?: any[];
    taskCompleted?: boolean;
    result?: string;
    needsHelp?: boolean;
    helpMessage?: string;
  }> {
    // TODO Phase 2 continuation: Integrate with AgentService
    // For now, return mock response
    
    this.logger.debug(`Invoking agent ${agentConfig.agentId} for task ${taskId}`);

    // Mock agent response (replace with actual AgentService call)
    return {
      content: `Working on task... (iteration ${messages.length})`,
      taskCompleted: false,
    };
  }

  /**
   * Handle tool calls from agent.
   */
  private async handleToolCalls(
    collectiveId: string,
    agentId: string,
    taskId: string,
    toolCalls: any[],
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      this.logger.debug(`Agent ${agentId} tool call: ${toolCall.name}`);
      
      // TODO Phase 2 continuation: Implement tool call handling
      // - File operations
      // - Artifact creation/update
      // - Message sending
      // - Task queries
      // etc.
    }
  }

  /**
   * Complete a task.
   */
  private async completeTask(
    collectiveId: string,
    agentId: string,
    taskId: string,
    result: string,
  ): Promise<void> {
    const task = await this.taskModel.findById(taskId);
    if (!task) return;

    task.state = TaskState.COMPLETED;
    task.completedAt = new Date();
    // Note: result property doesn't exist on CollectiveTask entity
    await task.save();

    // Log completion event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.TASK_COMPLETED,
      timestamp: new Date(),
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.TASK,
      targetId: taskId,
      description: `Task "${task.title}" completed by agent ${agentId}`,
      metadata: {
        taskTitle: task.title,
        result,
      },
    });

    // Send completion message to PM
    await this.messagesRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      sourceAgentId: agentId,
      targetAgentId: 'pm_agent',
      conversationId: 'pm_conversation',
      taskId: new Types.ObjectId(taskId),
      type: MessageType.STATUS_UPDATE,
      priority: MessagePriority.NORMAL,
      message: `Task "${task.title}" completed successfully.`,
      metadata: { result },
      status: MessageStatus.PENDING,
      createdAt: new Date(),
    });

    this.logger.log(`Task ${taskId} completed by agent ${agentId}`);
  }

  /**
   * Fail a task.
   */
  private async failTask(
    collectiveId: string,
    agentId: string,
    taskId: string,
    error: string,
  ): Promise<void> {
    const task = await this.taskModel.findById(taskId);
    if (!task) return;

    task.state = TaskState.FAILED;
    // Note: result property doesn't exist on CollectiveTask entity
    await task.save();

    // Log failure event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.TASK_FAILED,
      timestamp: new Date(),
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.TASK,
      targetId: taskId,
      description: `Task "${task.title}" failed: ${error}`,
      metadata: {
        taskTitle: task.title,
        error,
      },
    });

    // Send failure message to PM
    await this.messagesRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      sourceAgentId: agentId,
      targetAgentId: 'pm_agent',
      conversationId: 'pm_conversation',
      taskId: new Types.ObjectId(taskId),
      type: MessageType.STATUS_UPDATE,
      priority: MessagePriority.HIGH,
      message: `Task "${task.title}" failed: ${error}`,
      metadata: { error },
      status: MessageStatus.PENDING,
      createdAt: new Date(),
    });

    this.logger.error(`Task ${taskId} failed by agent ${agentId}: ${error}`);
  }

  /**
   * Pause agent execution.
   */
  private async pauseAgentExecution(
    collectiveId: string,
    agentId: string,
    reason: string,
  ): Promise<void> {
    const executionKey = `${collectiveId}:${agentId}`;
    const execution = this.activeExecutions.get(executionKey);

    if (execution) {
      execution.abortController.abort();
      this.activeExecutions.delete(executionKey);
    }

    // Update agent status
    const collective = await this.collectiveModel.findById(collectiveId);
    if (collective) {
      const agentConfig = collective.agents.find(a => a.id === agentId);
      if (agentConfig) {
        agentConfig.status = AgentStatus.IDLE;
        await collective.save();
      }
    }

    this.logger.log(`Agent ${agentId} paused: ${reason}`);
  }

  /**
   * Escalate to PM (agent needs help).
   */
  private async escalateToHuman(
    collectiveId: string,
    agentId: string,
    taskId: string,
    message: string,
  ): Promise<void> {
    await this.messagesRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      sourceAgentId: agentId,
      targetAgentId: 'pm_agent',
      conversationId: 'pm_conversation',
      taskId: new Types.ObjectId(taskId),
      type: MessageType.HELP_REQUEST,
      priority: MessagePriority.HIGH,
      message: message,
      metadata: { escalation: true },
      status: MessageStatus.PENDING,
      createdAt: new Date(),
    });

    // Log escalation event
    await this.eventsRepository.create({
      collectiveId: new Types.ObjectId(collectiveId),
      type: EventType.USER_INTERVENTION,
      timestamp: new Date(),
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.TASK,
      targetId: taskId,
      description: `Agent ${agentId} escalated task to PM: ${message}`,
      metadata: { message },
    });

    this.logger.log(`Agent ${agentId} escalated task ${taskId} to PM`);
  }

  /**
   * Summarize conversation to manage token count.
   */
  private async summarizeConversation(
    conversation: CollectiveConversationDocument,
  ): Promise<void> {
    // TODO Phase 2 continuation: Implement LLM-based conversation summarization
    // For now, just truncate old messages
    
    if (conversation.messages.length > 30) {
      const systemMessage = conversation.messages[0];
      const recentMessages = conversation.messages.slice(-15);
      
      conversation.messages = [
        systemMessage,
        {
          role: 'system',
          content: '[Earlier messages summarized to save tokens]',
          timestamp: new Date(),
        },
        ...recentMessages,
      ];

      await conversation.save();
      
      this.logger.debug(`Conversation ${conversation._id} summarized`);
    }
  }

  /**
   * Stop all agents in a collective.
   */
  async stopAllAgents(collectiveId: string): Promise<void> {
    const executionsToStop = Array.from(this.activeExecutions.entries())
      .filter(([key, _]) => key.startsWith(`${collectiveId}:`));

    for (const [key, execution] of executionsToStop) {
      execution.abortController.abort();
      this.activeExecutions.delete(key);
    }

    this.logger.log(`Stopped ${executionsToStop.length} agents in collective ${collectiveId}`);
  }

  /**
   * Stop a specific agent.
   */
  async stopAgent(collectiveId: string, agentId: string): Promise<void> {
    const executionKey = `${collectiveId}:${agentId}`;
    const execution = this.activeExecutions.get(executionKey);

    if (execution) {
      execution.abortController.abort();
      this.activeExecutions.delete(executionKey);
      this.logger.log(`Stopped agent ${agentId} in collective ${collectiveId}`);
    }
  }
}
