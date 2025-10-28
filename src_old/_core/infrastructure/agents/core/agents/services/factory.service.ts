import { Injectable, Inject } from '@nestjs/common';
import BaseAgent from '../structures/base';
import { ReActAgent } from '../structures/react';
import GraphAgent from '../structures/graph';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import { ConversationRepository } from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import {
  ReActAgentConfig,
  GraphAgent as GraphAgentConfig,
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  CheckPointTypes,
} from '../types/agent.entity';
import { AgentMemoryConfig } from '@core/infrastructure/agents/components/memory/memory.interface';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

export enum AgentType {
  BASE = 'base',
  REACT = 'react',
  GRAPH = 'graph',
  EXPERT = 'expert',
  GENIUS = 'genius',
  COLLECTIVE = 'collective',
  MANAGER = 'manager',
}

/**
 * Helper class for managing unique ReAct agent types
 * Each ReAct agent gets a unique type identifier based on its configuration
 */
export class ReActAgentTypeManager {
  /**
   * Generate a unique ReAct agent type based on assistant/agent configuration
   */
  static generateUniqueReActType(identifier: string): string {
    // Create a unique type identifier for this specific ReAct agent
    // Format: "react_<identifier>" where identifier is typically the assistant name or agent ID
    const sanitizedId = identifier.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `react_${sanitizedId}`;
  }

  /**
   * Check if a type is a ReAct agent type (base or unique)
   */
  static isReActType(type: string): boolean {
    return type === AgentType.REACT || type.startsWith('react_');
  }

  /**
   * Get the base type from a potentially unique type
   */
  static getBaseType(type: string): AgentType {
    if (type.startsWith('react_')) {
      return AgentType.REACT;
    }
    if (type.startsWith('graph_')) {
      return AgentType.GRAPH;
    }
    return type as AgentType;
  }

  /**
   * Extract the identifier from a unique ReAct type
   */
  static extractIdentifier(uniqueType: string): string | null {
    if (uniqueType.startsWith('react_')) {
      return uniqueType.substring(6); // Remove 'react_' prefix
    }
    return null;
  }
}

export interface AgentConfigOptions {
  memoryConfig?: Partial<AgentMemoryConfig>;
  checkpointConfig?: Partial<AgentCheckpointConfig>;
  intelligenceConfig?: Partial<AgentIntelligenceConfig>;
  loaderConfig?: Partial<AgentLoaderConfig>;
  textsplitterConfig?: Partial<TextSplitterConfig>;
  embedderConfig?: Partial<EmbeddingOptions>;
}

export interface AgentFullConfig {
  memoryConfig: AgentMemoryConfig;
  checkpointConfig: AgentCheckpointConfig;
  intelligenceConfig: AgentIntelligenceConfig;
  loaderConfig: AgentLoaderConfig;
  textsplitterConfig: TextSplitterConfig;
  embedderConfig: EmbeddingOptions;
}

