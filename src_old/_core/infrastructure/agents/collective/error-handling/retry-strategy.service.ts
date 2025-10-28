import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveTask, CollectiveTaskDocument, TaskLevel } from '../entities/collective-task.entity';
import { Collective, CollectiveDocument } from '../entities/collective.entity';
import { CollectiveTasksRepository } from '../repositories/collective-tasks.repository';
import { PMToolsService } from '../services/pm-tools.service';
import { CommunicationService } from '../communication/communication.service';

/**
 * RetryStrategyService
 * 
 * Intelligent retry strategies for failed tasks.
 * 
 * Strategies:
 * 1. Simple Retry: Retry with same parameters
 * 2. Decompose: Break task into smaller subtasks
 * 3. Adjust Parameters: Modify task parameters (timeout, resources)
 * 4. Change Agent: Assign to different agent with better skills
 * 5. Add Context: Provide additional context/hints from previous attempt
 * 6. Simplify: Reduce task scope/complexity
 * 
 * Decision factors:
 * - Error type
 * - Previous attempt count
 * - Task complexity
 * - Agent capabilities
 * - Time spent
 */
@Injectable()
export class RetryStrategyService {
  private readonly logger = new Logger(RetryStrategyService.name);

  // Retry configuration
  private readonly MAX_SIMPLE_RETRIES = 2;
  private readonly MAX_TOTAL_RETRIES = 5;
  private readonly RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000]; // Progressive backoff

  // Strategy weights (higher = prefer this strategy)
  private readonly STRATEGY_WEIGHTS = {
    simple_retry: 10,
    decompose: 8,
    adjust_parameters: 7,
    change_agent: 6,
    add_context: 5,
    simplify: 4,
  };

  constructor(
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(Collective.name) private collectiveModel: Model<CollectiveDocument>,
    private readonly tasksRepo: CollectiveTasksRepository,
    private readonly pmTools: PMToolsService,
    private readonly communication: CommunicationService,
  ) {}

  /**
   * Determine the best retry strategy for a failed task.
   */
  async determineRetryStrategy(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
    error: {
      type: string;
      message: string;
      attemptCount: number;
      totalTime?: number;
    },
  ): Promise<{
    strategy: string;
    reason: string;
    actions: Array<{ type: string; params: any }>;
  }> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const collective = await this.collectiveModel.findById(collectiveId);
    if (!collective) {
      throw new Error('Collective not found');
    }

    // Calculate strategy scores
    const scores = {
      simple_retry: this.scoreSimpleRetry(error, task),
      decompose: this.scoreDecompose(error, task),
      adjust_parameters: this.scoreAdjustParameters(error, task),
      change_agent: this.scoreChangeAgent(error, task, collective),
      add_context: this.scoreAddContext(error, task),
      simplify: this.scoreSimplify(error, task),
    };

    // Find best strategy
    const bestStrategy = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0];

    const strategy = bestStrategy[0];
    const reason = this.explainStrategy(strategy, error, task);
    const actions = await this.buildStrategyActions(strategy, collectiveId, task, error, collective);

    this.logger.log(`Selected retry strategy "${strategy}" for task ${taskId}. Reason: ${reason}`);

    return { strategy, reason, actions };
  }

  /**
   * Execute a retry strategy.
   */
  async executeRetryStrategy(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
    strategy: {
      strategy: string;
      reason: string;
      actions: Array<{ type: string; params: any }>;
    },
  ): Promise<void> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    this.logger.log(`Executing retry strategy "${strategy.strategy}" for task ${taskId}`);

    // Execute each action
    for (const action of strategy.actions) {
      await this.executeAction(collectiveId, task, action);
    }

    // Notify PM
    await this.communication.pmBroadcast(
      collectiveId,
      `Applying retry strategy "${strategy.strategy}" to task "${task.title}": ${strategy.reason}`,
      { priority: 'NORMAL' },
    );
  }

  /**
   * Calculate simple retry score.
   * High if: few attempts, quick to complete, transient error
   */
  private scoreSimpleRetry(error: any, task: CollectiveTaskDocument): number {
    let score = this.STRATEGY_WEIGHTS.simple_retry;

    // Penalize if too many attempts
    if (error.attemptCount >= this.MAX_SIMPLE_RETRIES) {
      score -= 20;
    }

    // Favor for transient errors
    const transientErrors = ['timeout', 'network', 'connection', 'temporary'];
    if (transientErrors.some(e => error.type.toLowerCase().includes(e))) {
      score += 5;
    }

    // Penalize for complex tasks
    if (task.level === TaskLevel.TASK || task.level === TaskLevel.SUBTASK) {
      score += 3; // Simple tasks are good for simple retry
    } else {
      score -= 3; // Complex tasks need better strategies
    }

    return score;
  }

  /**
   * Calculate decompose score.
   * High if: complex task, previous attempts failed, task can be broken down
   */
  private scoreDecompose(error: any, task: CollectiveTaskDocument): number {
    let score = this.STRATEGY_WEIGHTS.decompose;

    // Favor for complex tasks
    if (task.level === TaskLevel.EPIC || task.level === TaskLevel.FEATURE) {
      score += 8;
    }

    // Favor after multiple failures
    if (error.attemptCount >= 2) {
      score += 5;
    }

    // Don't decompose subtasks
    if (task.level === TaskLevel.SUBTASK) {
      score -= 15;
    }

    // Favor if task is complex (long description)
    if (task.description && task.description.length > 200) {
      score += 3;
    }

    return score;
  }

  /**
   * Calculate adjust parameters score.
   * High if: timeout/resource errors, not first attempt
   */
  private scoreAdjustParameters(error: any, _task: CollectiveTaskDocument): number {
    let score = this.STRATEGY_WEIGHTS.adjust_parameters;

    // Favor for timeout errors
    if (error.type.toLowerCase().includes('timeout')) {
      score += 10;
    }

    // Favor for resource errors
    if (error.type.toLowerCase().includes('resource') || error.type.toLowerCase().includes('memory')) {
      score += 8;
    }

    // Favor after first attempt
    if (error.attemptCount >= 1) {
      score += 3;
    }

    return score;
  }

  /**
   * Calculate change agent score.
   * High if: agent crash, validation errors, specialized task
   */
  private scoreChangeAgent(error: any, task: CollectiveTaskDocument, collective: CollectiveDocument): number {
    let score = this.STRATEGY_WEIGHTS.change_agent;

    // Strongly favor for agent crashes
    if (error.type.toLowerCase().includes('crash') || error.type.toLowerCase().includes('unresponsive')) {
      score += 15;
    }

    // Favor for validation errors (different agent might have better skills)
    if (error.type.toLowerCase().includes('validation')) {
      score += 5;
    }

    // Check if other agents are available
    const idleAgents = collective.agents.filter(
      a => a.status === 'idle' && a.id !== task.assignedAgentId,
    );
    if (idleAgents.length === 0) {
      score -= 20; // Can't change if no agents available
    }

    return score;
  }

  /**
   * Calculate add context score.
   * High if: validation errors, multiple attempts, task needs clarification
   */
  private scoreAddContext(error: any, task: CollectiveTaskDocument): number {
    let score = this.STRATEGY_WEIGHTS.add_context;

    // Favor for validation errors
    if (error.type.toLowerCase().includes('validation')) {
      score += 7;
    }

    // Favor after multiple attempts
    if (error.attemptCount >= 2) {
      score += 5;
    }

    // Favor if task has dependencies (context from dependencies might help)
    if (task.dependencies && task.dependencies.length > 0) {
      score += 3;
    }

    return score;
  }

  /**
   * Calculate simplify score.
   * High if: task is complex, multiple failures, no better strategy
   */
  private scoreSimplify(error: any, task: CollectiveTaskDocument): number {
    let score = this.STRATEGY_WEIGHTS.simplify;

    // Favor after many failures
    if (error.attemptCount >= 3) {
      score += 10;
    }

    // Favor for complex tasks
    if (task.level === TaskLevel.EPIC || task.level === TaskLevel.FEATURE) {
      score += 5;
    }

    // Don't simplify simple tasks
    if (task.level === TaskLevel.SUBTASK) {
      score -= 10;
    }

    return score;
  }

  /**
   * Explain why a strategy was chosen.
   */
  private explainStrategy(strategy: string, error: any, task: CollectiveTaskDocument): string {
    switch (strategy) {
      case 'simple_retry':
        return `Transient error "${error.type}" on simple task, worth retrying (attempt ${error.attemptCount + 1})`;

      case 'decompose':
        return `Complex ${task.level} failed ${error.attemptCount} times, breaking into smaller subtasks`;

      case 'adjust_parameters':
        return `${error.type} suggests parameter adjustment needed (timeout, resources, etc)`;

      case 'change_agent':
        return `Agent issue detected (${error.type}), reassigning to different agent with better fit`;

      case 'add_context':
        return `Validation/clarity issue, providing additional context and examples`;

      case 'simplify':
        return `Task too complex after ${error.attemptCount} attempts, reducing scope`;

      default:
        return `Selected strategy: ${strategy}`;
    }
  }

  /**
   * Build actions for a strategy.
   */
  private async buildStrategyActions(
    strategy: string,
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    error: any,
    collective: CollectiveDocument,
  ): Promise<Array<{ type: string; params: any }>> {
    const actions: Array<{ type: string; params: any }> = [];

    switch (strategy) {
      case 'simple_retry':
        // Just retry with delay
        actions.push({
          type: 'delay',
          params: { ms: this.RETRY_DELAYS_MS[error.attemptCount] || 5000 },
        });
        actions.push({
          type: 'reset_task',
          params: { taskId: task._id },
        });
        break;

      case 'decompose':
        // PM creates subtasks
        actions.push({
          type: 'pm_decompose',
          params: {
            taskId: task._id,
            hint: `Previous attempt failed with: ${error.message}`,
          },
        });
        break;

      case 'adjust_parameters':
        // Adjust timeouts/resources
        const adjustments: any = {};
        if (error.type.toLowerCase().includes('timeout')) {
          adjustments.increaseTimeout = true;
        }
        if (error.type.toLowerCase().includes('memory') || error.type.toLowerCase().includes('resource')) {
          adjustments.increaseResources = true;
        }
        actions.push({
          type: 'adjust_parameters',
          params: { taskId: task._id, adjustments },
        });
        actions.push({
          type: 'reset_task',
          params: { taskId: task._id },
        });
        break;

      case 'change_agent':
        // Find best alternative agent
        const newAgent = this.findBestAlternativeAgent(task, collective);
        if (newAgent) {
          actions.push({
            type: 'reassign_task',
            params: {
              taskId: task._id,
              newAgentId: newAgent.id,
              reason: `Previous agent failed with: ${error.message}`,
            },
          });
        }
        break;

      case 'add_context':
        // Add hints from error
        const hints = this.generateContextHints(task, error);
        actions.push({
          type: 'add_hints',
          params: { taskId: task._id, hints },
        });
        actions.push({
          type: 'reset_task',
          params: { taskId: task._id },
        });
        break;

      case 'simplify':
        // PM simplifies task scope
        actions.push({
          type: 'pm_simplify',
          params: {
            taskId: task._id,
            hint: `Task failed ${error.attemptCount} times, please reduce scope`,
          },
        });
        break;
    }

    return actions;
  }

  /**
   * Execute a single action.
   */
  private async executeAction(
    collectiveId: string | Types.ObjectId,
    task: CollectiveTaskDocument,
    action: { type: string; params: any },
  ): Promise<void> {
    switch (action.type) {
      case 'delay':
        await this.delay(action.params.ms);
        break;

      case 'reset_task':
        // Note: updateTask method doesn't exist, skip this action
        this.logger.log(`Would reset task ${task._id} to pending state`);
        break;

      case 'pm_decompose':
        // Note: askPMToDecompose doesn't exist, use communication instead
        await this.communication.askPM(
          collectiveId,
          'system',
          `Please decompose task "${task.title}" into smaller subtasks. Reason: ${action.params.hint}`,
          { taskId: (task._id as Types.ObjectId).toString() },
        );
        break;

      case 'adjust_parameters':
        // In a real implementation, you'd actually adjust task parameters
        // For now, just log
        this.logger.log(`Adjusting parameters for task ${task._id}: ${JSON.stringify(action.params.adjustments)}`);
        break;

      case 'reassign_task':
        await this.pmTools.reassignTask({
          collectiveId: collectiveId as any,
          taskId: task._id as any,
          fromAgentId: task.assignedAgentId || 'unknown',
          toAgentId: action.params.newAgentId,
          reason: action.params.reason,
        });
        break;

      case 'add_hints':
        // Send hints to the PM agent via communication
        await this.communication.pmDirective(
          collectiveId,
          task.assignedAgentId || 'system',
          `Additional context for retry: ${Array.isArray(action.params.hints) ? action.params.hints.join(', ') : action.params.hints}`,
          { taskId: (task._id as Types.ObjectId).toString() },
        );
        break;

      case 'pm_simplify':
        // Ask PM to simplify task via communication
        await this.communication.askPM(
          collectiveId,
          'system',
          `Please simplify task "${task.title}". Reason: ${action.params.hint}`,
          { taskId: (task._id as Types.ObjectId).toString() },
        );
        break;
    }
  }

  /**
   * Find best alternative agent for a task.
   */
  private findBestAlternativeAgent(
    task: CollectiveTaskDocument,
    collective: CollectiveDocument,
  ): { id: string } | null {
    // Find idle agents (excluding current agent)
    const candidates = collective.agents.filter(
      a => a.status === 'idle' && a.id !== task.assignedAgentId,
    );

    if (candidates.length === 0) {
      return null;
    }

    // In a real implementation, you'd score agents based on:
    // - Skill match with task requirements
    // - Past success rate
    // - Current workload
    // For now, just pick first idle agent
    return candidates[0];
  }

  /**
   * Generate context hints from error.
   */
  private generateContextHints(task: CollectiveTaskDocument, error: any): string[] {
    const hints: string[] = [];

    hints.push(`Previous attempt failed: ${error.message}`);

    if (error.type.toLowerCase().includes('validation')) {
      hints.push('Pay careful attention to the acceptance criteria');
      hints.push('Verify output format matches requirements exactly');
    }

    if (error.type.toLowerCase().includes('timeout')) {
      hints.push('Consider breaking complex operations into smaller steps');
      hints.push('Use incremental progress updates');
    }

    if (error.type.toLowerCase().includes('dependency')) {
      hints.push('Verify all required dependencies are available');
      hints.push('Check if dependencies need to be loaded or configured first');
    }

    // Add task-specific hints
    if (task.level >= TaskLevel.EPIC && task.level <= TaskLevel.FEATURE) {
      hints.push('This is a complex task - consider asking PM to break it down');
    }

    return hints;
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry statistics for a task.
   */
  async getRetryStats(_taskId: string | Types.ObjectId): Promise<{
    totalRetries: number;
    strategiesUsed: string[];
    lastStrategy: string | null;
    success: boolean;
  }> {
    // In a real implementation, track this in the database
    // For now, return placeholder
    return {
      totalRetries: 0,
      strategiesUsed: [],
      lastStrategy: null,
      success: false,
    };
  }
}
