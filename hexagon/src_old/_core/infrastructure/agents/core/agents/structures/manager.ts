/**
 * Commander/Manager Agent
 * 
 * A sophisticated agent that can decompose complex tasks into sub-tasks,
 * spawn sub-agents (ReAct or Graph agents) to handle them, and aggregate results.
 * 
 * Key capabilities:
 * - Task decomposition using LLM reasoning
 * - Programmatic creation of sub-agents
 * - Sub-agent lifecycle management (spawn, monitor, terminate)
 * - Result aggregation from multiple sub-agents
 * - Inter-agent communication via Kafka
 * - Retry/rollback for failed sub-tasks
 */

import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import BaseAgent from './base';
import { ReActAgent } from './react';
import GraphAgent from './graph';
import { getErrorInfo } from '@common/error-assertions';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import {
  AgentState,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  ReActAgentConfig,
  GraphAgent as GraphAgentConfig,
  Node,
} from '../types/agent.entity';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  UserIdType,
  ConversationIdType,
  ReActAgentIdType,
  GraphAgentIdType,
  NodeIdType,
} from '@core/infrastructure/database/utils/custom_types';

interface SubTask {
  id: string;
  description: string;
  agentType: 'react' | 'graph';
  status: 'pending' | 'running' | 'completed' | 'failed';
  agentId?: ReActAgentIdType | GraphAgentIdType;
  agent?: ReActAgent | GraphAgent;
  input: string;
  output?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  dependencies: string[]; // IDs of sub-tasks that must complete first
}

interface CommanderAgentConfig {
  _id: string;
  state: AgentState;
  enabled: boolean;
  maxSubAgents: number; // Maximum number of concurrent sub-agents
  taskDecompositionPrompt: string; // LLM prompt template for task breakdown
  resultAggregationPrompt: string; // LLM prompt template for combining results
  retryFailedTasks: boolean;
  maxRetries: number;
  subAgentTemplates: {
    react: Partial<ReActAgentConfig>;
    graph: Partial<GraphAgentConfig>;
  };
}

@Injectable()
export class CommanderAgent extends BaseAgent {
  private settings: CommanderAgentConfig;
  private subTasks: Map<string, SubTask> = new Map();
  private activeSubAgents: Map<string, ReActAgent | GraphAgent> = new Map();