@Injectable()
export class AgentFactoryService {
  constructor(
    @Inject(Toolkit) private readonly toolkit: Toolkit,
    @Inject(AgentMemory) private readonly memory: AgentMemory,
    @Inject(LLMService) private readonly llm: LLMService,
    @Inject(ConversationRepository)
    private readonly conversationRepository: ConversationRepository,
    @Inject(VectorStoreService)
    private readonly vectorStore: VectorStoreService,
    @Inject(CheckpointService)
    private readonly checkpointService: CheckpointService,
    @Inject(LoaderService) private readonly loaderService: LoaderService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'AgentFactoryService initializing',
      AgentFactoryService.name,
    );
  }

  /**
   * Create default configuration for agent creation
   */
  private createDefaultConfig(
    userId: UserIdType,
    conversationId: ConversationIdType,
    config: AgentConfigOptions = {},
  ): AgentFullConfig {
    this.logger.debug(
      `Creating default configuration for user ${userId}, conversation ${conversationId}`,
      AgentFactoryService.name,
    );
    return {
      memoryConfig: {
        type: 'buffer',
        maxSize: 10,
        ...config.memoryConfig,
      } as AgentMemoryConfig,
      checkpointConfig: {
        enabled: true,
        allowList: CheckPointTypes.All,
        maxCheckpoints: 5,
        autoSave: false,
        ...config.checkpointConfig,
      } as AgentCheckpointConfig,
      intelligenceConfig: {
        llm: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          tokenLimit: 8192,
        },
        ...config.intelligenceConfig,
      } as AgentIntelligenceConfig,
      loaderConfig: {
        enabled: true,
        type: ['file', 'link', 'image'],
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['text', 'pdf', 'docx'],
        ...config.loaderConfig,
      } as AgentLoaderConfig,
      textsplitterConfig: {
        chunkSize: 1000,
        chunkOverlap: 200,
        ...config.textsplitterConfig,
      } as TextSplitterConfig,
      embedderConfig: {
        providerName: 'openai',
        modelId: 'text-embedding-ada-002',
        ...config.embedderConfig,
      } as EmbeddingOptions,
    };
  }
  /**
   * Create a ReAct agent instance
   */
  async createReActAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    settings: ReActAgentConfig,
    config: AgentConfigOptions,
  ): Promise<ReActAgent> {
    this.logger.info(
      `Creating ReAct agent for user ${userId}, conversation ${conversationId}`,
      AgentFactoryService.name,
    );
    this.logger.debug(
      `Agent name: ${settings.name}, description: ${settings.description}`,
      AgentFactoryService.name,
    );
    const defaultConfig = this.createDefaultConfig(
      userId,
      conversationId,
      config,
    );

    const agent = new ReActAgent(
      this.toolkit,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      settings,
      defaultConfig,
      userId,
      this.logger,
    );

    // Set user and conversation context (safe: BaseAgent now defers if no convo found)
    this.logger.debug(
      'Setting conversation context for ReAct agent',
      AgentFactoryService.name,
    );
    await agent.switchConversation(conversationId);
    // Preload memory cache with an empty record to satisfy initial lookups
    try {
      const emptyRecord: any = {
        config: (agent as any)['memoryConfig'],
        data: { type: (agent as any)['memoryConfig'].type, messages: [] },
      };
      await (agent as any)['memory'].load(conversationId, emptyRecord);
      this.logger.debug(
        'Memory cache preloaded for ReAct agent',
        AgentFactoryService.name,
      );
    } catch (error) {
      this.logger.warn(
        'Failed to preload memory cache for ReAct agent',
        AgentFactoryService.name,
      );
    }

    this.logger.info(
      `ReAct agent created successfully for user ${userId}`,
      AgentFactoryService.name,
    );
    return agent;
  }
  /**
   * Create a Graph agent instance
   */
  async createGraphAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    settings: GraphAgentConfig,
    config: AgentConfigOptions,
  ): Promise<GraphAgent> {
    this.logger.info(
      `Creating Graph agent for user ${userId}, conversation ${conversationId}`,
      AgentFactoryService.name,
    );
    this.logger.debug(
      `Graph nodes: ${settings.nodes?.length || 0}, edges: ${settings.edges?.length || 0}`,
      AgentFactoryService.name,
    );
    const defaultConfig = this.createDefaultConfig(
      userId,
      conversationId,
      config,
    );

    const agent = new GraphAgent(
      this.toolkit,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      settings,
      defaultConfig,
      userId,
      conversationId,
      this.logger,
    );

    // Set user and conversation context
    this.logger.debug(
      'Setting conversation context for Graph agent',
      AgentFactoryService.name,
    );
    await agent.switchConversation(conversationId);
    try {
      const emptyRecord: any = {
        config: (agent as any)['memoryConfig'],
        data: { type: (agent as any)['memoryConfig'].type, messages: [] },
      };
      await (agent as any)['memory'].load(conversationId, emptyRecord);
      this.logger.debug(
        'Memory cache preloaded for Graph agent',
        AgentFactoryService.name,
      );
    } catch (error) {
      this.logger.warn(
        'Failed to preload memory cache for Graph agent',
        AgentFactoryService.name,
      );
    }

    this.logger.info(
      `Graph agent created successfully for user ${userId}`,
      AgentFactoryService.name,
    );
    return agent;
  }

  /**
   * Create a Base agent instance
   */
  async createBaseAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    settings: Partial<ReActAgentConfig>,
    config: AgentConfigOptions,
  ): Promise<BaseAgent> {
    this.logger.info(
      `Creating Base agent for user ${userId}, conversation ${conversationId}`,
      AgentFactoryService.name,
    );
    const defaultConfig = this.createDefaultConfig(
      userId,
      conversationId,
      config,
    );

    const agent = new BaseAgent(
      this.toolkit,
      this.memory,
      this.llm,
      this.conversationRepository,
      this.vectorStore,
      this.checkpointService,
      this.loaderService,
      defaultConfig,
      userId,
      this.logger,
    );

    // Set user and conversation context
    this.logger.debug(
      'Setting conversation context for Base agent',
      AgentFactoryService.name,
    );
    await agent.switchConversation(conversationId);

    this.logger.info(
      `Base agent created successfully for user ${userId}`,
      AgentFactoryService.name,
    );
    return agent;
  }
  /**
   * Create an agent instance based on type (supports unique ReAct types)
   */
  async createAgentByType(
    type: AgentType | string, // Allow string for unique ReAct types
    userId: UserIdType,
    conversationId: ConversationIdType,
    settings: any,
    config: AgentConfigOptions,
  ): Promise<BaseAgent> {
    this.logger.info(
      `Creating agent by type: ${type} for user ${userId}`,
      AgentFactoryService.name,
    );
    const baseType = ReActAgentTypeManager.getBaseType(type);
    this.logger.debug(
      `Base type determined: ${baseType}`,
      AgentFactoryService.name,
    );

    switch (baseType) {
      case AgentType.REACT:
        this.logger.debug(
          'Creating ReAct agent via type factory',
          AgentFactoryService.name,
        );
        return this.createReActAgent(
          userId,
          conversationId,
          settings as ReActAgentConfig,
          config,
        );

      case AgentType.GRAPH:
        this.logger.debug(
          'Creating Graph agent via type factory',
          AgentFactoryService.name,
        );
        return this.createGraphAgent(
          userId,
          conversationId,
          settings as GraphAgentConfig,
          config,
        );

      case AgentType.BASE:
      default:
        this.logger.debug(
          'Creating Base agent via type factory',
          AgentFactoryService.name,
        );
        return this.createBaseAgent(
          userId,
          conversationId,
          settings as Partial<ReActAgentConfig>,
          config,
        );
    }
  }
}
