import { Inject } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
import BaseAgent from './base';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import {
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentState,
} from '../types/agent.entity';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import { UserIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

// Collective infrastructure services
import { CollectiveRuntimeService } from '../../../collective/runtime/collective-runtime.service';
import { CommunicationService } from '../../../collective/communication/communication.service';
import { SharedMemoryService } from '../../../collective/shared-memory/shared-memory.service';
import { PMToolsService } from '../../../collective/services/pm-tools.service';
import { CollectiveService } from '../../../collective/services/collective.service';
import { AgentExecutor } from '../../../collective/runtime/agent-executor.service';

/**
 * CollectiveAgent Configuration
 * 
 * Extends base agent configuration with collective-specific settings.
 */
export interface CollectiveAgentConfig {
  _id: string;
  state: AgentState;
  userId?: string;
  name?: string;
  description?: string;
  purpose?: string;
  enabled: boolean;
  
  // Collective-specific configuration
  collective: {
    vision: string; // High-level goal (Level 0)
    agents: {
      agentId: string;
      role: string;
      capabilities: string[];
      maxConcurrentTasks: number;
    }[];
    pmAgent: {
      agentId: string;
      intelligence: AgentIntelligenceConfig;
    };
    coordination: {
      maxDeadlockRetries: number;
      taskReassignmentEnabled: boolean;
      autoDeadlockResolution: boolean;
      humanEscalationThreshold: number; // Failed tasks before escalating
    };
    communication: {
      messagePriorityEnabled: boolean;
      conversationThreadingEnabled: boolean;
      broadcastEnabled: boolean;
    };
    sharedMemory: {
      artifactVersioningEnabled: boolean;
      artifactLockingEnabled: boolean;
      maxConcurrentLocks: number;
    };
  };
  
  intelligence: AgentIntelligenceConfig;
  memory?: AgentMemoryConfig;
}

/**
 * CollectiveAgent
 * 
 * A multi-agent coordination system that simulates a complete organizational structure.
 * Unlike centralized multi-agent systems, this collective operates as a true peer-to-peer
 * team where each agent has independent reasoning capabilities, coordinated by a
 * specialized Project Manager (PM) agent.
 * 
 * Key Features:
 * - No Central LLM: Each agent operates independently with its own LLM instance
 * - Dynamic Task Distribution: Agents claim tasks based on capability and availability
 * - Hierarchical Task Decomposition: 8-level task tree (Vision → Subtask)
 * - Deadlock Detection & Recovery: Algorithmic cycle detection with PM intervention
 * - Organic Communication: Message queues with priority levels + shared project board
 * - Conversation-Per-Task: Full context preservation with resume capability
 * - Artifact Management: Versioned, locked, searchable shared resources
 * - Human-in-the-Loop: Real-time oversight with freeze/resume/intervention controls
 */
export class CollectiveAgent extends BaseAgent {
  private settings: CollectiveAgentConfig;
  
  // Collective infrastructure services
  private collectiveRuntime: CollectiveRuntimeService;
  private communication: CommunicationService;
  private sharedMemory: SharedMemoryService;
  private pmTools: PMToolsService;
  private collectiveService: CollectiveService;
  private agentExecutor: AgentExecutor;

  constructor(
    @Inject(Toolkit) tools: Toolkit,
    @Inject(AgentMemory) memory: AgentMemory,
    @Inject(LLMService) llm: LLMService,
    @Inject(ConversationRepository)
    protected conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) protected vectorStore: VectorStoreService,
    @Inject(CheckpointService) protected checkpointService: CheckpointService,
    @Inject(LoaderService) protected loaderService: LoaderService,
    @Inject(CollectiveRuntimeService) collectiveRuntime: CollectiveRuntimeService,
    @Inject(CommunicationService) communication: CommunicationService,
    @Inject(SharedMemoryService) sharedMemory: SharedMemoryService,
    @Inject(PMToolsService) pmTools: PMToolsService,
    @Inject(CollectiveService) collectiveService: CollectiveService,
    @Inject(AgentExecutor) agentExecutor: AgentExecutor,
    settings: CollectiveAgentConfig,
    config: {
      memoryConfig: AgentMemoryConfig;
      checkpointConfig: AgentCheckpointConfig;
      intelligenceConfig: AgentIntelligenceConfig;
      loaderConfig: AgentLoaderConfig;
      textsplitterConfig: TextSplitterConfig;
      embedderConfig: EmbeddingOptions;
    },
    protected userId: UserIdType,
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

    this.logger.info('CollectiveAgent initializing', CollectiveAgent.name);

    this.emit('collective-agent-initializing', {
      settings,
      timestamp: new Date(),
    });

    // Validate configuration
    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'CollectiveAgent configuration validation failed - settings not provided or invalid',
        CollectiveAgent.name,
      );
      throw new Error('CollectiveAgent requires complete configuration settings');
    }

    if (!settings.collective) {
      throw new Error('CollectiveAgent requires collective configuration');
    }

    // Store settings and services
    this.settings = settings;
    this.collectiveRuntime = collectiveRuntime;
    this.communication = communication;
    this.sharedMemory = sharedMemory;
    this.pmTools = pmTools;
    this.collectiveService = collectiveService;
    this.agentExecutor = agentExecutor;

    this.logger.debug(
      `CollectiveAgent settings loaded - ID: ${this.settings._id}, enabled: ${this.settings.enabled}`,
      CollectiveAgent.name,
    );

    // Use the _id field for agent identification
    this._id = this.settings._id;

    // Use the state field to set agent state
    this.state = this.settings.state;

    // Check if agent is enabled
    if (!this.settings.enabled) {
      this.logger.warn(
        `CollectiveAgent ${this.settings._id} is disabled, setting state to STOPPED`,
        CollectiveAgent.name,
      );
      this.state = AgentState.STOPPED;
      this.emit('collective-agent-disabled', {
        agentId: this.settings._id,
        timestamp: new Date(),
      });
    }

    // Update intelligence config
    if (this.intelligenceConfig && this.settings.intelligence) {
      this.logger.debug(
        `Updating intelligence config - provider: ${this.settings.intelligence.llm.provider}, model: ${this.settings.intelligence.llm.model}`,
        CollectiveAgent.name,
      );
      Object.assign(this.intelligenceConfig, this.settings.intelligence);
      Object.assign(
        this.intelligenceConfig.llm,
        this.settings.intelligence.llm,
      );
    }

    this.logger.info(
      'CollectiveAgent configuration completed successfully',
      CollectiveAgent.name,
    );
    this.emit('collective-agent-configured', {
      agentId: this.settings._id,
      vision: this.settings.collective.vision,
      agentCount: this.settings.collective.agents.length,
      pmAgentId: this.settings.collective.pmAgent.agentId,
      timestamp: new Date(),
    });
  }

  /**
   * Execute the collective agent
   * 
   * This is the main entry point for collective execution. It:
   * 1. Initializes the collective runtime
   * 2. Creates the vision task (Level 0)
   * 3. Starts the PM agent to decompose and delegate
   * 4. Monitors agent execution and handles events
   * 5. Returns results when complete or paused
   * 
   * @param userMessage - Initial user message/request
   * @param history - Conversation history for context
   * @returns AsyncGenerator yielding status updates and final result
   */
  async *execute(
    userMessage: string,
    _history: BaseMessage[] = [],
  ): AsyncGenerator<any, void, unknown> {
    this.logger.info(
      `CollectiveAgent executing - Vision: ${this.settings.collective.vision}`,
      CollectiveAgent.name,
    );

    this.emit('collective-agent-executing', {
      agentId: this._id,
      vision: this.settings.collective.vision,
      timestamp: new Date(),
    });

    try {
      // TODO: Implement collective execution logic
      // This will integrate with CollectiveRuntimeService to:
      // 1. Create/load collective instance
      // 2. Initialize PM agent with vision task
      // 3. Start agent execution loop
      // 4. Handle inter-agent communication
      // 5. Monitor task progress
      // 6. Handle deadlocks and errors
      // 7. Yield status updates
      // 8. Return final results

      yield {
        type: 'collective_status',
        status: 'initializing',
        message: 'Collective agent initialization in progress',
      };

      // Placeholder implementation
      throw new Error('CollectiveAgent.execute() not yet implemented');
      
    } catch (error) {
      this.logger.error(
        `CollectiveAgent execution failed: ${error}`,
        CollectiveAgent.name,
      );
      
      this.emit('collective-agent-error', {
        agentId: this._id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Get the collective configuration
   */
  public getCollectiveConfig(): CollectiveAgentConfig['collective'] {
    return this.settings.collective;
  }

  /**
   * Get current collective status
   */
  public async getStatus(): Promise<any> {
    // TODO: Query CollectiveService for current status
    return {
      agentId: this._id,
      state: this.state,
      vision: this.settings.collective.vision,
      enabled: this.settings.enabled,
    };
  }

  /**
   * Pause the collective execution
   */
  public async pause(): Promise<void> {
    this.logger.info(`Pausing CollectiveAgent ${this._id}`, CollectiveAgent.name);
    this.state = AgentState.PAUSED;
    this.emit('collective-agent-paused', {
      agentId: this._id,
      timestamp: new Date(),
    });
    // TODO: Pause all running agents via CollectiveRuntimeService
  }

  /**
   * Resume the collective execution
   */
  public async resume(): Promise<void> {
    this.logger.info(`Resuming CollectiveAgent ${this._id}`, CollectiveAgent.name);
    this.state = AgentState.RUNNING;
    this.emit('collective-agent-resumed', {
      agentId: this._id,
      timestamp: new Date(),
    });
    // TODO: Resume paused agents via CollectiveRuntimeService
  }

  /**
   * Stop the collective execution
   */
  public async stop(): Promise<void> {
    this.logger.info(`Stopping CollectiveAgent ${this._id}`, CollectiveAgent.name);
    this.state = AgentState.STOPPED;
    this.emit('collective-agent-stopped', {
      agentId: this._id,
      timestamp: new Date(),
    });
    // TODO: Stop all agents and cleanup via CollectiveRuntimeService
  }
}

export default CollectiveAgent;