  constructor(
    @Inject(Toolkit) tools: Toolkit,
    @Inject(AgentMemory) memory: AgentMemory,
    @Inject(LLMService) llm: LLMService,
    @Inject(ConversationRepository)
    protected conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) protected vectorStore: VectorStoreService,
    @Inject(CheckpointService) protected checkpointService: CheckpointService,
    @Inject(LoaderService) protected loaderService: LoaderService,
    settings: CommanderAgentConfig,
    config: {
      memoryConfig: AgentMemoryConfig;
      checkpointConfig: AgentCheckpointConfig;
      intelligenceConfig: AgentIntelligenceConfig;
      loaderConfig: AgentLoaderConfig;
      textsplitterConfig: TextSplitterConfig;
      embedderConfig: EmbeddingOptions;
    },
    protected userId: UserIdType,
    protected conversationId: ConversationIdType,
    logger: MyLogger,
  ) {
    super(
      tools,
      memory,
      llm,
      conversationRepository,
      vectorStore,
      checkpointService,
      loaderService,
      config,
      userId,
      logger,
    );

    this.logger.info('CommanderAgent initializing', CommanderAgent.name);
    this.settings = settings;
    this._id = this.settings._id as any;
    this.state = this.settings.state || AgentState.INITIALIZING;
    this.conversationId = conversationId;

    this.emit('commander-agent-initializing', {
      agentId: this._id,
      maxSubAgents: this.settings.maxSubAgents,
      timestamp: new Date(),
    });

    this.init();
  }

  protected async init(): Promise<void> {
    this.logger.info('Initializing CommanderAgent', CommanderAgent.name);
    try {
      if (!this.settings.enabled) {
        this.logger.warn(
          `CommanderAgent ${this._id} is disabled, setting state to STOPPED`,
          CommanderAgent.name,
        );
        this.state = AgentState.STOPPED;
        this.emit('commander-agent-disabled', {
          agentId: this._id,
          timestamp: new Date(),
        });
        return;
      }

      this.state = AgentState.READY;
      this.logger.info(
        'CommanderAgent initialization completed successfully',
        CommanderAgent.name,
      );

      this.emit('commander-agent-ready', {
        agentId: this._id,
        maxSubAgents: this.settings.maxSubAgents,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'CommanderAgent initialization failed\n' + (info.stack || ''),
        CommanderAgent.name,
      );
      this.state = AgentState.ERRORED;
      this.emit('commander-agent-error', {
        agentId: this._id,
        error: info.message,
        timestamp: new Date(),
      });
      throw new Error(info.message);
    }
  }

  /**
   * Main entry point - decomposes task and delegates to sub-agents
   */
  public async invoke(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    this.logger.info('Starting CommanderAgent invoke operation', CommanderAgent.name);
    let result = '';
    const streamResult = await this.stream(
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );

    for await (const chunk of streamResult) {
      result += chunk;
    }

    return result;
  }

  /**
   * Streaming execution with task decomposition and delegation
   */
  public async stream(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<string>> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        self.logger.info(
          'Starting CommanderAgent stream implementation',
          CommanderAgent.name,
        );

        if (self.state !== AgentState.READY) {
          throw new Error(`CommanderAgent not ready. Current state: ${self.state}`);
        }

        self.state = AgentState.RUNNING;
        self.abortController = new AbortController();

        try {
          // Step 1: Decompose task into sub-tasks
          yield* self.decomposeTask(input, latestMessages);

          // Step 2: Execute sub-tasks (respecting dependencies)
          yield* self.executeSubTasks(latestMessages, tokenTarget, contentSequence);

          // Step 3: Aggregate results
          yield* self.aggregateResults(input, latestMessages);

          self.state = AgentState.READY;
          self.emit('commander-execution-complete', {
            agentId: self._id,
            totalSubTasks: self.subTasks.size,
            successfulTasks: Array.from(self.subTasks.values()).filter(
              (t) => t.status === 'completed',
            ).length,
            timestamp: new Date(),
          });
        } catch (error) {
          const info = getErrorInfo(error);
          self.logger.error(
            'CommanderAgent execution failed\n' + (info.stack || ''),
            CommanderAgent.name,
          );
          self.state = AgentState.ERRORED;
          self.emit('commander-execution-error', {
            agentId: self._id,
            error: info.message,
            timestamp: new Date(),
          });
          throw new Error(info.message);
        } finally {
          // Cleanup sub-agents
          await self.cleanupSubAgents();
        }
      },
    };
  }

  /**
   * Decompose the main task into sub-tasks using LLM reasoning
   */
  private async *decomposeTask(
    input: string,
    _latestMessages: [HumanMessage, ...AIMessage[]] | [],
  ): AsyncGenerator<string, void, unknown> {
    this.logger.info('Decomposing task into sub-tasks', CommanderAgent.name);

    const decompositionPrompt = this.settings.taskDecompositionPrompt.replace(
      '{input}',
      input,
    );

    this.emit('task-decomposition-start', {
      agentId: this._id,
      input: input.substring(0, 100) + '...',
      timestamp: new Date(),
    });

    // Use LLM to break down the task
    const result = await this.llm.chat([new HumanMessage(decompositionPrompt)], {
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
      stream: false,
    });

    const decomposition = String(result.response);
    yield `\n🧠 **Task Decomposition:**\n${decomposition}\n\n`;

    // Parse the decomposition into sub-tasks
    // Expected format: JSON array of {description, agentType, dependencies}
    try {
      const subTasksData = this.parseDecomposition(decomposition);
      
      for (let i = 0; i < subTasksData.length; i++) {
        const taskData = subTasksData[i];
        const taskId = `task-${Date.now()}-${i}`;
        
        const subTask: SubTask = {
          id: taskId,
          description: taskData.description,
          agentType: taskData.agentType || 'react',
          status: 'pending',
          input: taskData.input || input,
          dependencies: taskData.dependencies || [],
        };

        this.subTasks.set(taskId, subTask);
        yield `  ✅ Sub-task ${i + 1}: ${subTask.description} (${subTask.agentType})\n`;
      }

      this.emit('task-decomposition-complete', {
        agentId: this._id,
        subTaskCount: this.subTasks.size,
        timestamp: new Date(),
      });

      yield `\n📋 **Created ${this.subTasks.size} sub-tasks**\n\n`;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to parse task decomposition: ${info.message}`,
        CommanderAgent.name,
      );
      // Fallback: create a single sub-task
      const fallbackTaskId = `task-${Date.now()}-0`;
      this.subTasks.set(fallbackTaskId, {
        id: fallbackTaskId,
        description: 'Complete the entire task',
        agentType: 'react',
        status: 'pending',
        input,
        dependencies: [],
      });
      yield `  ⚠️ Using fallback: single ReAct agent for entire task\n\n`;
    }
  }

  /**
   * Parse LLM decomposition output into sub-task data
   */
  private parseDecomposition(_decomposition: string): Array<{
    description: string;
    agentType: 'react' | 'graph';
    input?: string;
    dependencies?: string[];
  }> {
    const decomposition = _decomposition;
    // Try to extract JSON array from the response
    const jsonMatch = decomposition.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: parse simple numbered list
    const lines = decomposition.split('\n').filter((l) => l.trim());
    return lines.map((line) => ({
      description: line.replace(/^\d+[\.\)]\s*/, ''),
      agentType: 'react' as const,
    }));
  }

  /**
   * Execute sub-tasks respecting dependencies
   */
  private async *executeSubTasks(
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): AsyncGenerator<string, void, unknown> {
    this.logger.info('Executing sub-tasks', CommanderAgent.name);
    yield `\n🚀 **Executing Sub-Tasks:**\n\n`;

    const completedTasks = new Set<string>();

    while (completedTasks.size < this.subTasks.size) {
      // Find tasks ready to execute (dependencies met)
      const readyTasks = Array.from(this.subTasks.values()).filter(
        (task) =>
          task.status === 'pending' &&
          task.dependencies.every((dep) => completedTasks.has(dep)),
      );

      if (readyTasks.length === 0) {
        // Check if we're stuck (circular dependencies or all failed)
        const pendingTasks = Array.from(this.subTasks.values()).filter(
          (t) => t.status === 'pending',
        );
        if (pendingTasks.length > 0) {
          this.logger.error(
            `Stuck with ${pendingTasks.length} pending tasks and no ready tasks`,
            CommanderAgent.name,
          );
          break;
        }
        break;
      }

      // Execute ready tasks (respect maxSubAgents concurrency)
      const tasksToExecute = readyTasks.slice(0, this.settings.maxSubAgents);

      // Execute tasks sequentially to maintain yield streaming
      for (const task of tasksToExecute) {
        try {
          yield `  ▶️ Starting: ${task.description}\n`;
          task.status = 'running';
          task.startTime = new Date();

          // Create and execute sub-agent
          const agent = await this.createSubAgent(task);
          task.agent = agent;
          this.activeSubAgents.set(task.id, agent);

          // Invoke with default message if latestMessages is empty
          const messages: [HumanMessage, ...AIMessage[]] = latestMessages.length > 0 
            ? (latestMessages as [HumanMessage, ...AIMessage[]])
            : [new HumanMessage(task.input)];
          const result = await agent.invoke(task.input, messages, tokenTarget, contentSequence);
          
          task.output = result;
          task.status = 'completed';
          task.endTime = new Date();
          completedTasks.add(task.id);

          yield `  ✅ Completed: ${task.description}\n`;

          this.emit('sub-task-completed', {
            agentId: this._id,
            taskId: task.id,
            description: task.description,
            executionTime: task.endTime.getTime() - task.startTime!.getTime(),
            timestamp: new Date(),
          });
        } catch (error) {
          const info = getErrorInfo(error);
          task.status = 'failed';
          task.error = info.message;
          task.endTime = new Date();

          yield `  ❌ Failed: ${task.description} - ${info.message}\n`;

          this.emit('sub-task-failed', {
            agentId: this._id,
            taskId: task.id,
            description: task.description,
            error: info.message,
            timestamp: new Date(),
          });

          // Optionally retry
          if (this.settings.retryFailedTasks) {
            // TODO: Implement retry logic
          }
        }
      }
    }

    yield `\n`;
  }

  /**
   * Create a sub-agent (ReAct or Graph) based on task type
   */
  private async createSubAgent(task: SubTask): Promise<ReActAgent | GraphAgent> {
    this.logger.info(
      `Creating ${task.agentType} sub-agent for task: ${task.description}`,
      CommanderAgent.name,
    );

    if (task.agentType === 'react') {
      return this.createReActSubAgent(task);
    } else {
      return this.createGraphSubAgent(task);
    }
  }

  /**
   * Programmatically create a ReAct sub-agent
   */
  private async createReActSubAgent(_task: SubTask): Promise<ReActAgent> {
    const template = this.settings.subAgentTemplates.react;
    
    const config: ReActAgentConfig = {
      _id: `react-sub-${Date.now()}` as ReActAgentIdType,
      state: AgentState.INITIALIZING,
      enabled: true,
      cot: {
        enabled: true,
        promptTemplate: template.cot?.promptTemplate || `You are a helpful assistant working on a sub-task.

Task: {input}

Use the following format:
Thought: think about what to do
Action: the action to take
Action Input: the input to the action
Observation: the result of the action
... (repeat as needed)
Thought: I now have the answer
Final Answer: the final answer

Begin!

{input}`,
        maxTokens: template.cot?.maxTokens || 512,
        temperature: template.cot?.temperature || 0.7,
        topP: template.cot?.topP || 0.9,
        frequencyPenalty: template.cot?.frequencyPenalty || 0,
        presencePenalty: template.cot?.presencePenalty || 0,
        fewShotExamples: template.cot?.fewShotExamples || [],
        stopSequences: template.cot?.stopSequences || [],
        maxSteps: template.cot?.maxSteps || 5,
        selfConsistency: template.cot?.selfConsistency || { enabled: false, samples: 1 },
        temperatureModifiable: true,
        maxTokensModifiable: true,
      },
      tools: template.tools || [],
      canModifyStorage: template.canModifyStorage || false,
      intelligence: {
        escalate: false,
        llm: this.intelligenceConfig.llm,
        providerEscalationOptions: [],
        modelEscalationTable: this.intelligenceConfig.modelEscalationTable,
      },
    };

    const agent = new ReActAgent(
      this.tools,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      config,
      {
        memoryConfig: this.memoryConfig,
        checkpointConfig: this.checkpointConfig,
        intelligenceConfig: this.intelligenceConfig,
        loaderConfig: this.loaderConfig,
        textsplitterConfig: this.textsplitterConfig,
        embedderConfig: this.embedderConfig,
      },
      this.userId,
      this.logger,
    );

    // Wait for agent initialization to complete
    await new Promise<void>((resolve) => {
      const checkInit = () => {
        if (agent['state'] === AgentState.READY) {
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });

    return agent;
  }

  /**
   * Programmatically create a Graph sub-agent
   */
  private async createGraphSubAgent(task: SubTask): Promise<GraphAgent> {
    const template = this.settings.subAgentTemplates.graph;
    
    // Create a simple 2-node graph: Start → Process → End
    const startNodeId = `node-start-${Date.now()}` as NodeIdType;
    const processNodeId = `node-process-${Date.now()}` as NodeIdType;

    const config: GraphAgentConfig = {
      _id: `graph-sub-${Date.now()}` as GraphAgentIdType,
      state: AgentState.INITIALIZING,
      nodes: [
        {
          _id: startNodeId,
          command: '/_newmessage',
          name: 'Start',
          description: 'Entry point',
          llm: this.intelligenceConfig.llm,
          ReActConfig: {
            _id: `react-${startNodeId}` as ReActAgentIdType,
            state: AgentState.READY,
            enabled: true,
            cot: {
              enabled: false,
              promptTemplate: 'Pass through: {input}',
              maxTokens: 50,
              temperature: 0,
              topP: 1,
              frequencyPenalty: 0,
              presencePenalty: 0,
              fewShotExamples: [],
              stopSequences: [],
              maxSteps: 1,
              selfConsistency: { enabled: false, samples: 1 },
              temperatureModifiable: false,
              maxTokensModifiable: false,
            },
            tools: [],
            canModifyStorage: false,
            intelligence: {
              escalate: false,
              llm: this.intelligenceConfig.llm,
              providerEscalationOptions: [],
              modelEscalationTable: this.intelligenceConfig.modelEscalationTable,
            },
          },
        } as Node,
        {
          _id: processNodeId,
          name: 'Process',
          description: task.description,
          llm: this.intelligenceConfig.llm,
          ReActConfig: template.nodes?.[0]?.ReActConfig || {
            _id: `react-${processNodeId}` as ReActAgentIdType,
            state: AgentState.READY,
            enabled: true,
            cot: {
              enabled: true,
              promptTemplate: `Complete this task: {input}`,
              maxTokens: 512,
              temperature: 0.7,
              topP: 0.9,
              frequencyPenalty: 0,
              presencePenalty: 0,
              fewShotExamples: [],
              stopSequences: [],
              maxSteps: 5,
              selfConsistency: { enabled: false, samples: 1 },
              temperatureModifiable: true,
              maxTokensModifiable: true,
            },
            tools: [],
            canModifyStorage: false,
            intelligence: {
              escalate: false,
              llm: this.intelligenceConfig.llm,
              providerEscalationOptions: [],
              modelEscalationTable: this.intelligenceConfig.modelEscalationTable,
            },
          },
        } as Node,
      ],
      edges: [
        {
          _id: `edge-${Date.now()}` as any,
          from: startNodeId,
          to: processNodeId,
          condition: { 
            type: 'keyword',
            keyword: 'proceed',
            analysisProvider: this.intelligenceConfig.llm,
          },
          contextFrom: [],
        },
      ],
      memory: template.memory || { type: 'cbm' } as any,
      checkpoints: template.checkpoints || { enabled: false, allowList: [] } as any,
    };

    const agent = new GraphAgent(
      this.tools,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      config,
      {
        memoryConfig: this.memoryConfig,
        checkpointConfig: this.checkpointConfig,
        intelligenceConfig: this.intelligenceConfig,
        loaderConfig: this.loaderConfig,
        textsplitterConfig: this.textsplitterConfig,
        embedderConfig: this.embedderConfig,
      },
      this.userId,
      this.conversationId,
      this.logger,
    );

    // Wait for agent initialization to complete
    await new Promise<void>((resolve) => {
      const checkInit = () => {
        if (agent['state'] === AgentState.READY) {
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });

    return agent;
  }

  /**
   * Aggregate results from all sub-tasks
   */
  private async *aggregateResults(
    input: string,
    _latestMessages: [HumanMessage, ...AIMessage[]] | [],
  ): AsyncGenerator<string, void, unknown> {
    this.logger.info('Aggregating results from sub-tasks', CommanderAgent.name);
    yield `\n📊 **Aggregating Results:**\n\n`;

    const completedTasks = Array.from(this.subTasks.values()).filter(
      (t) => t.status === 'completed',
    );

    if (completedTasks.length === 0) {
      yield `❌ No tasks completed successfully.\n`;
      return;
    }

    // Build aggregation prompt
    const taskResults = completedTasks
      .map((task, i) => `${i + 1}. ${task.description}: ${task.output}`)
      .join('\n');

    const aggregationPrompt = this.settings.resultAggregationPrompt
      .replace('{input}', input)
      .replace('{results}', taskResults);

    this.emit('result-aggregation-start', {
      agentId: this._id,
      completedTaskCount: completedTasks.length,
      timestamp: new Date(),
    });

    // Use LLM to combine results
    const result = await this.llm.chat([new HumanMessage(aggregationPrompt)], {
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
      stream: false,
    });

    const aggregatedResult = String(result.response);
    
    this.emit('result-aggregation-complete', {
      agentId: this._id,
      timestamp: new Date(),
    });

    yield `${aggregatedResult}\n`;
  }

  /**
   * Cleanup all sub-agents
   */
  private async cleanupSubAgents(): Promise<void> {
    this.logger.info(
      `Cleaning up ${this.activeSubAgents.size} sub-agents`,
      CommanderAgent.name,
    );

    for (const [taskId, agent] of this.activeSubAgents) {
      try {
        // Abort any ongoing operations
        if ((agent as any).abort) {
          (agent as any).abort();
        }
      } catch (error) {
        this.logger.warn(
          `Error cleaning up sub-agent ${taskId}: ${error}`,
          CommanderAgent.name,
        );
      }
    }

    this.activeSubAgents.clear();
    this.subTasks.clear();
  }

  /**
   * Abort current execution and cleanup
   */
  public abort(): void {
    this.logger.info('Aborting CommanderAgent execution', CommanderAgent.name);
    this.abortController?.abort();
    this.cleanupSubAgents();
    this.state = AgentState.READY;

    this.emit('commander-execution-aborted', {
      agentId: this._id,
      timestamp: new Date(),
    });
  }

  /**
   * Get current task execution status
   */
  public getTaskStatus(): {
    totalTasks: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    tasks: Array<{
      id: string;
      description: string;
      status: string;
      output?: string;
      error?: string;
    }>;
  } {
    const tasks = Array.from(this.subTasks.values());
    
    return {
      totalTasks: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'running').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      tasks: tasks.map((t) => ({
        id: t.id,
        description: t.description,
        status: t.status,
        output: t.output,
        error: t.error,
      })),
    };
  }
}