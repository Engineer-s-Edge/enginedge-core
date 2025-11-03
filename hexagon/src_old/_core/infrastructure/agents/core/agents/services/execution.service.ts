import { Injectable } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import BaseAgent from '../structures/base';
import GraphAgent from '../structures/graph';
import {
  ConversationIdType,
  NodeIdType,
  ObjectIdString,
} from '@core/infrastructure/database/utils/custom_types';
import { AgentIntelligenceConfig, AgentMemoryConfig } from '../types/agent.entity';
import { MyLogger } from '@core/services/logger/logger.service';

export interface AgentExecuteOptions {
  input: string;
  history?: [HumanMessage, ...AIMessage[]];
  tokenTarget?: number;
  contentSequence?: string[];
  streaming?: boolean;
}

@Injectable()
export class AgentExecutionService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'AgentExecutionService initializing',
      AgentExecutionService.name,
    );
  }
  /**
   * Execute an agent operation
   */
  async executeAgent(
    agent: BaseAgent,
    options: AgentExecuteOptions,
  ): Promise<string | AsyncIterable<any>> {
    this.logger.info(
      `Executing agent operation - streaming: ${options.streaming}`,
      AgentExecutionService.name,
    );
    this.logger.debug(
      `Input length: ${options.input.length} characters, history length: ${options.history?.length || 0}`,
      AgentExecutionService.name,
    );

    const {
      input,
      history = [],
      tokenTarget,
      contentSequence,
      streaming = false,
    } = options;

    if (streaming) {
      this.logger.info(
        'Starting streaming execution',
        AgentExecutionService.name,
      );
      return agent.stream(input, history, tokenTarget, contentSequence);
    } else {
      this.logger.info(
        'Starting non-streaming execution',
        AgentExecutionService.name,
      );
      return agent.invoke(input, history, tokenTarget, contentSequence);
    }
  }

  /**
   * Invoke an agent with a single request (non-streaming)
   */
  async invokeAgent(
    agent: BaseAgent,
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [] = [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    this.logger.info(
      'Invoking agent with single request',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `Input: ${input.substring(0, 100)}..., messages: ${latestMessages.length}`,
      AgentExecutionService.name,
    );
    return agent.invoke(input, latestMessages, tokenTarget, contentSequence);
  }

  /**
   * Stream responses from an agent
   */
  async streamAgent(
    agent: BaseAgent,
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [] = [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    this.logger.info('Starting agent streaming', AgentExecutionService.name);
    this.logger.debug(
      `Input: ${input.substring(0, 100)}..., messages: ${latestMessages.length}`,
      AgentExecutionService.name,
    );
    return agent.stream(input, latestMessages, tokenTarget, contentSequence);
  }

  /**
   * Send a correction/interruption to an agent
   */
  async correctAgent(
    agent: BaseAgent,
    correctionInput: string,
    context: string,
  ): Promise<void> {
    this.logger.info('Sending correction to agent', AgentExecutionService.name);
    this.logger.debug(
      `Correction: ${correctionInput.substring(0, 100)}..., context: ${context.substring(0, 100)}...`,
      AgentExecutionService.name,
    );
    await agent.correct(correctionInput, context);
    this.logger.info(
      'Correction sent successfully',
      AgentExecutionService.name,
    );
  }

  /**
   * Abort current operation for an agent
   */
  async abortAgent(agent: BaseAgent): Promise<void> {
    this.logger.info('Aborting agent operation', AgentExecutionService.name);
    agent.abort();
    this.logger.info('Agent operation aborted', AgentExecutionService.name);
  }

  /**
   * Reconfigure an existing agent with new settings
   */
  async reconfigureAgent(
    agent: BaseAgent,
    config: {
      memoryConfig?: Partial<AgentMemoryConfig>;
      checkpointConfig?: Partial<any>;
      intelligenceConfig?: Partial<AgentIntelligenceConfig>;
      loaderConfig?: Partial<any>;
      textsplitterConfig?: Partial<any>;
      embedderConfig?: Partial<any>;
    },
  ): Promise<void> {
    this.logger.info(
      'Reconfiguring agent with new settings',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `Configuration updates: ${JSON.stringify(config)}`,
      AgentExecutionService.name,
    );
    // Merge partial updates with current config for a type-safe reconfig
    const current = agent.getCurrentConfig();
    const merged = {
      memoryConfig: { ...current.memoryConfig, ...(config.memoryConfig || {}) },
      checkpointConfig: { ...current.checkpointConfig, ...(config.checkpointConfig || {}) },
      intelligenceConfig: { ...current.intelligenceConfig, ...(config.intelligenceConfig || {}) },
      loaderConfig: { ...current.loaderConfig, ...(config.loaderConfig || {}) },
      textsplitterConfig: { ...current.textsplitterConfig, ...(config.textsplitterConfig || {}) },
      embedderConfig: { ...current.embedderConfig, ...(config.embedderConfig || {}) },
    } as const;
    agent.reconfig(merged as any);
    this.logger.info(
      'Agent reconfiguration completed',
      AgentExecutionService.name,
    );
  }

  /**
   * Switch LLM provider for an agent
   */
  async switchAgentProvider(
    agent: BaseAgent,
    intelligenceConfig: AgentIntelligenceConfig,
  ): Promise<void> {
    this.logger.info(
      'Switching agent LLM provider',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `New provider: ${intelligenceConfig.llm.provider}, model: ${intelligenceConfig.llm.model}`,
      AgentExecutionService.name,
    );
    await agent.switchProviders(intelligenceConfig);
    this.logger.info(
      'Agent LLM provider switched successfully',
      AgentExecutionService.name,
    );
  }

  /**
   * Restore a checkpoint for an agent
   */
  async restoreAgentCheckpoint(
    agent: BaseAgent,
    searchOptions: {
      id?: string;
      name?: string;
      description?: string;
    },
  ): Promise<{ success: boolean; data: any | undefined }> {
    this.logger.info('Restoring agent checkpoint', AgentExecutionService.name);
    this.logger.debug(
      `Search options: ${JSON.stringify(searchOptions)}`,
      AgentExecutionService.name,
    );
    const result = await agent.restoreCheckpoint(searchOptions);
    this.logger.info(
      `Checkpoint restoration ${result.success ? 'succeeded' : 'failed'}`,
      AgentExecutionService.name,
    );
    return result;
  }

  /**
   * Switch conversation for an agent
   */
  async switchAgentConversation(
    agent: BaseAgent,
    newConversationId: ConversationIdType,
  ): Promise<void> {
    this.logger.info(
      `Switching agent conversation to ${newConversationId}`,
      AgentExecutionService.name,
    );
    await agent.switchConversation(newConversationId);
    this.logger.info(
      'Agent conversation switched successfully',
      AgentExecutionService.name,
    );
  }

  /**
   * Switch memory configuration for an agent
   */
  async switchAgentMemory(
    agent: BaseAgent,
    memoryConfig: AgentMemoryConfig,
  ): Promise<void> {
    this.logger.info(
      'Switching agent memory configuration',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `New memory type: ${memoryConfig.type}`,
      AgentExecutionService.name,
    );
    await agent.switchMemory(memoryConfig);
    this.logger.info(
      'Agent memory configuration switched successfully',
      AgentExecutionService.name,
    );
  }

  // Graph Agent specific operations

  /**
   * Pause a GraphAgent with specific options
   */
  async pauseGraphAgent(
    agent: GraphAgent,
    options?: {
      pauseBeforeNodes?: boolean;
      pauseAfterNodes?: boolean;
      pauseBetweenNodes?: boolean;
      specificBranches?: NodeIdType[];
    },
  ): Promise<void> {
    this.logger.info('Pausing GraphAgent', AgentExecutionService.name);
    if (options) {
      this.logger.debug(
        `Pause options: ${JSON.stringify(options)}`,
        AgentExecutionService.name,
      );
    }
    agent.pause(options);
    this.logger.info(
      'GraphAgent paused successfully',
      AgentExecutionService.name,
    );
  }

  /**
   * Resume a paused GraphAgent
   */
  async resumeGraphAgent(agent: GraphAgent): Promise<void> {
    this.logger.info('Resuming GraphAgent', AgentExecutionService.name);
    agent.resume();
    this.logger.info(
      'GraphAgent resumed successfully',
      AgentExecutionService.name,
    );
  }

  /**
   * Continue GraphAgent execution with new input (after checkpoint restoration)
   */
  async continueGraphAgentWithInput(
    agent: GraphAgent,
    newInput: string,
    options?: {
      tokenTarget?: number;
      contentSequence?: string[];
    },
  ): Promise<AsyncIterable<any>> {
    this.logger.info(
      'Continuing GraphAgent execution with new input',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `New input: ${newInput.substring(0, 100)}...`,
      AgentExecutionService.name,
    );
    let history: [HumanMessage, ...AIMessage[]] | [] = [];
    try {
      history = await agent.getRecentConversationMessages();
    } catch {}
    return agent.continueWithInput(
      newInput,
      history as any,
      options?.tokenTarget,
      options?.contentSequence,
    );
  }

  /**
   * Restore GraphAgent from a checkpoint
   */
  async restoreGraphAgentFromCheckpoint(
    agent: GraphAgent,
    checkpointId: string,
  ): Promise<boolean> {
    this.logger.info(
      `Restoring GraphAgent from checkpoint ${checkpointId}`,
      AgentExecutionService.name,
    );
    const result = await agent.restoreFromCheckpoint(checkpointId);
    this.logger.info(
      `GraphAgent checkpoint restoration ${result ? 'succeeded' : 'failed'}`,
      AgentExecutionService.name,
    );
    return result;
  }

  /**
   * Get GraphAgent execution state
   */
  async getGraphAgentExecutionState(agent: GraphAgent): Promise<{
    // deprecated (kept for backward compatibility) -> use `paused`
    isPaused: boolean;
    // canonical keys
    paused: boolean;
    currentNodes: string[];
    pausedBranches: NodeIdType[];
    executionHistory: Array<{
      nodeId: NodeIdType;
      nodeName: string;
      input: string;
      output: string;
      timestamp: Date;
      executionTime: number;
    }>;
  }> {
    this.logger.info(
      'Getting GraphAgent execution state',
      AgentExecutionService.name,
    );
  // Access via public getter to avoid relying on protected internals
  const executionState = agent.getExecutionState();

    const state = {
      isPaused: executionState.isPaused,
      paused: executionState.isPaused,
      currentNodes: Array.from(executionState.currentNodes.keys()) as string[],
      pausedBranches: Array.from(executionState.pausedBranches) as `n_${ObjectIdString}`[],
      executionHistory: executionState.executionHistory as any,
    };

    this.logger.debug(
      `GraphAgent state - paused: ${state.paused}, current nodes: ${state.currentNodes.length}, history: ${state.executionHistory.length}`,
      AgentExecutionService.name,
    );
    return state;
  }

  /**
   * Update GraphAgent configuration while paused
   */
  async updateGraphAgentConfiguration(
    agent: GraphAgent,
    updates: {
      nodes?: Partial<any>[];
      edges?: Partial<any>[];
      saveToAgent?: boolean;
    },
  ): Promise<boolean> {
    this.logger.info(
      'Updating GraphAgent configuration',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `Updates: nodes: ${updates.nodes?.length || 0}, edges: ${updates.edges?.length || 0}, saveToAgent: ${updates.saveToAgent}`,
      AgentExecutionService.name,
    );
    const result = await agent.updateGraphConfiguration(updates);
    this.logger.info(
      `GraphAgent configuration update ${result ? 'succeeded' : 'failed'}`,
      AgentExecutionService.name,
    );
    return result;
  }

  /**
   * Stream execution of a GraphAgent with pause support
   */
  async streamGraphAgent(
    agent: GraphAgent,
    options: AgentExecuteOptions,
  ): Promise<AsyncIterable<any>> {
    this.logger.info(
      'Starting GraphAgent streaming execution',
      AgentExecutionService.name,
    );
    this.logger.debug(
      `Input: ${options.input.substring(0, 100)}..., history: ${options.history?.length || 0}`,
      AgentExecutionService.name,
    );

    const { input, history = [], tokenTarget, contentSequence } = options;

    return agent.stream(input, history, tokenTarget, contentSequence);
  }
}
