// Connects ReAct agents via a graph for customized user experiences

import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ReActAgent } from './react';
import BaseAgent from './base';
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
  GraphAgent as GraphAgentConfig,
  Node,
  Edge,
  AgentState,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
} from '../types/agent.entity';
import { EdgeIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  GraphAgentIdType,
  NodeIdType,
  UserIdType,
  ConversationIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { GraphValidator, GraphValidationResult } from '../utils/graph-validator';

interface NodeExecutionContext {
  node: Node;
  reactAgent: ReActAgent;
  startTime: Date;
  status:
    | 'running'
    | 'completed'
    | 'failed'
    | 'paused'
    | 'awaiting_user_input'
    | 'awaiting_approval';
  result?: string;
  error?: string;
  pausePoint?: 'before-node' | 'after-node' | 'between-nodes';
  userInteractionState?: {
    mode: 'continuous_chat' | 'single_react_cycle';
    chatRounds: number;
    pendingApproval?: {
      output: string;
      confidence?: number;
      timestamp: Date;
    };
    conversationHistory: Array<{
      message: string;
      isUser: boolean;
      timestamp: Date;
    }>;
  };
}

interface GraphExecutionState {
  currentNodes: Map<NodeIdType, NodeExecutionContext>;
  executionHistory: Array<{
    nodeId: NodeIdType;
    nodeName: string;
    input: string;
    output: string;
    timestamp: Date;
    executionTime: number;
  }>;
  // Queue of recently completed nodes to ensure stream yields their outputs
  completedNodesQueue: NodeExecutionContext[];
  // Track nodes whose outputs have already been yielded in the current stream
  emittedNodeIds: Set<NodeIdType>;
  activeEdges: Edge[];
  isPaused: boolean;
  pausedBranches: Set<NodeIdType>; // Specific branches that are paused
  pauseSettings: {
    pauseBeforeNodes: boolean;
    pauseAfterNodes: boolean;
    pauseBetweenNodes: boolean;
    autoCheckpoint: boolean;
  };
  currentInput?: string; // Store current input when paused
  pendingUserInteractions: Map<
    NodeIdType,
    {
      type: 'approval' | 'input' | 'chat_continuation';
      nodeContext: NodeExecutionContext;
      timestamp: Date;
    }
  >; // Track nodes awaiting user interaction
  // New fields for flow control
  joinNodeTracker: Map<
    NodeIdType,
    {
      requiredPredecessors: NodeIdType[];
      completedPredecessors: Set<NodeIdType>;
      isReady: boolean;
    }
  >; // Track join node readiness
  exclusiveEdgeGroups: Map<string, Set<EdgeIdType>>; // Track exclusive edge groups
  // Rollback support
  rollbackCheckpoints: Array<{
    nodeId: NodeIdType;
    nodeName: string;
    timestamp: Date;
    executionHistory: GraphExecutionState['executionHistory'];
    currentNodes: Map<NodeIdType, NodeExecutionContext>;
    joinNodeTracker: Map<NodeIdType, {
      requiredPredecessors: NodeIdType[];
      completedPredecessors: Set<NodeIdType>;
      isReady: boolean;
    }>;
  }>;
  maxRollbackCheckpoints: number;
}

@Injectable()
export default class GraphAgent extends BaseAgent {
  protected _id: GraphAgentIdType;
  public state: AgentState = AgentState.INITIALIZING;
  protected settings: GraphAgentConfig;
  protected userId: UserIdType;
  protected conversationId: ConversationIdType;
  protected abortController: AbortController | null = null;
  protected executionState: GraphExecutionState;

  // Core dependencies
  protected tools: Toolkit;
  protected memory: AgentMemory;
  protected llm: LLMService;
  protected conversationRepository: ConversationRepository;
  protected vectorStore: VectorStoreService;
  protected checkpointService: CheckpointService;
  protected loaderService: LoaderService;

  // Configuration
  protected memoryConfig: AgentMemoryConfig;
  protected checkpointConfig: AgentCheckpointConfig;
  protected intelligenceConfig: AgentIntelligenceConfig;
  protected loaderConfig: AgentLoaderConfig;
  protected textsplitterConfig: TextSplitterConfig;
  protected embedderConfig: EmbeddingOptions;

  constructor(
    @Inject(Toolkit) tools: Toolkit,
    @Inject(AgentMemory) memory: AgentMemory,
    @Inject(LLMService) llm: LLMService,
    @Inject(ConversationRepository)
    conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) vectorStore: VectorStoreService,
    @Inject(CheckpointService) checkpointService: CheckpointService,
    @Inject(LoaderService) loaderService: LoaderService,
    settings: GraphAgentConfig,
    config: {
      memoryConfig: AgentMemoryConfig;
      checkpointConfig: AgentCheckpointConfig;
      intelligenceConfig: AgentIntelligenceConfig;
      loaderConfig: AgentLoaderConfig;
      textsplitterConfig: TextSplitterConfig;
      embedderConfig: EmbeddingOptions;
    },
    userId: UserIdType,
    conversationId: ConversationIdType,
    logger: MyLogger,
  ) {
    // Call BaseAgent constructor
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

    this.logger.info('GraphAgent initializing', GraphAgent.name);

    // Store dependencies
    this.tools = tools;
    this.memory = memory;
    this.llm = llm;
    this.conversationRepository = conversationRepository;
    this.vectorStore = vectorStore;
    this.checkpointService = checkpointService;
    this.loaderService = loaderService;

    // Store configuration
    this.memoryConfig = config.memoryConfig;
    this.checkpointConfig = config.checkpointConfig;
    this.intelligenceConfig = config.intelligenceConfig;
    this.loaderConfig = config.loaderConfig;
    this.textsplitterConfig = config.textsplitterConfig;
    this.embedderConfig = config.embedderConfig;

    // Validate and store settings
    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'GraphAgent configuration validation failed - settings not provided or invalid',
        GraphAgent.name,
      );
      throw new Error('GraphAgent requires complete configuration settings');
    }

    this.settings = settings;
    this._id = this.settings._id;
    this.state = this.settings.state || AgentState.INITIALIZING;
    this.userId = userId;
    this.conversationId = conversationId;

    // Defensive defaults: some callers provide partial settings without nodes/edges.
    // Ensure we always operate on arrays to avoid undefined.length TypeErrors during initialization.
    if (!Array.isArray((this.settings as any).nodes)) {
      (this.settings as any).nodes = [];
      this.logger.warn(
        'GraphAgent received settings without nodes array - defaulting to empty array',
        GraphAgent.name,
      );
    }
    if (!Array.isArray((this.settings as any).edges)) {
      (this.settings as any).edges = [];
      this.logger.warn(
        'GraphAgent received settings without edges array - defaulting to empty array',
        GraphAgent.name,
      );
    }

    this.logger.debug(
      `GraphAgent settings loaded - ID: ${this._id}, nodes: ${this.settings.nodes.length}, edges: ${this.settings.edges.length}`,
      GraphAgent.name,
    );

    // Initialize execution state
    this.executionState = {
      currentNodes: new Map(),
      executionHistory: [],
      completedNodesQueue: [],
      emittedNodeIds: new Set<NodeIdType>(),
      activeEdges: this.settings.edges,
      isPaused: false,
      pausedBranches: new Set(),
      pauseSettings: {
        pauseBeforeNodes: false,
        pauseAfterNodes: false,
        pauseBetweenNodes: false,
        autoCheckpoint: true,
      },
      pendingUserInteractions: new Map(),
      joinNodeTracker: new Map(),
      exclusiveEdgeGroups: new Map(),
      rollbackCheckpoints: [],
      maxRollbackCheckpoints: 10, // Keep last 10 checkpoints for rollback
    };

    this.emit('graph-agent-initializing', {
      agentId: this._id,
      nodeCount: this.settings.nodes.length,
      edgeCount: this.settings.edges.length,
      timestamp: new Date(),
    });

    this.init();
  }

  /**
   * Public readonly view of execution state for external services.
   * Provides a shallow snapshot to avoid external mutation of internals.
   */
  public getExecutionState(): Readonly<{
    isPaused: boolean;
    currentNodes: Map<string, any>;
    pausedBranches: Set<NodeIdType>;
    executionHistory: GraphExecutionState['executionHistory'];
  }> {
    return {
      isPaused: this.executionState.isPaused,
      currentNodes: new Map(this.executionState.currentNodes),
      pausedBranches: new Set(this.executionState.pausedBranches),
      executionHistory: this.executionState.executionHistory.slice(),
    } as const;
  }

  /**
   * Initialize flow control structures for exclusive edges and join nodes
   */
  private initializeFlowControl(): void {
    this.logger.debug(
      'Initializing flow control structures for GraphAgent',
      GraphAgent.name,
    );
    // Group edges by exclusive groups
    for (const edge of this.settings.edges) {
      if (edge.exclusiveGroup) {
        if (!this.executionState.exclusiveEdgeGroups.has(edge.exclusiveGroup)) {
          this.executionState.exclusiveEdgeGroups.set(
            edge.exclusiveGroup,
            new Set(),
          );
        }
        this.executionState.exclusiveEdgeGroups
          .get(edge.exclusiveGroup)!
          .add(edge._id);
      }

      // Initialize join node tracking
      if (edge.isJoin && edge.joinPredecessors) {
        this.executionState.joinNodeTracker.set(edge.to, {
          requiredPredecessors: [...edge.joinPredecessors],
          completedPredecessors: new Set(),
          isReady: false,
        });
        this.logger.debug(
          `Initialized join node tracking for ${edge.to} with ${edge.joinPredecessors.length} predecessors`,
          GraphAgent.name,
        );
      }
    }

    this.logger.debug(
      `Flow control initialized - exclusive groups: ${this.executionState.exclusiveEdgeGroups.size}, join nodes: ${this.executionState.joinNodeTracker.size}`,
      GraphAgent.name,
    );
  }

  /**
   * Fix Node configurations to ensure consistency
   */
  private fixNodeConfigurations(): void {
    this.logger.debug(
      'Fixing node configurations for consistency',
      GraphAgent.name,
    );
    for (const node of this.settings.nodes) {
      if (node.ReActConfig?.cot) {
        // If ReAct is disabled, force maxSteps to 1
        if (
          !node.ReActConfig.cot.enabled &&
          node.ReActConfig.cot.maxSteps !== 1
        ) {
          this.logger.debug(
            `Fixing node ${node.name} - setting maxSteps to 1 for disabled ReAct`,
            GraphAgent.name,
          );
          node.ReActConfig.cot.maxSteps = 1;

          this.emit('graph-node-config-fixed', {
            agentId: this._id,
            nodeId: node._id,
            nodeName: node.name,
            fix: 'maxSteps forced to 1 when ReAct disabled',
            timestamp: new Date(),
          });
        }
      }
    }
    this.logger.debug('Node configuration fixes completed', GraphAgent.name);
  }

  /**
   * Validate graph structure and detect issues
   */
  private validateGraphStructure(): GraphValidationResult {
    this.logger.debug('Validating graph structure', GraphAgent.name);
    const validation = GraphValidator.validate(
      this.settings.nodes,
      this.settings.edges,
    );

    this.logger.debug(
      `Graph validation complete - isValid: ${validation.isValid}, errors: ${validation.errors.length}, warnings: ${validation.warnings.length}, cycles: ${validation.cycles.length}`,
      GraphAgent.name,
    );

    return validation;
  }

  protected async init(): Promise<void> {
    this.logger.info('Initializing GraphAgent', GraphAgent.name);
    try {
      // Validate graph structure
      const validation = this.validateGraphStructure();
      if (!validation.isValid) {
        throw new Error(
          `Graph validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Log warnings
      if (validation.warnings.length > 0) {
        this.logger.warn(
          `Graph validation warnings: ${validation.warnings.join(', ')}`,
          GraphAgent.name,
        );
        this.emit('graph-validation-warnings', {
          agentId: this._id,
          warnings: validation.warnings,
          hasCycles: validation.hasCycles,
          cycles: validation.cycles,
          timestamp: new Date(),
        });
      }

      // Initialize flow control structures
      this.initializeFlowControl();
      this.fixNodeConfigurations(); // Fix node configurations on load

      this.state = AgentState.READY;
      this.logger.info(
        'GraphAgent initialization completed successfully',
        GraphAgent.name,
      );

      this.emit('graph-agent-ready', {
        agentId: this._id,
        nodeCount: this.settings.nodes.length,
        edgeCount: this.settings.edges.length,
        validationWarnings: validation.warnings.length,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'GraphAgent initialization failed\n' + (info.stack || ''),
        GraphAgent.name,
      );
      this.state = AgentState.ERRORED;
      this.emit('graph-agent-error', {
        agentId: this._id,
        error: info.message,
        timestamp: new Date(),
      });
      throw new Error(info.message);
    }
  }

  /**
   * Main entry point for graph execution
   */
  public async invoke(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    this.logger.info('Starting GraphAgent invoke operation', GraphAgent.name);
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

    this.logger.info(
      `GraphAgent invoke completed - result length: ${result.length}`,
      GraphAgent.name,
    );
    return result;
  }

  /**
   * Streaming execution of the graph
   */
  public async stream(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    this.logger.info('Starting GraphAgent stream operation', GraphAgent.name);
    this.logger.debug(
      `Input length: ${input.length}, messages: ${latestMessages.length}`,
      GraphAgent.name,
    );

    // Handle empty array case by creating proper type for internal use
    const messages =
      latestMessages.length === 0
        ? ([] as unknown as [HumanMessage, ...AIMessage[]])
        : (latestMessages as [HumanMessage, ...AIMessage[]]);
    return this._streamImplementation(
      input,
      messages,
      tokenTarget,
      contentSequence,
    );
  }

  private async *_streamImplementation(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): AsyncGenerator<any, void, unknown> {
    this.logger.info(
      'Starting GraphAgent stream implementation',
      GraphAgent.name,
    );

    if (this.state !== AgentState.READY) {
      this.logger.error(
        `GraphAgent not ready for execution - current state: ${this.state}`,
        GraphAgent.name,
      );
      throw new Error(`GraphAgent not ready. Current state: ${this.state}`);
    }

    this.state = AgentState.RUNNING;
    this.abortController = new AbortController();

    try {
      // Reset per-run emitted tracking
      this.executionState.emittedNodeIds.clear();

      this.emit('graph-execution-start', {
        agentId: this._id,
        input: input.substring(0, 100) + '...',
        timestamp: new Date(),
      });

      // Determine entry nodes based on command detection
      const entryNodes = this.determineEntryNodes(input);

      if (entryNodes.length === 0) {
        this.logger.error(
          'No valid entry nodes found for input',
          GraphAgent.name,
        );
        throw new Error('No valid entry nodes found for input');
      }

      this.logger.debug(
        `Found ${entryNodes.length} entry nodes for execution`,
        GraphAgent.name,
      );

      this.emit('graph-entry-nodes-determined', {
        agentId: this._id,
        entryNodeIds: entryNodes.map((n) => n._id),
        entryNodeNames: entryNodes.map((n) => n.name),
        detectedCommand: this.extractCommand(input),
        timestamp: new Date(),
      });

      // Process input for each entry node (strip command if present)
      const processedInput = this.processInput(input);

      // Execute entry nodes in parallel
      const executionPromises = entryNodes.map((node) =>
        this.executeNode(
          node,
          processedInput,
          latestMessages,
          tokenTarget,
          contentSequence,
        ),
      );

      // Stream results as they come in
      for (const promise of executionPromises) {
        try {
          const nodeResult = await promise;
          yield nodeResult.output;

          // Mark this node as already emitted to avoid duplicate yields from the completion queue
          this.executionState.emittedNodeIds.add(nodeResult.nodeId);

          // Process edges from completed node
          await this.processNodeCompletion(
            nodeResult,
            latestMessages,
            tokenTarget,
            contentSequence,
          );
        } catch (error) {
          this.emit('graph-node-execution-error', {
            agentId: this._id,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });
          yield `Error in node execution: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      // Continue processing any triggered nodes (either running or queued completions)
      while (
        this.executionState.currentNodes.size > 0 ||
        this.executionState.completedNodesQueue.length > 0
      ) {
        // Wait for next node completion or queued completion
        const completedNode = await this.waitForNextCompletion();
        if (!completedNode) break; // nothing else to process

        // Yield only if not already emitted (waitForNextCompletion should already skip emitted)
        yield completedNode.result || '';

        // Mark as emitted
        this.executionState.emittedNodeIds.add(completedNode.node._id);

        await this.processNodeCompletion(
          {
            nodeId: completedNode.node._id,
            nodeName: completedNode.node.name,
            output: completedNode.result || '',
            executionTime: Date.now() - completedNode.startTime.getTime(),
          },
          latestMessages,
          tokenTarget,
          contentSequence,
        );
      }

      this.state = AgentState.READY;
      this.logger.info(
        `GraphAgent execution completed successfully - ${this.executionState.executionHistory.length} nodes executed`,
        GraphAgent.name,
      );
      this.emit('graph-execution-complete', {
        agentId: this._id,
        totalNodes: this.executionState.executionHistory.length,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'GraphAgent execution failed\n' + (info.stack || ''),
        GraphAgent.name,
      );
      this.state = AgentState.ERRORED;
      this.emit('graph-execution-error', {
        agentId: this._id,
        error: info.message,
        timestamp: new Date(),
      });
      throw new Error(info.message);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Determine which nodes should be entry points based on command detection
   */
  private determineEntryNodes(input: string): Node[] {
    this.logger.debug(
      'Determining entry nodes for GraphAgent execution',
      GraphAgent.name,
    );
    const command = this.extractCommand(input);

    if (command) {
      this.logger.debug(`Command detected: ${command}`, GraphAgent.name);
      // Find nodes with matching command
      const commandNodes = this.settings.nodes.filter(
        (node) => node.command === command,
      );
      if (commandNodes.length > 0) {
        this.logger.debug(
          `Found ${commandNodes.length} nodes matching command: ${command}`,
          GraphAgent.name,
        );
        return commandNodes;
      }
    }

    // Fall back to nodes with '_newmessage' command (no command detected)
    const newMessageNodes = this.settings.nodes.filter(
      (node) => node.command === '_newmessage',
    );
    if (newMessageNodes.length > 0) {
      this.logger.debug(
        `Using ${newMessageNodes.length} _newmessage nodes as entry points`,
        GraphAgent.name,
      );
      return newMessageNodes;
    }

    // If no command nodes exist, use nodes with no incoming edges as entry points
    const nodesWithNoIncomingEdges = this.settings.nodes.filter((node) => {
      return !this.settings.edges.some((edge) => edge.to === node._id);
    });

    if (nodesWithNoIncomingEdges.length > 0) {
      this.logger.debug(
        `Using ${nodesWithNoIncomingEdges.length} nodes with no incoming edges as fallback entry points`,
        GraphAgent.name,
      );
      this.emit('graph-using-fallback-entry-nodes', {
        agentId: this._id,
        nodeIds: nodesWithNoIncomingEdges.map((n) => n._id),
        nodeNames: nodesWithNoIncomingEdges.map((n) => n.name),
        reason: 'No command nodes found, using nodes with no incoming edges',
        timestamp: new Date(),
      });
      return nodesWithNoIncomingEdges;
    }

    this.logger.warn(
      'No entry nodes found for GraphAgent execution',
      GraphAgent.name,
    );
    return [];
  }

  /**
   * Extract command from input (commands start with /)
   */
  private extractCommand(input: string): string | null {
    const trimmed = input.trim();
    if (trimmed.startsWith('/')) {
      const spaceIndex = trimmed.indexOf(' ');
      const command =
        spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
      this.logger.debug(`Extracted command: ${command}`, GraphAgent.name);
      return command;
    }
    return null;
  }

  /**
   * Process input by removing command if present
   */
  private processInput(input: string): string {
    const command = this.extractCommand(input);
    if (command) {
      const processedInput = input.substring(command.length).trim();
      this.logger.debug(
        `Processed input - removed command, length: ${processedInput.length}`,
        GraphAgent.name,
      );
      return processedInput;
    }
    return input;
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: Node,
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<{
    nodeId: NodeIdType;
    nodeName: string;
    output: string;
    executionTime: number;
  }> {
    this.logger.info(
      `Executing node: ${node.name} (${node._id})`,
      GraphAgent.name,
    );
    const startTime = new Date();

    // Create rollback checkpoint before executing node
    this.createRollbackCheckpoint(node._id, node.name);

    // Check if we should pause before node execution
    if (this.shouldPause('before-node', node._id)) {
      this.logger.debug(
        `Pausing before node execution: ${node.name}`,
        GraphAgent.name,
      );
      this.emit('graph-node-paused', {
        agentId: this._id,
        nodeId: node._id,
        nodeName: node.name,
        pausePoint: 'before-node',
        timestamp: new Date(),
      });

      // Create checkpoint before node
      if (this.executionState.pauseSettings.autoCheckpoint) {
        await this.createGraphCheckpoint(
          'graph-node-start',
          node._id,
          `before-${node.name}`,
        );
      }

      await this.waitForResume();
    }

    this.emit('graph-node-execution-start', {
      agentId: this._id,
      nodeId: node._id,
      nodeName: node.name,
      input: input.substring(0, 100) + '...',
      timestamp: startTime,
    });

    try {
      // Create a new ReActAgent for this node
      this.logger.debug(
        `Creating ReActAgent for node: ${node.name}`,
        GraphAgent.name,
      );
      const reactAgent = this.createReActAgentForNode(node);

      // Store execution context
      const executionContext: NodeExecutionContext = {
        node,
        reactAgent,
        startTime,
        status: 'running',
      };
      this.executionState.currentNodes.set(node._id, executionContext);

      // Initialize user interaction state if configured
      if (node.userInteraction) {
        executionContext.userInteractionState = {
          mode: node.userInteraction.mode,
          chatRounds: 0,
          conversationHistory: [],
        };
      }

      // Collect context from contextFrom edges
      const contextMessages = await this.collectContextMessages(
        node._id,
        latestMessages,
      );

      // Handle different execution modes
      let result: string;
      if (node.userInteraction?.mode === 'continuous_chat') {
        this.logger.debug(
          `Using continuous chat mode for node: ${node.name}`,
          GraphAgent.name,
        );
        result = await this.executeContinuousChat(
          node,
          input,
          contextMessages,
          executionContext,
          tokenTarget,
          contentSequence,
        );
      } else {
        this.logger.debug(
          `Using single ReAct cycle mode for node: ${node.name}`,
          GraphAgent.name,
        );
        // Single ReAct cycle mode (default)
        result = await this.executeSingleReActCycle(
          node,
          input,
          contextMessages,
          executionContext,
          tokenTarget,
          contentSequence,
        );
      }

      const executionTime = Date.now() - startTime.getTime();

      // Update execution context
      executionContext.status = 'completed';
      executionContext.result = result;

      // Enqueue completed node so streaming loop can yield even if the map changes quickly
      this.executionState.completedNodesQueue.push(executionContext);

      this.logger.debug(
        `Node ${node.name} execution completed in ${executionTime}ms`,
        GraphAgent.name,
      );
      // Add to execution history
      this.executionState.executionHistory.push({
        nodeId: node._id,
        nodeName: node.name,
        input,
        output: result,
        timestamp: startTime,
        executionTime,
      });

      // Check if we should pause after node execution
      if (this.shouldPause('after-node', node._id)) {
        this.emit('graph-node-paused', {
          agentId: this._id,
          nodeId: node._id,
          nodeName: node.name,
          pausePoint: 'after-node',
          timestamp: new Date(),
        });

        // Create checkpoint after node
        if (this.executionState.pauseSettings.autoCheckpoint) {
          await this.createGraphCheckpoint(
            'graph-node-end',
            node._id,
            `after-${node.name}`,
          );
        }

        await this.waitForResume();
      }

      this.emit('graph-node-execution-complete', {
        agentId: this._id,
        nodeId: node._id,
        nodeName: node.name,
        output: result.substring(0, 200) + '...',
        executionTime,
        timestamp: new Date(),
      });

      return {
        nodeId: node._id,
        nodeName: node.name,
        output: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime.getTime();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Node ${node.name} execution failed: ${errorMessage}`,
        GraphAgent.name,
      );
      // Update execution context
      const executionContext = this.executionState.currentNodes.get(node._id);
      if (executionContext) {
        executionContext.status = 'failed';
        executionContext.error = errorMessage;
      }

      this.emit('graph-node-execution-error', {
        agentId: this._id,
        nodeId: node._id,
        nodeName: node.name,
        error: errorMessage,
        executionTime,
        timestamp: new Date(),
      });

      throw error;
    } finally {
      // Remove from current nodes when done
      this.executionState.currentNodes.delete(node._id);
    }
  }

  /**
   * Create a ReActAgent configured for a specific node
   */
  private createReActAgentForNode(node: Node): ReActAgent {
    this.logger.debug(
      `Creating ReActAgent for node ${node.name} with LLM provider: ${node.llm.provider}`,
      GraphAgent.name,
    );

    // Create node-specific intelligence config using node's LLM settings
    const nodeIntelligenceConfig: AgentIntelligenceConfig = {
      ...this.intelligenceConfig,
      llm: {
        provider: node.llm.provider,
        model: node.llm.model,
        tokenLimit: node.llm.tokenLimit,
      },
    };

    const config = {
      memoryConfig: this.memoryConfig,
      checkpointConfig: this.checkpointConfig,
      intelligenceConfig: nodeIntelligenceConfig,
      loaderConfig: this.loaderConfig,
      textsplitterConfig: this.textsplitterConfig,
      embedderConfig: this.embedderConfig,
    };

    return new ReActAgent(
      this.tools,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      node.ReActConfig,
      config,
      this.userId,
      this.logger,
    );
  }

  /**
   * Collect context messages from contextFrom node IDs
   */
  private async collectContextMessages(
    nodeId: NodeIdType,
    latestMessages: [HumanMessage, ...AIMessage[]],
  ): Promise<[HumanMessage, ...AIMessage[]]> {
    let contextMessages: BaseMessage[] = [...latestMessages];

    // Find edges that target this node and have contextFrom
    const incomingEdges = this.settings.edges.filter(
      (edge) => edge.to === nodeId,
    );

    for (const edge of incomingEdges) {
      if (edge.contextFrom && edge.contextFrom.length > 0) {
        let concatenatedContent = '';

        // Collect messages/memory from specified nodes
        for (const contextNodeId of edge.contextFrom) {
          const contextNodeHistory = this.executionState.executionHistory
            .filter((entry) => entry.nodeId === contextNodeId)
            .slice(-5); // Get last 5 executions from this node

          // Concatenate the outputs into a single string
          if (contextNodeHistory.length > 0) {
            const nodeOutputs = contextNodeHistory
              .map((entry) => `${entry.nodeName}: ${entry.output}`)
              .join('\n\n');

            if (concatenatedContent) {
              concatenatedContent += '\n\n---\n\n' + nodeOutputs;
            } else {
              concatenatedContent = nodeOutputs;
            }
          }
        }

        // Add the concatenated context as a single AI message if we have content
        if (concatenatedContent) {
          contextMessages.push(
            new AIMessage(
              `[Context from previous nodes]:\n${concatenatedContent}`,
            ),
          );
        }

        // Apply memory override if specified
        if (edge.memoryOverride) {
          // Temporarily override memory configuration for this edge
          const originalMemoryConfig = this.memoryConfig;
          this.memoryConfig = edge.memoryOverride;

          // Re-emit with memory override applied
          this.emit('graph-memory-override-applied', {
            agentId: this._id,
            edgeId: edge._id,
            originalMemoryType: originalMemoryConfig.type,
            newMemoryType: edge.memoryOverride.type,
            timestamp: new Date(),
          });

          // Restore original memory config after processing
          setTimeout(() => {
            this.memoryConfig = originalMemoryConfig;
            this.emit('graph-memory-override-restored', {
              agentId: this._id,
              edgeId: edge._id,
              timestamp: new Date(),
            });
          }, 100); // Small delay to ensure override is applied
        }
      }
    }

    return contextMessages as [HumanMessage, ...AIMessage[]];
  }

  /**
   * Process node completion and evaluate edges
   */
  private async processNodeCompletion(
    completedNode: {
      nodeId: NodeIdType;
      nodeName: string;
      output: string;
      executionTime: number;
    },
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<void> {
    // Find outgoing edges from this node
    const outgoingEdges = this.settings.edges.filter(
      (edge) => edge.from === completedNode.nodeId,
    );

    this.emit('graph-evaluating-edges', {
      agentId: this._id,
      fromNodeId: completedNode.nodeId,
      fromNodeName: completedNode.nodeName,
      edgeCount: outgoingEdges.length,
      timestamp: new Date(),
    });

    // Update join node tracking
    this.updateJoinNodeTracking(completedNode.nodeId);

    // Check if we should pause between nodes
    if (this.shouldPause('between-nodes', completedNode.nodeId)) {
      this.emit('graph-node-paused', {
        agentId: this._id,
        nodeId: completedNode.nodeId,
        nodeName: completedNode.nodeName,
        pausePoint: 'between-nodes',
        timestamp: new Date(),
      });

      // Create checkpoint between nodes
      if (this.executionState.pauseSettings.autoCheckpoint) {
        await this.createGraphCheckpoint(
          'graph-between-nodes',
          completedNode.nodeId,
          `between-${completedNode.nodeName}`,
        );
      }

      await this.waitForResume();
    }

    // Group edges by exclusive groups and evaluate
    const edgeGroups = this.groupEdgesByExclusiveGroups(outgoingEdges);

    for (const [groupKey, edges] of edgeGroups) {
      if (groupKey === 'default') {
        // Non-exclusive edges - evaluate all
        for (const edge of edges) {
          await this.evaluateAndExecuteEdge(
            edge,
            completedNode,
            latestMessages,
            tokenTarget,
            contentSequence,
          );
        }
      } else {
        // Exclusive group - evaluate in priority order and take first match
        const sortedEdges = edges.sort(
          (a, b) => (a.priority || 0) - (b.priority || 0),
        );
        let edgeExecuted = false;

        for (const edge of sortedEdges) {
          if (await this.evaluateEdgeCondition(edge, completedNode.output)) {
            await this.evaluateAndExecuteEdge(
              edge,
              completedNode,
              latestMessages,
              tokenTarget,
              contentSequence,
            );
            edgeExecuted = true;
            break; // Only execute one edge from exclusive group
          }
        }

        if (!edgeExecuted) {
          this.emit('graph-exclusive-group-no-match', {
            agentId: this._id,
            groupKey,
            fromNodeId: completedNode.nodeId,
            edgeCount: edges.length,
            timestamp: new Date(),
          });
        }
      }
    }
  }

  /**
   * Group edges by exclusive groups
   */
  private groupEdgesByExclusiveGroups(edges: Edge[]): Map<string, Edge[]> {
    const groups = new Map<string, Edge[]>();

    for (const edge of edges) {
      const groupKey = edge.exclusiveGroup || 'default';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(edge);
    }

    return groups;
  }

  /**
   * Update join node tracking when a node completes
   */
  private updateJoinNodeTracking(completedNodeId: NodeIdType): void {
    for (const [joinNodeId, tracker] of this.executionState.joinNodeTracker) {
      if (tracker.requiredPredecessors.includes(completedNodeId)) {
        tracker.completedPredecessors.add(completedNodeId);

        // Check if all predecessors are complete
        if (
          tracker.completedPredecessors.size ===
          tracker.requiredPredecessors.length
        ) {
          tracker.isReady = true;

          this.emit('graph-join-node-ready', {
            agentId: this._id,
            joinNodeId,
            completedPredecessors: Array.from(tracker.completedPredecessors),
            timestamp: new Date(),
          });
        }
      }
    }
  }

  /**
   * Check if a join node is ready to execute
   */
  private isJoinNodeReady(nodeId: NodeIdType): boolean {
    const tracker = this.executionState.joinNodeTracker.get(nodeId);
    return tracker ? tracker.isReady : true; // Default to true if not a join node
  }

  /**
   * Evaluate and execute a single edge
   */
  private async evaluateAndExecuteEdge(
    edge: Edge,
    completedNode: {
      nodeId: NodeIdType;
      nodeName: string;
      output: string;
      executionTime: number;
    },
    latestMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<void> {
    const shouldTraverse = await this.evaluateEdgeCondition(
      edge,
      completedNode.output,
    );

    if (shouldTraverse) {
      // Check if this is a join edge and if the target node is ready
      if (edge.isJoin && !this.isJoinNodeReady(edge.to)) {
        this.emit('graph-join-node-waiting', {
          agentId: this._id,
          edgeId: edge._id,
          targetNodeId: edge.to,
          timestamp: new Date(),
        });
        return; // Wait for join node to be ready
      }

      this.emit('graph-edge-traversed', {
        agentId: this._id,
        edgeId: edge._id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        conditionType: edge.condition.type,
        timestamp: new Date(),
      });

      // Find target node and execute it
      const targetNode = this.settings.nodes.find(
        (node) => node._id === edge.to,
      );
      if (targetNode) {
        // Execute target node (this will run in parallel with other nodes)
        this.executeNode(
          targetNode,
          completedNode.output, // Use previous node's output as input
          latestMessages,
          tokenTarget,
          contentSequence,
        ).catch((error) => {
          this.emit('graph-edge-execution-error', {
            agentId: this._id,
            edgeId: edge._id,
            targetNodeId: edge.to,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });
        });
      }
    } else {
      this.emit('graph-edge-not-traversed', {
        agentId: this._id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        conditionType: edge.condition.type,
        reason: 'Condition not met',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Evaluate whether an edge condition is met
   */
  private async evaluateEdgeCondition(
    edge: Edge,
    nodeOutput: string,
  ): Promise<boolean> {
    switch (edge.condition.type) {
      case 'keyword':
        if (edge.condition.keyword) {
          return nodeOutput
            .toLowerCase()
            .includes(edge.condition.keyword.toLowerCase());
        }
        return false;

      case 'analysis':
        if (edge.condition.analysisPrompt) {
          try {
            const analysisResult = await this.llm.chat(
              [
                new HumanMessage(
                  `${edge.condition.analysisPrompt}\n\nText to analyze: ${nodeOutput}`,
                ),
              ],
              {
                providerName: edge.condition.analysisProvider.provider,
                modelId: edge.condition.analysisProvider.model,
                config: {},
              },
            );

            // Consider condition met if response contains 'yes', 'true', or 'satisfied'
            const result = String(analysisResult.response).toLowerCase();
            return (
              result.includes('yes') ||
              result.includes('true') ||
              result.includes('satisfied')
            );
          } catch (error) {
            this.emit('graph-edge-analysis-error', {
              agentId: this._id,
              edgeId: edge._id,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date(),
            });
            return false;
          }
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Wait for the next node to complete
   */
  private async waitForNextCompletion(): Promise<NodeExecutionContext | null> {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        // Drain queued completions, skipping any already emitted
        while (this.executionState.completedNodesQueue.length > 0) {
          const ctx = this.executionState.completedNodesQueue.shift()!;
          if (!this.executionState.emittedNodeIds.has(ctx.node._id)) {
            resolve(ctx);
            return;
          }
        }

        // Find any newly completed nodes that haven't been emitted
        const completed = Array.from(
          this.executionState.currentNodes.values(),
        ).find(
          (ctx) =>
            (ctx.status === 'completed' || ctx.status === 'failed') &&
            !this.executionState.emittedNodeIds.has(ctx.node._id),
        );
        if (completed) {
          resolve(completed);
          return;
        }

        const anyRunning = Array.from(
          this.executionState.currentNodes.values(),
        ).some((ctx) => ctx.status === 'running');

        // If nothing is running and no queued items, we're done
        if (
          !anyRunning &&
          this.executionState.completedNodesQueue.length === 0 &&
          this.executionState.currentNodes.size === 0
        ) {
          resolve(null);
          return;
        }

        setTimeout(checkCompletion, 50);
      };

      checkCompletion();
    });
  }

  /**
   * Abort current execution
   */
  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.state = AgentState.PAUSED;

      this.emit('graph-execution-aborted', {
        agentId: this._id,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Pause execution at specific points
   */
  public pause(options?: {
    pauseBeforeNodes?: boolean;
    pauseAfterNodes?: boolean;
    pauseBetweenNodes?: boolean;
    specificBranches?: NodeIdType[];
  }): void {
    this.executionState.isPaused = true;

    if (options) {
      this.executionState.pauseSettings = {
        ...this.executionState.pauseSettings,
        ...options,
      };

      if (options.specificBranches) {
        options.specificBranches.forEach((nodeId) =>
          this.executionState.pausedBranches.add(nodeId),
        );
      }
    }

    this.emit('graph-paused', {
      agentId: this._id,
      pauseSettings: this.executionState.pauseSettings,
      pausedBranches: Array.from(this.executionState.pausedBranches),
      timestamp: new Date(),
    });
  }

  /**
   * Resume execution
   */
  public resume(): void {
    this.executionState.isPaused = false;
    this.executionState.pausedBranches.clear();

    this.emit('graph-resumed', {
      agentId: this._id,
      timestamp: new Date(),
    });
  }

  /**
   * Check if execution should pause at this point
   */
  private shouldPause(
    pausePoint: 'before-node' | 'after-node' | 'between-nodes',
    nodeId?: NodeIdType,
  ): boolean {
    if (!this.executionState.isPaused) return false;

    // Check if specific branch is paused
    if (nodeId && this.executionState.pausedBranches.has(nodeId)) return true;

    // Check global pause settings
    switch (pausePoint) {
      case 'before-node':
        return this.executionState.pauseSettings.pauseBeforeNodes;
      case 'after-node':
        return this.executionState.pauseSettings.pauseAfterNodes;
      case 'between-nodes':
        return this.executionState.pauseSettings.pauseBetweenNodes;
      default:
        return false;
    }
  }

  /**
   * Wait for resume signal
   */
  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkResume = () => {
        if (!this.executionState.isPaused) {
          resolve();
        } else {
          setTimeout(checkResume, 100);
        }
      };
      checkResume();
    });
  }

  /**
   * Update graph configuration while paused
   */
  public updateGraphConfiguration(updates: {
    nodes?: Partial<Node>[];
    edges?: Partial<Edge>[];
    saveToAgent?: boolean;
  }): boolean {
    if (!this.executionState.isPaused) {
      throw new Error(
        'Cannot update graph configuration while running. Pause execution first.',
      );
    }

    let hasChanges = false;

    if (updates.nodes) {
      updates.nodes.forEach((nodeUpdate) => {
        const existingNodeIndex = this.settings.nodes.findIndex(
          (n) => n._id === nodeUpdate._id,
        );
        if (existingNodeIndex >= 0) {
          this.settings.nodes[existingNodeIndex] = {
            ...this.settings.nodes[existingNodeIndex],
            ...nodeUpdate,
          };
          hasChanges = true;
        } else if (nodeUpdate._id) {
          // Add new node
          this.settings.nodes.push(nodeUpdate as Node);
          hasChanges = true;
        }
      });
    }

    if (updates.edges) {
      updates.edges.forEach((edgeUpdate) => {
        const existingEdgeIndex = this.settings.edges.findIndex(
          (e) => e._id === edgeUpdate._id,
        );
        if (existingEdgeIndex >= 0) {
          this.settings.edges[existingEdgeIndex] = {
            ...this.settings.edges[existingEdgeIndex],
            ...edgeUpdate,
          };
          this.executionState.activeEdges[existingEdgeIndex] = {
            ...this.executionState.activeEdges[existingEdgeIndex],
            ...edgeUpdate,
          };
          hasChanges = true;
        } else if (edgeUpdate._id) {
          // Add new edge
          this.settings.edges.push(edgeUpdate as Edge);
          this.executionState.activeEdges.push(edgeUpdate as Edge);
          hasChanges = true;
        }
      });
    }

    if (hasChanges) {
      this.emit('graph-configuration-updated', {
        agentId: this._id,
        updates,
        saveToAgent: updates.saveToAgent,
        timestamp: new Date(),
      });

      // TODO: If saveToAgent is true, persist changes to database
      if (updates.saveToAgent) {
        // This would require implementing a method to update the GraphAgent configuration in the database
        this.emit('graph-configuration-saved', {
          agentId: this._id,
          timestamp: new Date(),
        });
      }
    }

    return hasChanges;
  }

  /**
   * Restore from a checkpoint
   */
  public async restoreFromCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const checkpoint = await this.checkpointService.getCheckpoint(
        this.conversationId,
        checkpointId,
      );

      if (!checkpoint || !checkpoint.graphState) {
        return false;
      }

      // Restore execution state
      this.executionState.executionHistory =
        checkpoint.graphState.executionHistory.map((entry) => ({
          nodeId: entry.nodeId,
          nodeName: entry.nodeName,
          input: entry.input,
          output: entry.output,
          timestamp: new Date(entry.timestamp),
          executionTime: entry.executionTime,
        }));

      this.executionState.activeEdges = checkpoint.graphState.activeEdges;
      this.executionState.currentInput = checkpoint.graphState.currentInput;

      // Clear current nodes and set paused state
      this.executionState.currentNodes.clear();
      this.executionState.isPaused = true;

      if (checkpoint.graphState.pausedBranches) {
        this.executionState.pausedBranches = new Set(
          checkpoint.graphState.pausedBranches,
        );
      }

      // Determine what kind of restoration this is
      const isGettingBetweenNodes =
        checkpoint.checkpointType === 'graph-between-nodes';

      this.emit('graph-checkpoint-restored', {
        agentId: this._id,
        checkpointId,
        checkpointType: checkpoint.checkpointType,
        awaitingNewInput: isGettingBetweenNodes,
        previousInput: checkpoint.graphState.currentInput,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      this.emit('graph-checkpoint-restore-error', {
        agentId: this._id,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      return false;
    }
  }

  /**
   * Continue execution with new input (after checkpoint restoration)
   */
  public async continueWithInput(
    newInput: string,
    latestMessages: [HumanMessage, ...AIMessage[]] = [] as any,
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    if (!this.executionState.isPaused) {
      throw new Error(
        'Graph is not paused. Use stream() for normal execution.',
      );
    }

    this.executionState.currentInput = newInput;
    this.resume();

    return this.stream(newInput, latestMessages, tokenTarget, contentSequence);
  }

  /**
   * Create a graph-specific checkpoint
   */
  private async createGraphCheckpoint(
    checkpointType:
      | 'graph-node-start'
      | 'graph-node-end'
      | 'graph-between-nodes',
    nodeId?: NodeIdType,
    name?: string,
  ): Promise<void> {
    const checkpointData = {
      name: name || `${checkpointType}-${nodeId || 'unknown'}-${Date.now()}`,
      description: `Graph checkpoint at ${checkpointType}${nodeId ? ` for node ${nodeId}` : ''}`,
      checkpointType,
      graphState: {
        executionHistory: this.executionState.executionHistory.map((entry) => ({
          nodeId: entry.nodeId,
          nodeName: entry.nodeName,
          input: entry.input,
          output: entry.output,
          timestamp: entry.timestamp.toISOString(),
          executionTime: entry.executionTime,
        })),
        activeEdges: this.executionState.activeEdges,
        pausedAtNode: nodeId,
        pausedBranches: Array.from(this.executionState.pausedBranches),
        currentInput: this.executionState.currentInput,
      },
    };

    await this.checkpoint(checkpointData);
  }

  /**
   * Execute a single ReAct cycle with optional user approval and CoT limits
   */
  private async executeSingleReActCycle(
    node: Node,
    input: string,
    contextMessages: [HumanMessage, ...AIMessage[]],
    executionContext: NodeExecutionContext,
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    // The maxSteps is now controlled by ReActConfig.cot.maxSteps
    // The fixNodeConfigurations method ensures consistency when ReAct is disabled
    const result = await executionContext.reactAgent.invoke(
      input,
      contextMessages,
      tokenTarget,
      contentSequence,
    );
    return await this.handleSingleCycleResult(
      node,
      result,
      executionContext,
      input,
      contextMessages,
      tokenTarget,
      contentSequence,
    );
  }

  /**
   * Handle the result of a single ReAct cycle (approval, confidence check, user prompting)
   */
  private async handleSingleCycleResult(
    node: Node,
    result: string,
    executionContext: NodeExecutionContext,
    originalInput: string,
    contextMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    // Check confidence threshold if configured
    if (node.userInteraction?.confidenceThreshold !== undefined) {
      const confidence = await this.evaluateConfidence(result, node);
      if (confidence < node.userInteraction.confidenceThreshold) {
        return await this.handleLowConfidenceSingleCycle(
          node,
          result,
          confidence,
          executionContext,
          originalInput,
          contextMessages,
          tokenTarget,
          contentSequence,
        );
      }
    }

    // Check if user approval is required
    if (node.userInteraction?.requireApproval) {
      return await this.handleUserApproval(node, result, executionContext);
    }

    return result;
  }

  /**
   * Handle low confidence in single cycle mode with user prompting option
   */
  private async handleLowConfidenceSingleCycle(
    node: Node,
    output: string,
    confidence: number,
    executionContext: NodeExecutionContext,
    originalInput: string,
    contextMessages: [HumanMessage, ...AIMessage[]],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    executionContext.status = 'awaiting_user_input';

    // Add to pending user interactions
    this.executionState.pendingUserInteractions.set(node._id, {
      type: 'input',
      nodeContext: executionContext,
      timestamp: new Date(),
    });

    this.emit('graph-node-low-confidence', {
      agentId: this._id,
      nodeId: node._id,
      nodeName: node.name,
      output,
      confidence,
      threshold: node.userInteraction?.confidenceThreshold,
      allowUserPrompting: node.userInteraction?.allowUserPrompting || false,
      timestamp: new Date(),
    });

    // Wait for user decision
    const userAction = await this.waitForUserInput(
      node,
      executionContext,
      'input',
      `Agent confidence (${confidence.toFixed(2)}) is below threshold (${node.userInteraction?.confidenceThreshold?.toFixed(2)}). Choose action:`,
    );

    this.executionState.pendingUserInteractions.delete(node._id);

    if (userAction?.toLowerCase().includes('accept')) {
      executionContext.status = 'completed';
      return output;
    } else if (userAction?.toLowerCase().includes('retry')) {
      // Retry the ReAct cycle with original input
      const retryMessages: [HumanMessage, ...AIMessage[]] = [
        new HumanMessage('Please try again with more confidence'),
      ];
      return await this.executeSingleReActCycle(
        node,
        originalInput,
        retryMessages,
        executionContext,
        tokenTarget,
        contentSequence,
      );
    } else if (
      node.userInteraction?.allowUserPrompting &&
      userAction &&
      !userAction.toLowerCase().includes('accept') &&
      !userAction.toLowerCase().includes('retry')
    ) {
      // User provided additional prompting/guidance
      const guidanceMessages: [HumanMessage, ...AIMessage[]] = [
        ...contextMessages,
        new AIMessage(output),
        new HumanMessage(
          `User guidance: ${userAction}. Please revise your response.`,
        ),
      ];
      return await this.executeSingleReActCycle(
        node,
        originalInput,
        guidanceMessages,
        executionContext,
        tokenTarget,
        contentSequence,
      );
    } else {
      // Default to accepting the original output
      executionContext.status = 'completed';
      return output;
    }
  }

  /**
   * Execute continuous chat mode allowing multiple rounds of interaction
   */
  private async executeContinuousChat(
    node: Node,
    input: string,
    contextMessages: [HumanMessage, ...AIMessage[]],
    executionContext: NodeExecutionContext,
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    if (!executionContext.userInteractionState) {
      throw new Error(
        'User interaction state not initialized for continuous chat mode',
      );
    }

    let currentInput = input;
    let lastResponse = '';

    // Add initial user message to conversation history
    executionContext.userInteractionState.conversationHistory.push({
      message: input,
      isUser: true,
      timestamp: new Date(),
    });

    // Continue chat until user decides to end
    while (true) {
      // Execute ReAct cycle
      const response = await executionContext.reactAgent.invoke(
        currentInput,
        contextMessages,
        tokenTarget,
        contentSequence,
      );

      lastResponse = response;
      executionContext.userInteractionState.chatRounds++;

      // Add agent response to conversation history
      executionContext.userInteractionState.conversationHistory.push({
        message: response,
        isUser: false,
        timestamp: new Date(),
      });

      // Wait for user to either continue chat or end session
      const userResponse = await this.waitForUserChatAction(
        node,
        executionContext,
        response,
      );

      if (userResponse === null || userResponse === 'END_CHAT') {
        // User chose to end the chat
        break;
      }

      // Add user response to conversation history
      executionContext.userInteractionState.conversationHistory.push({
        message: userResponse,
        isUser: true,
        timestamp: new Date(),
      });

      currentInput = userResponse;
    }

    // Apply final approval if required
    if (node.userInteraction?.requireApproval) {
      return await this.handleUserApproval(
        node,
        lastResponse,
        executionContext,
      );
    }

    return lastResponse;
  }

  /**
   * Wait for user to either continue chat or end the session
   */
  private async waitForUserChatAction(
    node: Node,
    executionContext: NodeExecutionContext,
    lastResponse: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => {
          resolve(null); // End chat on timeout
        },
        10 * 60 * 1000,
      ); // 10 minute timeout

      // Set up event listener for user chat action
      const chatActionHandler = (data: any) => {
        if (data.nodeId === node._id) {
          clearTimeout(timeout);
          this.removeListener('user-chat-action', chatActionHandler);
          resolve(data.action === 'continue' ? data.input : 'END_CHAT');
        }
      };

      this.on('user-chat-action', chatActionHandler);

      // Emit event for UI to show chat interface with end button
      this.emit('graph-node-chat-waiting', {
        agentId: this._id,
        nodeId: node._id,
        nodeName: node.name,
        lastResponse,
        conversationHistory:
          executionContext.userInteractionState?.conversationHistory,
        showEndButton: node.userInteraction?.showEndChatButton !== false, // default true
        timestamp: new Date(),
      });
    });
  }

  /**
   * Handle user approval workflow
   */
  private async handleUserApproval(
    node: Node,
    output: string,
    executionContext: NodeExecutionContext,
  ): Promise<string> {
    executionContext.status = 'awaiting_approval';

    if (executionContext.userInteractionState) {
      executionContext.userInteractionState.pendingApproval = {
        output,
        timestamp: new Date(),
      };
    }

    // Add to pending user interactions
    this.executionState.pendingUserInteractions.set(node._id, {
      type: 'approval',
      nodeContext: executionContext,
      timestamp: new Date(),
    });

    this.emit('graph-node-awaiting-approval', {
      agentId: this._id,
      nodeId: node._id,
      nodeName: node.name,
      output,
      approvalPrompt:
        node.userInteraction?.approvalPrompt || 'Do you approve this response?',
      timestamp: new Date(),
    });

    // Wait for user approval
    const approved = await this.waitForUserApproval(node, executionContext);

    if (approved) {
      executionContext.status = 'completed';
      this.executionState.pendingUserInteractions.delete(node._id);
      return output;
    } else {
      // User rejected - could retry or modify
      throw new Error('User rejected the agent output');
    }
  }

  /**
   * Handle low confidence pause
   */
  private async handleLowConfidencePause(
    node: Node,
    output: string,
    confidence: number,
    executionContext: NodeExecutionContext,
  ): Promise<string> {
    executionContext.status = 'awaiting_user_input';

    // Add to pending user interactions
    this.executionState.pendingUserInteractions.set(node._id, {
      type: 'input',
      nodeContext: executionContext,
      timestamp: new Date(),
    });

    this.emit('graph-node-low-confidence', {
      agentId: this._id,
      nodeId: node._id,
      nodeName: node.name,
      output,
      confidence,
      threshold: node.userInteraction?.confidenceThreshold,
      timestamp: new Date(),
    });

    // Wait for user decision
    const userAction = await this.waitForUserInput(
      node,
      executionContext,
      'input',
      `Agent confidence (${confidence.toFixed(2)}) is below threshold. Do you want to: (accept/retry)`,
    );

    this.executionState.pendingUserInteractions.delete(node._id);

    if (userAction?.toLowerCase().includes('accept')) {
      executionContext.status = 'completed';
      return output;
    } else {
      // Default to accepting if unclear response
      executionContext.status = 'completed';
      return output;
    }
  }

  /**
   * Evaluate confidence level of an agent response
   */
  private async evaluateConfidence(
    response: string,
    _node: Node,
  ): Promise<number> {
    // Simple confidence evaluation - could be enhanced with LLM-based evaluation
    const uncertaintyIndicators = [
      'i think',
      'maybe',
      'possibly',
      'might be',
      'could be',
      'not sure',
      'unclear',
      'uncertain',
      'probably',
      'seems like',
      'appears to',
    ];

    const lowerResponse = response.toLowerCase();
    const uncertaintyCount = uncertaintyIndicators.filter((indicator) =>
      lowerResponse.includes(indicator),
    ).length;

    // Simple scoring: start with 1.0, reduce by 0.1 for each uncertainty indicator
    const confidence = Math.max(0.1, 1.0 - uncertaintyCount * 0.1);

    return confidence;
  }

  /**
   * Check if chat should end based on response content
   */
  private shouldEndChat(_response: string, _endPrompts?: string[]): boolean {
    // This method is now deprecated - user controls chat ending via button
    return false;
  }

  /**
   * Wait for user input during execution
   */
  private async waitForUserInput(
    node: Node,
    _executionContext: NodeExecutionContext,
    type: 'input' | 'chat_continuation',
    prompt?: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => {
          resolve(''); // Return empty string if timeout
        },
        5 * 60 * 1000,
      ); // 5 minute timeout

      // Set up event listener for user input
      const inputHandler = (data: any) => {
        if (data.nodeId === node._id) {
          clearTimeout(timeout);
          this.removeListener('user-input-received', inputHandler);
          resolve(data.input);
        }
      };

      this.on('user-input-received', inputHandler);

      // Emit event requesting user input
      this.emit('graph-node-awaiting-input', {
        agentId: this._id,
        nodeId: node._id,
        nodeName: node.name,
        type,
        prompt: prompt || 'Please provide input to continue',
        timestamp: new Date(),
      });
    });
  }

  /**
   * Wait for user approval
   */
  private async waitForUserApproval(
    node: Node,
    _executionContext: NodeExecutionContext,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => {
          resolve(false); // Default to rejection if timeout
        },
        10 * 60 * 1000,
      ); // 10 minute timeout

      // Set up event listener for user approval
      const approvalHandler = (data: any) => {
        if (data.nodeId === node._id) {
          clearTimeout(timeout);
          this.removeListener('user-approval-received', approvalHandler);
          resolve(data.approved);
        }
      };

      this.on('user-approval-received', approvalHandler);
    });
  }

  /**
   * PUBLIC METHODS FOR USER INTERACTION
   */

  /**
   * Provide user input for a node awaiting input
   */
  public provideUserInput(nodeId: NodeIdType, input: string): void {
    this.emit('user-input-received', {
      nodeId,
      input,
      timestamp: new Date(),
    });
  }

  /**
   * Provide user approval for a node awaiting approval
   */
  public provideUserApproval(nodeId: NodeIdType, approved: boolean): void {
    this.emit('user-approval-received', {
      nodeId,
      approved,
      timestamp: new Date(),
    });
  }

  /**
   * Handle user chat actions (continue with input or end chat)
   */
  public provideChatAction(
    nodeId: NodeIdType,
    action: 'continue' | 'end',
    input?: string,
  ): void {
    this.emit('user-chat-action', {
      nodeId,
      action,
      input: action === 'continue' ? input : null,
      timestamp: new Date(),
    });
  }

  /**
   * Handle user choice for edge selection (for user_choice edge types)
   */
  public provideUserChoice(edgeId: EdgeIdType, choice: string): void {
    this.emit('user-choice-provided', {
      edgeId,
      choice,
      timestamp: new Date(),
    });
  }

  /**
   * Get all nodes currently awaiting user interaction
   */
  public getPendingUserInteractions(): Array<{
    nodeId: NodeIdType;
    nodeName: string;
    type: 'approval' | 'input' | 'chat_continuation';
    timestamp: Date;
    context?: any;
  }> {
    const pending: Array<{
      nodeId: NodeIdType;
      nodeName: string;
      type: 'approval' | 'input' | 'chat_continuation';
      timestamp: Date;
      context?: any;
    }> = [];

    for (const [nodeId, interaction] of this.executionState
      .pendingUserInteractions) {
      pending.push({
        nodeId,
        nodeName: interaction.nodeContext.node.name,
        type: interaction.type,
        timestamp: interaction.timestamp,
        context: {
          conversationHistory:
            interaction.nodeContext.userInteractionState?.conversationHistory,
          pendingApproval:
            interaction.nodeContext.userInteractionState?.pendingApproval,
        },
      });
    }

    return pending;
  }

  /**
   * Get conversation history for a specific node in continuous chat mode
   */
  public getNodeConversationHistory(nodeId: NodeIdType): Array<{
    message: string;
    isUser: boolean;
    timestamp: Date;
  }> | null {
    const nodeContext = this.executionState.currentNodes.get(nodeId);
    return nodeContext?.userInteractionState?.conversationHistory || null;
  }

  /**
   * Check if the graph has any nodes awaiting user interaction
   */
  public hasAwaitingUserInteraction(): boolean {
    return this.executionState.pendingUserInteractions.size > 0;
  }

  /**
   * Create a rollback checkpoint before executing a node
   */
  private createRollbackCheckpoint(nodeId: NodeIdType, nodeName: string): void {
    // Deep copy current state for rollback
    const checkpoint = {
      nodeId,
      nodeName,
      timestamp: new Date(),
      executionHistory: JSON.parse(JSON.stringify(this.executionState.executionHistory)),
      currentNodes: new Map(this.executionState.currentNodes),
      joinNodeTracker: new Map(
        Array.from(this.executionState.joinNodeTracker.entries()).map(([key, val]) => [
          key,
          {
            requiredPredecessors: [...val.requiredPredecessors],
            completedPredecessors: new Set(val.completedPredecessors),
            isReady: val.isReady,
          },
        ])
      ),
    };

    this.executionState.rollbackCheckpoints.push(checkpoint);

    // Trim old checkpoints if exceeding max
    if (this.executionState.rollbackCheckpoints.length > this.executionState.maxRollbackCheckpoints) {
      this.executionState.rollbackCheckpoints.shift();
    }

    this.emit('rollback-checkpoint-created', {
      agentId: this._id,
      nodeId,
      nodeName,
      checkpointCount: this.executionState.rollbackCheckpoints.length,
      timestamp: new Date(),
    });

    this.logger.debug(
      `Created rollback checkpoint for node ${nodeName} (${nodeId}), total checkpoints: ${this.executionState.rollbackCheckpoints.length}`,
      GraphAgent.name,
    );
  }

  /**
   * Rollback execution to a previous checkpoint
   */
  public async rollbackToCheckpoint(steps: number = 1): Promise<boolean> {
    if (this.state === AgentState.RUNNING) {
      this.logger.warn(
        'Cannot rollback while graph is running - pause first',
        GraphAgent.name,
      );
      return false;
    }

    if (steps < 1 || steps > this.executionState.rollbackCheckpoints.length) {
      this.logger.error(
        `Invalid rollback steps: ${steps}. Available checkpoints: ${this.executionState.rollbackCheckpoints.length}`,
        GraphAgent.name,
      );
      return false;
    }

    const targetCheckpointIndex = this.executionState.rollbackCheckpoints.length - steps;
    const checkpoint = this.executionState.rollbackCheckpoints[targetCheckpointIndex];

    this.logger.info(
      `Rolling back ${steps} step(s) to checkpoint at node ${checkpoint.nodeName} (${checkpoint.nodeId})`,
      GraphAgent.name,
    );

    // Restore state
    this.executionState.executionHistory = JSON.parse(JSON.stringify(checkpoint.executionHistory));
    this.executionState.currentNodes = new Map(checkpoint.currentNodes);
    this.executionState.joinNodeTracker = new Map(
      Array.from(checkpoint.joinNodeTracker.entries()).map(([key, val]) => [
        key,
        {
          requiredPredecessors: [...val.requiredPredecessors],
          completedPredecessors: new Set(val.completedPredecessors),
          isReady: val.isReady,
        },
      ])
    );

    // Remove checkpoints after the rollback point
    this.executionState.rollbackCheckpoints.splice(targetCheckpointIndex);

    this.emit('graph-execution-rolled-back', {
      agentId: this._id,
      steps,
      restoredNodeId: checkpoint.nodeId,
      restoredNodeName: checkpoint.nodeName,
      newHistoryLength: this.executionState.executionHistory.length,
      timestamp: new Date(),
    });

    this.logger.info(
      `Rollback completed successfully. Execution history length: ${this.executionState.executionHistory.length}`,
      GraphAgent.name,
    );

    return true;
  }

  /**
   * Get available rollback checkpoints
   */
  public getRollbackCheckpoints(): Array<{
    nodeId: NodeIdType;
    nodeName: string;
    timestamp: Date;
  }> {
    return this.executionState.rollbackCheckpoints.map(cp => ({
      nodeId: cp.nodeId,
      nodeName: cp.nodeName,
      timestamp: cp.timestamp,
    }));
  }

  /**
   * Clear all rollback checkpoints
   */
  public clearRollbackCheckpoints(): void {
    const count = this.executionState.rollbackCheckpoints.length;
    this.executionState.rollbackCheckpoints = [];
    this.logger.info(`Cleared ${count} rollback checkpoints`, GraphAgent.name);
    this.emit('rollback-checkpoints-cleared', {
      agentId: this._id,
      clearedCount: count,
      timestamp: new Date(),
    });
  }
}
