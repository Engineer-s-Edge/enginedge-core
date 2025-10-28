import { Injectable } from '@nestjs/common';
import {
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
} from '../types/agent.entity';
import {
  AgentMemoryConfig,
  AgentMemoryType,
  BufferMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { CheckPointTypes } from '../types/agent.entity';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

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
export class AgentConfigurationService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'AgentConfigurationService initializing',
      AgentConfigurationService.name,
    );
  }
  /**
   * Create default configuration for agent creation
   */
  createDefaultConfig(
    userId: UserIdType,
    conversationId: ConversationIdType,
    config: AgentConfigOptions = {},
  ): AgentFullConfig {
    this.logger.info(
      `Creating default configuration for user ${userId}, conversation ${conversationId}`,
      AgentConfigurationService.name,
    );
    this.logger.debug(
      `Configuration options provided: ${JSON.stringify(config)}`,
      AgentConfigurationService.name,
    );

    const defaultConfig = {
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
        type: 'recursive',
        options: {
          chunkSize: 1000,
          chunkOverlap: 200,
        },
        ...config.textsplitterConfig,
      } as TextSplitterConfig,
      embedderConfig: {
        providerName: 'openai',
        modelId: 'text-embedding-ada-002',
        ...config.embedderConfig,
      } as EmbeddingOptions,
    };

    this.logger.info(
      `Default configuration created successfully for user ${userId}`,
      AgentConfigurationService.name,
    );
    this.logger.debug(
      `Memory type: ${defaultConfig.memoryConfig.type}, LLM provider: ${defaultConfig.intelligenceConfig.llm.provider}`,
      AgentConfigurationService.name,
    );

    return defaultConfig;
  } /**
   * Get default memory configuration
   */
  getDefaultMemoryConfig(): AgentMemoryConfig {
    this.logger.info(
      'Getting default memory configuration',
      AgentConfigurationService.name,
    );
    const config = {
      type: AgentMemoryType.ConversationBufferMemory,
    } as BufferMemoryConfig;
    this.logger.debug(
      `Default memory type: ${config.type}`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Get default memory configuration for a specific type
   */
  private getDefaultMemoryConfigByType(
    type: AgentMemoryType,
    partial: Partial<AgentMemoryConfig>,
  ): AgentMemoryConfig {
    this.logger.debug(
      `Getting default memory configuration for type: ${type}`,
      AgentConfigurationService.name,
    );
    switch (type) {
      case AgentMemoryType.ConversationBufferMemory:
        return {
          type: AgentMemoryType.ConversationBufferMemory,
          ...partial,
        } as AgentMemoryConfig;
      case AgentMemoryType.ConversationBufferWindowMemory:
        return {
          type: AgentMemoryType.ConversationBufferWindowMemory,
          maxSize: 10,
          ...partial,
        } as AgentMemoryConfig;
      case AgentMemoryType.ConversationTokenBufferMemory:
        return {
          type: AgentMemoryType.ConversationTokenBufferMemory,
          maxTokenLimit: 2000,
          ...partial,
        } as AgentMemoryConfig;
      case AgentMemoryType.ConversationSummaryMemory:
        return {
          type: AgentMemoryType.ConversationSummaryMemory,
          llm: {
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            tokenLimit: 8192,
          },
          ...partial,
        } as AgentMemoryConfig;
      case AgentMemoryType.ConversationSummaryBufferMemory:
        return {
          type: AgentMemoryType.ConversationSummaryBufferMemory,
          maxSize: 5,
          llm: {
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            tokenLimit: 8192,
          },
          ...partial,
        } as AgentMemoryConfig;
      default:
        this.logger.error(
          `Unsupported memory type: ${type}`,
          AgentConfigurationService.name,
        );
        throw new Error(`Unsupported memory type: ${type}`);
    }
  }

  /**
   * Get default checkpoint configuration
   */
  getDefaultCheckpointConfig(): AgentCheckpointConfig {
    this.logger.info(
      'Getting default checkpoint configuration',
      AgentConfigurationService.name,
    );
    const config = {
      enabled: true,
      allowList: CheckPointTypes.All,
      maxCheckpoints: 5,
      autoSave: false,
    } as AgentCheckpointConfig;
    this.logger.debug(
      `Checkpoint enabled: ${config.enabled}, max checkpoints: ${config.maxCheckpoints}`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Get default intelligence configuration
   */
  getDefaultIntelligenceConfig(): AgentIntelligenceConfig {
    this.logger.info(
      'Getting default intelligence configuration',
      AgentConfigurationService.name,
    );
    const config = {
      llm: {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        tokenLimit: 8192,
      },
    } as AgentIntelligenceConfig;
    this.logger.debug(
      `LLM provider: ${config.llm.provider}, model: ${config.llm.model}`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Get default loader configuration
   */ getDefaultLoaderConfig(): AgentLoaderConfig {
    this.logger.info(
      'Getting default loader configuration',
      AgentConfigurationService.name,
    );
    const config = {
      enabled: true,
      type: ['file', 'link', 'image'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['text', 'pdf', 'docx'],
    } as AgentLoaderConfig;
    this.logger.debug(
      `Loader enabled: ${config.enabled}, max file size: ${config.maxFileSize} bytes`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Get default text splitter configuration
   */ getDefaultTextSplitterConfig(): TextSplitterConfig {
    this.logger.info(
      'Getting default text splitter configuration',
      AgentConfigurationService.name,
    );
    const config = {
      type: 'recursive',
      options: {
        chunkSize: 1000,
        chunkOverlap: 200,
      },
    } as TextSplitterConfig;
    this.logger.debug(
      `Text splitter type: ${config.type}`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Get default embedder configuration
   */
  getDefaultEmbedderConfig(): EmbeddingOptions {
    this.logger.info(
      'Getting default embedder configuration',
      AgentConfigurationService.name,
    );
    const config = {
      providerName: 'openai',
      modelId: 'text-embedding-ada-002',
    } as EmbeddingOptions;
    this.logger.debug(
      `Embedder provider: ${config.providerName}, model: ${config.modelId}`,
      AgentConfigurationService.name,
    );
    return config;
  }

  /**
   * Merge partial configuration with defaults
   */
  mergeWithDefaults(
    userId: UserIdType,
    conversationId: ConversationIdType,
    partialConfig: AgentConfigOptions,
  ): AgentFullConfig {
    this.logger.info(
      `Merging partial configuration with defaults for user ${userId}`,
      AgentConfigurationService.name,
    );
    return this.createDefaultConfig(userId, conversationId, partialConfig);
  }

  /**
   * Validate configuration completeness
   */
  validateConfiguration(config: Partial<AgentFullConfig>): boolean {
    this.logger.info(
      'Validating configuration completeness',
      AgentConfigurationService.name,
    );
    const requiredFields = [
      'memoryConfig',
      'checkpointConfig',
      'intelligenceConfig',
      'loaderConfig',
      'textsplitterConfig',
      'embedderConfig',
    ];

    const isValid = requiredFields.every(
      (field) =>
        field in config && config[field as keyof AgentFullConfig] !== undefined,
    );

    if (isValid) {
      this.logger.info(
        'Configuration validation passed',
        AgentConfigurationService.name,
      );
    } else {
      this.logger.warn(
        'Configuration validation failed - missing required fields',
        AgentConfigurationService.name,
      );
      const missingFields = requiredFields.filter(
        (field) =>
          !(
            field in config &&
            config[field as keyof AgentFullConfig] !== undefined
          ),
      );
      this.logger.debug(
        `Missing fields: ${missingFields.join(', ')}`,
        AgentConfigurationService.name,
      );
    }

    return isValid;
  }
  /**
   * Update configuration with new values
   */
  updateConfiguration(
    currentConfig: AgentFullConfig,
    updates: AgentConfigOptions,
  ): AgentFullConfig {
    this.logger.info(
      'Updating configuration with new values',
      AgentConfigurationService.name,
    );
    this.logger.debug(
      `Updates provided: ${JSON.stringify(updates)}`,
      AgentConfigurationService.name,
    );

    const updatedConfig = {
      memoryConfig: this.mergeMemoryConfig(
        currentConfig.memoryConfig,
        updates.memoryConfig,
      ),
      checkpointConfig: {
        ...currentConfig.checkpointConfig,
        ...updates.checkpointConfig,
      },
      intelligenceConfig: {
        ...currentConfig.intelligenceConfig,
        ...updates.intelligenceConfig,
      },
      loaderConfig: { ...currentConfig.loaderConfig, ...updates.loaderConfig },
      textsplitterConfig: {
        ...currentConfig.textsplitterConfig,
        ...updates.textsplitterConfig,
      },
      embedderConfig: {
        ...currentConfig.embedderConfig,
        ...updates.embedderConfig,
      },
    };

    this.logger.info(
      'Configuration updated successfully',
      AgentConfigurationService.name,
    );
    return updatedConfig;
  }
  /**
   * Safely merge memory configurations while preserving discriminated union types
   */
  private mergeMemoryConfig(
    current: AgentMemoryConfig,
    updates: Partial<AgentMemoryConfig> | undefined,
  ): AgentMemoryConfig {
    this.logger.debug(
      `Merging memory config - current type: ${current.type}`,
      AgentConfigurationService.name,
    );

    if (!updates) {
      this.logger.debug(
        'No memory config updates provided, returning current config',
        AgentConfigurationService.name,
      );
      return current;
    }

    // If the type is changing, use the new config entirely (with defaults filled in)
    if (updates.type && updates.type !== current.type) {
      this.logger.info(
        `Memory type changing from ${current.type} to ${updates.type}`,
        AgentConfigurationService.name,
      );
      return this.getDefaultMemoryConfigByType(updates.type, updates);
    }

    // Same type, safe to merge properties
    this.logger.debug(
      'Merging memory config properties (same type)',
      AgentConfigurationService.name,
    );
    return { ...current, ...updates } as AgentMemoryConfig;
  }
}
