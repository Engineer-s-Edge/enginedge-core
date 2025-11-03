import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter } from 'events';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import BaseAgent from './structures/base';
import GraphAgent from './structures/graph';
import {
  AgentFactoryService,
  AgentType,
} from './services/factory.service';
import { AgentValidationService } from './services/validation.service';
import {
  AgentConfigurationService,
  AgentConfigOptions,
} from './services/configuration.service';
import { AgentEventService } from './services/event.service';
import { AgentSessionService } from './services/session.service';
import {
  AgentExecutionService,
  AgentExecuteOptions,
} from './services/execution.service';
import { ReActAgentConfig, GraphAgent as GraphAgentConfig, AgentIntelligenceConfig, AgentState } from './types/agent.entity';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import {
  ConversationIdType,
  UserIdType,
  NodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface AgentCreateOptions {
  type: AgentType | string; // Allow string for unique ReAct types
  userId: UserIdType;
  conversationId: ConversationIdType;
  settings?: any; // More flexible typing for unique agent types
  config?: AgentConfigOptions;
}

export interface ReActAgentCreateOptions {
  type: AgentType.REACT | string; // Allow unique ReAct types
  userId: UserIdType;
  conversationId: ConversationIdType;
  settings: ReActAgentConfig; // Required complete config for ReAct agents
  config?: AgentConfigOptions;
}

export interface GraphAgentCreateOptions {
  type: AgentType.GRAPH;
  userId: UserIdType;
  conversationId: ConversationIdType;
  settings: GraphAgentConfig; // Required complete config for Graph agents
  config?: AgentConfigOptions;
}

@Injectable()
export class AgentService extends EventEmitter {
  constructor(
    @Inject(AgentFactoryService)
    private readonly factoryService: AgentFactoryService,
    @Inject(AgentValidationService)
    private readonly validationService: AgentValidationService,
    @Inject(AgentConfigurationService)
    private readonly configService: AgentConfigurationService,
    @Inject(AgentEventService) private readonly eventService: AgentEventService,
    @Inject(AgentSessionService)
    private readonly sessionService: AgentSessionService,
    @Inject(AgentExecutionService)
    private readonly executionService: AgentExecutionService,
    private readonly logger: MyLogger,
  ) {
    super();

    this.logger.info(
      'AgentService initializing with all agent services',
      AgentService.name,
    );

    // Forward events from the event service
    this.eventService.on('agent-event', (data) =>
      this.emit('agent-event', data),
    );
    this.eventService.on('event-filtering-updated', (data) =>
      this.emit('event-filtering-updated', data),
    );

    this.logger.info(
      'AgentService initialized with event forwarding configured',
      AgentService.name,
    );
  }

  /**
   * Create an agent instance with enhanced session management
   */
  async createAgent(
    options:
      | AgentCreateOptions
      | ReActAgentCreateOptions
      | GraphAgentCreateOptions,
  ): Promise<BaseAgent> {
    const {
      type,
      userId,
      conversationId,
      settings = {},
      config = {},
    } = options;

    this.logger.info(
      `Creating agent of type: ${type} for user: ${userId}, conversation: ${conversationId}`,
      AgentService.name,
    );

    // Validate options
    this.validationService.validateAgentOptions(options);

    const instanceKey = this.getInstanceKey(userId, conversationId, type);

    // Check if agent already exists
    if (this.sessionService.hasAgent(userId, conversationId, type)) {
      this.logger.info(
        `Agent already exists, returning existing instance: ${instanceKey}`,
        AgentService.name,
      );
      return this.sessionService.getAgentInstance(
        userId,
        conversationId,
        type,
      )!;
    }

    // Validate agent configuration by type
    if (settings && Object.keys(settings).length > 0) {
      this.logger.info(
        `Validating agent configuration for type: ${type}`,
        AgentService.name,
      );
      this.validationService.validateAgentConfigByType(type, settings);
    }

    // Create the agent instance
    let agent: BaseAgent;

    try {
      this.logger.info(
        `Creating new agent instance of type: ${type}`,
        AgentService.name,
      );
      agent = await this.factoryService.createAgentByType(
        type,
        userId,
        conversationId,
        settings,
        config,
      );

      // Create session state
      this.logger.info(
        `Creating session state for agent: ${instanceKey}`,
        AgentService.name,
      );
      const sessionState = this.sessionService.createSession(
        userId,
        conversationId,
        type,
        agent,
      );

      // Set up comprehensive event forwarding and user interaction handling
      this.logger.info(
        `Setting up event forwarding and user interaction handling for agent: ${instanceKey}`,
        AgentService.name,
      );
      this.eventService.setupAgentEventForwarding(
        agent,
        userId,
        conversationId,
        type,
      );
      this.sessionService.setupUserInteractionHandling(agent, sessionState);

      // Update session state
      this.sessionService.updateSessionStatus(
        userId,
        conversationId,
        type,
        'idle',
      );

      this.emit('agent-session-created', {
        instanceKey,
        agentType: type,
        userId,
        conversationId,
        timestamp: new Date(),
      });

      this.logger.info(
        `Successfully created agent: ${instanceKey}`,
        AgentService.name,
      );
      return agent;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create agent: ${instanceKey}: ${info.message}\n` +
          (info.stack || ''),
        AgentService.name,
      );
      // Clean up on failure
      this.sessionService.removeAgent(userId, conversationId, type);
      throw new Error(info.message);
    }
  }

  /**
   * Get an existing agent instance or create a new one
   */
  async getAgent(options: AgentCreateOptions): Promise<BaseAgent> {
    const { userId, conversationId, type } = options;

    this.logger.info(
      `Getting agent of type: ${type} for user: ${userId}, conversation: ${conversationId}`,
      AgentService.name,
    );

    // Check if we have an existing instance
    const existingAgent = this.sessionService.getAgentInstance(
      userId,
      conversationId,
      type,
    );
    if (existingAgent && existingAgent.state === AgentState.READY) {
      this.logger.info(
        `Found existing ready agent: ${this.getInstanceKey(userId, conversationId, type)}`,
        AgentService.name,
      );
      return existingAgent;
    }

    // Create a new instance
    this.logger.info(
      `No existing ready agent found, creating new instance`,
      AgentService.name,
    );
    return this.createAgent(options);
  }

  /**
   * Execute an agent operation
   */
  async executeAgent(
    agent: BaseAgent,
    options: AgentExecuteOptions,
  ): Promise<string | AsyncIterable<any>> {
    this.logger.info(
      `Executing agent: ${agent.constructor.name}`,
      AgentService.name,
    );
    return this.executionService.executeAgent(agent, options);
  }

  /**
   * Create and execute an agent in one operation
   */
  async createAndExecute(
    createOptions: AgentCreateOptions,
    executeOptions: AgentExecuteOptions,
  ): Promise<string | AsyncIterable<any>> {
    const agent = await this.createAgent(createOptions);
    return this.executeAgent(agent, executeOptions);
  }
  /**
   * Remove an agent instance from memory
   */
  removeAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): void {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    this.logger.info(`Removing agent: ${instanceKey}`, AgentService.name);

    const agent = this.sessionService.removeAgent(userId, conversationId, type);

    if (agent) {
      this.logger.info(
        `Cleaning up agent resources: ${instanceKey}`,
        AgentService.name,
      );
      // Remove event forwarding
      this.eventService.removeAgentEventForwarding(agent);
      // Abort any ongoing operations
      agent.abort();
    }
  }

  /**
   * Clear all agent instances
   */
  clearAllAgents(): void {
    // Enumerate all agents and detach listeners/abort before clearing sessions
    const all = this.sessionService.getAllAgents();
    for (const entry of all) {
      this.eventService.removeAgentEventForwarding(entry.agent);
      try {
        entry.agent.abort();
      } catch (e) {
        const info = getErrorInfo(e);
        this.logger.warn(
          `Error aborting agent ${entry.userId}:${entry.conversationId}:${entry.type} - ${info.message}`,
          AgentService.name,
        );
      }
    }
    this.sessionService.clearAllAgents();
  }

  /**
   * Get agent statistics
   */
  getAgentStats(): {
    totalInstances: number;
    instancesByType: Record<string, number>;
    instancesByState: Record<string, number>;
    sessionsByStatus: Record<string, number>;
  } {
    return this.sessionService.getAgentStats();
  }
  /**
   * Reconfigure an existing agent with new settings
   */
  async reconfigureAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    config: AgentConfigOptions,
  ): Promise<void> {
    const agent = await this.getAgent({ type, userId, conversationId });
    await this.executionService.reconfigureAgent(agent, config);
  }
  /**
   * Switch LLM provider for an agent
   */
  async switchAgentProvider(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    intelligenceConfig: AgentIntelligenceConfig,
  ): Promise<void> {
    const agent = await this.getAgent({ type, userId, conversationId });
    await this.executionService.switchAgentProvider(agent, intelligenceConfig);
  }
  /**
   * Restore a checkpoint for an agent
   */
  async restoreAgentCheckpoint(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    searchOptions: {
      id?: string;
      name?: string;
      description?: string;
    },
  ): Promise<{ success: boolean; data: any | undefined }> {
    const agent = await this.getAgent({ type, userId, conversationId });
    return this.executionService.restoreAgentCheckpoint(agent, searchOptions);
  }
  /**
   * Switch conversation for an agent
   */
  async switchAgentConversation(
    userId: UserIdType,
    currentConversationId: ConversationIdType,
    newConversationId: ConversationIdType,
    type: AgentType | string,
  ): Promise<void> {
    const agent = await this.getAgent({
      type,
      userId,
      conversationId: currentConversationId,
    });
    await this.executionService.switchAgentConversation(
      agent,
      newConversationId,
    );

    // Update the session instance key mapping
    this.sessionService.updateInstanceKey(
      userId,
      currentConversationId,
      newConversationId,
      type,
    );
  }
  /**
   * Switch memory configuration for an agent
   */
  async switchAgentMemory(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    memoryConfig: AgentMemoryConfig,
  ): Promise<void> {
    const agent = await this.getAgent({ type, userId, conversationId });
    await this.executionService.switchAgentMemory(agent, memoryConfig);
  }
  /**
   * Invoke an agent with a single request (non-streaming)
   */
  async invokeAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [] = [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    const agent = await this.getAgent({ type, userId, conversationId });
    return this.executionService.invokeAgent(
      agent,
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );
  }
  /**
   * Stream responses from an agent
   */
  async streamAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [] = [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    const agent = await this.getAgent({ type, userId, conversationId });
    return this.executionService.streamAgent(
      agent,
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );
  }
  /**
   * Send a correction/interruption to an agent
   */
  async correctAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
    correctionInput: string,
    context: string,
  ): Promise<void> {
    const agent = await this.getAgent({ type, userId, conversationId });
    await this.executionService.correctAgent(agent, correctionInput, context);
  }
  /**
   * Abort current operation for an agent
   */
  async abortAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): Promise<void> {
    const agent = this.sessionService.getAgentInstance(
      userId,
      conversationId,
      type,
    );

    if (agent) {
      await this.executionService.abortAgent(agent);
    }
  }
  /**
   * Get the current state of an agent
   */
  getAgentState(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): AgentState | null {
    const agent = this.sessionService.getAgentInstance(
      userId,
      conversationId,
      type,
    );
    return agent ? agent.state : null;
  }
  /**
   * Check if an agent instance exists
   */
  hasAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): boolean {
    return this.sessionService.hasAgent(userId, conversationId, type);
  }
  /**
   * Get all agent instances for a user
   */
  getUserAgents(userId: UserIdType): Array<{
    conversationId: ConversationIdType;
    type: AgentType | string; // Support unique types
    state: AgentState;
    agent: BaseAgent;
  }> {
    return this.sessionService.getUserAgents(userId).map((item) => ({
      conversationId: item.conversationId,
      type: item.type,
      state: item.state,
      agent: item.agent,
    }));
  }
  /**
   * Get all agent instances for a conversation
   */
  getConversationAgents(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Array<{
    type: AgentType | string; // Support unique types
    state: AgentState;
    agent: BaseAgent;
  }> {
    return this.sessionService
      .getConversationAgents(userId, conversationId)
      .map((item) => ({
        type: item.type,
        state: item.state,
        agent: item.agent,
      }));
  }

  // Graph Agent specific methods

  /**
   * Pause a GraphAgent with specific options
   */
  async pauseGraphAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    options?: {
      pauseBeforeNodes?: boolean;
      pauseAfterNodes?: boolean;
      pauseBetweenNodes?: boolean;
      specificBranches?: NodeIdType[];
    },
  ): Promise<void> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    await this.executionService.pauseGraphAgent(agent, options);
  }

  /**
   * Resume a paused GraphAgent
   */
  async resumeGraphAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Promise<void> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    await this.executionService.resumeGraphAgent(agent);
  }

  /**
   * Continue GraphAgent execution with new input (after checkpoint restoration)
   */
  async continueGraphAgentWithInput(
    userId: UserIdType,
    conversationId: ConversationIdType,
    newInput: string,
    options?: {
      tokenTarget?: number;
      contentSequence?: string[];
    },
  ): Promise<AsyncIterable<any>> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return this.executionService.continueGraphAgentWithInput(
      agent,
      newInput,
      options,
    );
  }

  /**
   * Restore GraphAgent from a checkpoint
   */
  async restoreGraphAgentFromCheckpoint(
    userId: UserIdType,
    conversationId: ConversationIdType,
    checkpointId: string,
  ): Promise<boolean> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return this.executionService.restoreGraphAgentFromCheckpoint(
      agent,
      checkpointId,
    );
  }

  /**
   * Get GraphAgent execution state
   */
  async getGraphAgentExecutionState(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Promise<{
    isPaused: boolean;
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
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return this.executionService.getGraphAgentExecutionState(agent);
  }

  /**
   * Update GraphAgent configuration while paused
   */
  async updateGraphAgentConfiguration(
    userId: UserIdType,
    conversationId: ConversationIdType,
    updates: {
      nodes?: Partial<any>[];
      edges?: Partial<any>[];
      saveToAgent?: boolean;
    },
  ): Promise<boolean> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return this.executionService.updateGraphAgentConfiguration(agent, updates);
  }

  /**
   * Stream execution of a GraphAgent with pause support
   */
  async streamGraphAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    options: AgentExecuteOptions,
  ): Promise<AsyncIterable<any>> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return this.executionService.streamGraphAgent(agent, options);
  }

  // Graph Agent User Interaction Methods

  /**
   * Provide user input for a GraphAgent node awaiting input
   */
  async provideGraphAgentUserInput(
    userId: UserIdType,
    conversationId: ConversationIdType,
    nodeId: NodeIdType,
    input: string,
  ): Promise<void> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    agent.provideUserInput(nodeId, input);
  }

  /**
   * Provide user approval for a GraphAgent node awaiting approval
   */
  async provideGraphAgentUserApproval(
    userId: UserIdType,
    conversationId: ConversationIdType,
    nodeId: NodeIdType,
    approved: boolean,
  ): Promise<void> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    agent.provideUserApproval(nodeId, approved);
  }

  /**
   * Handle user chat actions for a GraphAgent node (continue with input or end chat)
   */
  async provideGraphAgentChatAction(
    userId: UserIdType,
    conversationId: ConversationIdType,
    nodeId: NodeIdType,
    action: 'continue' | 'end',
    input?: string,
  ): Promise<void> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    agent.provideChatAction(nodeId, action, input);
  }

  /**
   * Get all GraphAgent nodes currently awaiting user interaction
   */
  async getGraphAgentPendingUserInteractions(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Promise<
    Array<{
      nodeId: NodeIdType;
      nodeName: string;
      type: 'approval' | 'input' | 'chat_continuation';
      timestamp: Date;
      context?: any;
    }>
  > {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return agent.getPendingUserInteractions();
  }

  /**
   * Get conversation history for a specific GraphAgent node in continuous chat mode
   */
  async getGraphAgentNodeConversationHistory(
    userId: UserIdType,
    conversationId: ConversationIdType,
    nodeId: NodeIdType,
  ): Promise<Array<{
    message: string;
    isUser: boolean;
    timestamp: Date;
  }> | null> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return agent.getNodeConversationHistory(nodeId);
  }

  /**
   * Check if the GraphAgent has any nodes awaiting user interaction
   */
  async hasGraphAgentAwaitingUserInteraction(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Promise<boolean> {
    const agent = await this.getAgent({
      type: AgentType.GRAPH,
      userId,
      conversationId,
    });

    if (!(agent instanceof GraphAgent)) {
      throw new Error('Agent is not a GraphAgent');
    }

    return agent.hasAwaitingUserInteraction();
  }

  // Event management methods (delegated to EventService)

  /**
   * Get event forwarding options for agent creation
   */
  public getEventForwardingOptions(): {
    enableEventForwarding: boolean;
    eventFilters?: string[];
    includeRawData?: boolean;
  } {
    return this.eventService.getEventForwardingOptions();
  }

  /**
   * Set event filtering options
   */
  public setEventFiltering(options: {
    eventFilters?: string[];
    enableEventForwarding?: boolean;
    includeRawData?: boolean;
  }): void {
    this.eventService.setEventFiltering(options);
  }
  /**
   * Subscribe to specific agent events for a particular agent instance
   */
  public subscribeToAgentEvents(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    eventNames: string[],
    callback: (eventData: any) => void,
  ): () => void {
    return this.eventService.subscribeToAgentEvents(
      userId,
      conversationId,
      type,
      eventNames,
      callback,
    );
  }
  /**
   * Subscribe to all events from a specific agent instance
   */
  public subscribeToAgentInstance(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    callback: (eventData: any) => void,
  ): () => void {
    return this.eventService.subscribeToAgentInstance(
      userId,
      conversationId,
      type,
      callback,
    );
  }
  /**
   * Subscribe to specific event types across all agents
   */
  public subscribeToEventType(
    eventName: string,
    callback: (eventData: any) => void,
    filterOptions?: {
      agentType?: AgentType | string; // Support unique types
      userId?: UserIdType;
      conversationId?: ConversationIdType;
    },
  ): () => void {
    return this.eventService.subscribeToEventType(
      eventName,
      callback,
      filterOptions,
    );
  }
  /**
   * Get real-time agent activity stream
   */
  public getAgentActivityStream(options?: {
    includeEventTypes?: string[];
    excludeEventTypes?: string[];
    agentType?: AgentType | string; // Support unique types
    userId?: UserIdType;
    conversationId?: ConversationIdType;
  }): EventEmitter {
    return this.eventService.getAgentActivityStream(options);
  }
  /**
   * Generate instance key for agent identification
   */
  private getInstanceKey(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): string {
    return `${userId}:${conversationId}:${type}`;
  }
}
