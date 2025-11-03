// An abstract class that defines the structure of an agent

import { EventEmitter } from 'events';
import {
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentState,
} from '../types/agent.entity';
import {
  AgentMemoryConfig,
  AgentMemoryRecord,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { Toolkit } from '@core/infrastructure/agents/tools/toolkit.service';
import { Inject } from '@nestjs/common';
import AgentMemory from '@core/infrastructure/agents/components/memory/memory.service';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { LLMService } from '@core/infrastructure/agents/components/llm';
import {
  CheckpointRestoreResult,
  ConversationRepository,
  CreateCheckpointDto,
} from '@core/infrastructure/agents/components/vectorstores/repos/conversation.repository';
import VectorStoreService from '@core/infrastructure/agents/components/vectorstores/services/vectorstore.service';
import { MyLogger } from '@core/services/logger/logger.service';
import { TextSplitterConfig } from '@core/infrastructure/agents/components/textsplitters/textsplitter.factory';
import { EmbeddingOptions } from '@core/infrastructure/agents/components/embedder/embedder.service';
import { CheckpointService } from '@core/infrastructure/agents/components/vectorstores/services/checkpoint.service';
import { LoaderService } from '@core/infrastructure/agents/components/loaders/loader.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * Represents a base agent with lifecycle management, memory handling, and LLM interaction capabilities.
 *
 * The BaseAgent provides core functionality for:
 * - Agent state management (initialization, ready state)
 * - Memory and conversation persistence
 * - File processing and vector storage integration
 * - Prompt construction and LLM communication
 * - Streaming and non-streaming LLM interactions
 * - Operation cancellation
 *
 * This class is designed to be extended by specific agent implementations that require
 * conversational memory, tool integration, and large language model capabilities.
 *
 * @extends EventEmitter Inherits event handling capabilities
 */
export default class BaseAgent extends EventEmitter {
  protected _id!: string;
  public state: AgentState = AgentState.INITIALIZING;
  protected memoryConfig!: AgentMemoryConfig;
  protected checkpointConfig!: AgentCheckpointConfig;
  protected intelligenceConfig!: AgentIntelligenceConfig;
  protected loaderConfig!: AgentLoaderConfig;
  protected textsplitterConfig!: TextSplitterConfig;
  protected embedderConfig!: EmbeddingOptions;
  protected readonly logger!: MyLogger;

  protected custom_prompt!: string;
  protected conversationId!: ConversationIdType;
  protected abortController: AbortController | null = null;

  protected attachmentBuffer: File[] = [];

  constructor(
    @Inject(Toolkit) protected tools: Toolkit,
    @Inject(AgentMemory) protected memory: AgentMemory,
    @Inject(LLMService) protected llm: LLMService,
    @Inject(ConversationRepository)
    protected conversationRepository: ConversationRepository,
    @Inject(VectorStoreService) protected vectorStore: VectorStoreService,
    @Inject(CheckpointService) protected checkpointService: CheckpointService,
    @Inject(LoaderService) protected loaderService: LoaderService,
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
    super();
    this.logger = logger;
    this.logger.info('BaseAgent initializing', BaseAgent.name);
    this.config(config);
    // Defer initialization until a conversation is set via switchConversation
  }

  /**
   * Helper: Return recent conversation messages from memory, when available.
   * This is useful when resuming agents where a history array is otherwise empty.
   */
  public async getRecentConversationMessages(): Promise<
    [HumanMessage, ...AIMessage[]] | []
  > {
    try {
      const exported = this.memory.exportMemory(this.conversationId);
      const messages: any[] = (exported as any)?.data?.messages || [];
      if (!Array.isArray(messages) || messages.length === 0) return [];
      // Best-effort conversion to LangChain message types is omitted here due to project-specific mapping.
      // Upstream callers should provide correctly typed history when possible.
      return [];
    } catch {
      return [];
    }
  }

  protected async awaitInit() {
    this.logger.debug(
      'Waiting for agent initialization to complete',
      BaseAgent.name,
    );
    return new Promise<void>((resolve) => {
      const checkInit = () => {
        if (this.state === AgentState.READY) {
          this.logger.debug(
            'Agent initialization completed, proceeding',
            BaseAgent.name,
          );
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });
  }
  protected async init(memoryRecord?: AgentMemoryRecord) {
    this.logger.info('Initializing BaseAgent', BaseAgent.name);
    this.logger.debug(
      `Conversation ID: ${this.conversationId || 'none'}, memory record provided: ${!!memoryRecord}`,
      BaseAgent.name,
    );

    this.emit('agent-initializing', {
      conversationId: this.conversationId,
      timestamp: new Date(),
    });
    this.state = AgentState.INITIALIZING;

    // If no conversation is set yet, defer memory loading until switchConversation is called
    if (!this.conversationId) {
      this.logger.debug(
        'No conversation ID set, deferring memory loading',
        BaseAgent.name,
      );
      this.state = AgentState.READY;
      this.emit('agent-ready', {
        conversationId: this.conversationId,
        timestamp: new Date(),
      });
      return;
    }

    this.emit('memory-loading', {
      conversationId: this.conversationId,
      memoryType: this.memoryConfig.type,
      timestamp: new Date(),
    });

    let finalRecord: AgentMemoryRecord;
    if (!memoryRecord) {
      this.logger.debug(
        'Loading memory record from conversation repository',
        BaseAgent.name,
      );
      const convo = await this.conversationRepository.findById(
        this.conversationId,
      );
      if (convo && convo.memoryRecords) {
        this.logger.debug(
          'Found existing memory record in conversation',
          BaseAgent.name,
        );
        finalRecord = convo.memoryRecords as any;
      } else {
        this.logger.debug(
          `Creating new memory record for type: ${this.memoryConfig.type}`,
          BaseAgent.name,
        );
        // Create a minimal empty memory record compatible with current memory type
        finalRecord = {
          config: this.memoryConfig,
          data:
            this.memoryConfig.type === 'cbm' ||
            this.memoryConfig.type === 'cbwm'
              ? { type: this.memoryConfig.type, messages: [] }
              : this.memoryConfig.type === 'ctbm'
                ? { type: this.memoryConfig.type, messages: [] }
                : this.memoryConfig.type === 'csm'
                  ? { type: this.memoryConfig.type, summary: '' }
                  : this.memoryConfig.type === 'csbm'
                    ? { type: this.memoryConfig.type, summary: '', buffer: [] }
                    : this.memoryConfig.type === 'cem'
                      ? {
                          type: this.memoryConfig.type,
                          entities: [],
                          history: [],
                        }
                      : this.memoryConfig.type === 'ckgm'
                        ? {
                            type: this.memoryConfig.type,
                            graph: { nodes: [], edges: [] },
                          }
                        : this.memoryConfig.type === 'vsrm'
                          ? { type: this.memoryConfig.type, key: '' }
                          : { type: 'cbm', messages: [] },
        } as any;
      }
    } else {
      this.logger.debug('Using provided memory record', BaseAgent.name);
      finalRecord = memoryRecord;
    }
    await this.memory.load(this.conversationId, finalRecord);

    this.emit('memory-loaded', {
      conversationId: this.conversationId,
      memoryType: this.memoryConfig.type,
      timestamp: new Date(),
    });

    this.state = AgentState.READY;
    this.logger.info(
      'BaseAgent initialization completed successfully',
      BaseAgent.name,
    );
    this.emit('agent-ready', {
      conversationId: this.conversationId,
      timestamp: new Date(),
    });
  }

  protected config(config: {
    memoryConfig: AgentMemoryConfig;
    checkpointConfig: AgentCheckpointConfig;
    intelligenceConfig: AgentIntelligenceConfig;
    loaderConfig: AgentLoaderConfig;
    textsplitterConfig: TextSplitterConfig;
    embedderConfig: EmbeddingOptions;
  }) {
    this.logger.info('Updating BaseAgent configuration', BaseAgent.name);
    this.logger.debug(
      `Memory type: ${config.memoryConfig.type}, LLM provider: ${config.intelligenceConfig.llm.provider}`,
      BaseAgent.name,
    );

    // Load a new config and reinit the memory
    const oldConfig = { ...this.memoryConfig };
    this.memoryConfig = config.memoryConfig;
    this.checkpointConfig = config.checkpointConfig;
    this.intelligenceConfig = config.intelligenceConfig;
    this.loaderConfig = config.loaderConfig;
    this.textsplitterConfig = config.textsplitterConfig;
    this.embedderConfig = config.embedderConfig;

    this.emit('config-updated', {
      configType: 'memory',
      oldConfig,
      newConfig: this.memoryConfig,
      timestamp: new Date(),
    });

    this.logger.debug(
      'BaseAgent configuration updated successfully',
      BaseAgent.name,
    );
  }

  public reconfig(config: {
    memoryConfig: AgentMemoryConfig;
    checkpointConfig: AgentCheckpointConfig;
    intelligenceConfig: AgentIntelligenceConfig;
    loaderConfig: AgentLoaderConfig;
    textsplitterConfig: TextSplitterConfig;
    embedderConfig: EmbeddingOptions;
  }) {
    this.logger.info('Reconfiguring BaseAgent', BaseAgent.name);
    this.config(config);
    // Re-initialize memory with new config
    this.init().catch((error) => {
      const info = getErrorInfo(error);
      this.logger.error(
        'Failed to reinitialize memory during reconfig\n' + (info.stack || ''),
        BaseAgent.name,
      );
    });
    this.logger.info('BaseAgent reconfiguration completed', BaseAgent.name);
  }

  /**
   * Return a read-only snapshot of the agent's current configuration.
   * Consumers should not mutate the returned object directly.
   */
  public getCurrentConfig(): {
    memoryConfig: AgentMemoryConfig;
    checkpointConfig: AgentCheckpointConfig;
    intelligenceConfig: AgentIntelligenceConfig;
    loaderConfig: AgentLoaderConfig;
    textsplitterConfig: TextSplitterConfig;
    embedderConfig: EmbeddingOptions;
  } {
    return {
      memoryConfig: { ...(this as any).memoryConfig },
      checkpointConfig: { ...(this as any).checkpointConfig },
      intelligenceConfig: { ...(this as any).intelligenceConfig },
      loaderConfig: { ...(this as any).loaderConfig },
      textsplitterConfig: { ...(this as any).textsplitterConfig },
      embedderConfig: { ...(this as any).embedderConfig },
    };
  }

  public async switchProviders(config: AgentIntelligenceConfig) {
    this.logger.info('Switching LLM provider', BaseAgent.name);
    const oldProvider = this.intelligenceConfig.llm.provider;
    this.intelligenceConfig = config;
    this.logger.debug(
      `Provider switched from ${oldProvider} to ${config.llm.provider}`,
      BaseAgent.name,
    );
    this.emit('llm-provider-switched', {
      oldProvider,
      newProvider: config.llm.provider,
      timestamp: new Date(),
    });
  }

  protected async checkpoint(
    checkpointData: CreateCheckpointDto,
  ): Promise<void> {
    this.logger.info(
      `Creating checkpoint: ${checkpointData.name || 'unnamed'}`,
      BaseAgent.name,
    );
    this.logger.debug(
      `Checkpoint type: ${checkpointData.checkpointType}`,
      BaseAgent.name,
    );

    this.emit('checkpoint-creating', {
      conversationId: this.conversationId,
      checkpointData,
      timestamp: new Date(),
    });

    try {
      await this.checkpointService.createCheckpoint(
        this.conversationId,
        checkpointData,
      );

      this.logger.info(
        `Checkpoint created successfully: ${checkpointData.name || 'unnamed'}`,
        BaseAgent.name,
      );
      this.emit('checkpoint-created', {
        conversationId: this.conversationId,
        checkpointId: checkpointData.name || 'unnamed',
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Failed to create checkpoint\n' + (info.stack || ''),
        BaseAgent.name,
      );
      this.emit('error', {
        error: new Error(info.message),
        context: 'checkpoint creation',
        timestamp: new Date(),
      });
      throw new Error(info.message);
    }
  }

  public async restoreCheckpoint(searchOptions: {
    id?: string;
    name?: string;
    description?: string;
  }): Promise<{ success: boolean; data: CheckpointRestoreResult | undefined }> {
    this.logger.info(
      `Restoring checkpoint - ID: ${searchOptions.id || 'none'}, name: ${searchOptions.name || 'none'}`,
      BaseAgent.name,
    );

    this.emit('checkpoint-restoring', {
      conversationId: this.conversationId,
      checkpointId: searchOptions.id || searchOptions.name || 'unknown',
      timestamp: new Date(),
    });

    try {
      const checkpointId = await this.checkpointService
        .getCheckpoints(this.conversationId)
        .then((checkpoints) => {
          if (!checkpoints) return false;
          if (searchOptions.id) {
            return checkpoints.find(
              (checkpoint) => checkpoint._id === searchOptions.id,
            );
          } else if (searchOptions.name) {
            return checkpoints.find(
              (checkpoint) => checkpoint.name === searchOptions.name,
            );
          } else {
            return checkpoints.find(
              (checkpoint) =>
                checkpoint.description === searchOptions.description,
            );
          }
        });

      if (!checkpointId) {
        this.logger.warn(
          'Checkpoint not found during restoration',
          BaseAgent.name,
        );
        this.emit('warning', {
          message: 'Checkpoint not found',
          context: 'checkpoint restoration',
          timestamp: new Date(),
        });
        return { success: false, data: undefined };
      }

      this.logger.debug(
        `Found checkpoint: ${checkpointId._id}`,
        BaseAgent.name,
      );
      const result = await this.checkpointService.restoreCheckpoint(
        this.conversationId,
        checkpointId._id,
      );

      this.logger.info(
        `Checkpoint restored successfully: ${checkpointId._id}`,
        BaseAgent.name,
      );
      this.emit('checkpoint-restored', {
        conversationId: this.conversationId,
        checkpointId: checkpointId._id,
        result,
        timestamp: new Date(),
      });

      return { success: true, data: result };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Failed to restore checkpoint\n' + (info.stack || ''),
        BaseAgent.name,
      );
      this.emit('error', {
        error: new Error(info.message),
        context: 'checkpoint restoration',
        timestamp: new Date(),
      });
      throw new Error(info.message);
    }
  }

  public async switchConversation(conversationId: ConversationIdType) {
    this.logger.info(
      `Switching conversation from ${this.conversationId} to ${conversationId}`,
      BaseAgent.name,
    );
    const oldConversationId = this.conversationId;
    this.conversationId = conversationId;

    const convo = await this.conversationRepository.findById(
      this.conversationId,
    );
    const memoryRecord: AgentMemoryRecord =
      convo && (convo as any).memoryRecords
        ? (convo as any).memoryRecords
        : ({
            config: this.memoryConfig,
            data:
              this.memoryConfig.type === 'cbm' ||
              this.memoryConfig.type === 'cbwm'
                ? { type: this.memoryConfig.type, messages: [] }
                : this.memoryConfig.type === 'ctbm'
                  ? { type: this.memoryConfig.type, messages: [] }
                  : this.memoryConfig.type === 'csm'
                    ? { type: this.memoryConfig.type, summary: '' }
                    : this.memoryConfig.type === 'csbm'
                      ? {
                          type: this.memoryConfig.type,
                          summary: '',
                          buffer: [],
                        }
                      : this.memoryConfig.type === 'cem'
                        ? {
                            type: this.memoryConfig.type,
                            entities: [],
                            history: [],
                          }
                        : this.memoryConfig.type === 'ckgm'
                          ? {
                              type: this.memoryConfig.type,
                              graph: { nodes: [], edges: [] },
                            }
                          : this.memoryConfig.type === 'vsrm'
                            ? { type: this.memoryConfig.type, key: '' }
                            : { type: 'cbm', messages: [] },
          } as any);

    this.logger.debug(
      `Loading memory for conversation ${conversationId}`,
      BaseAgent.name,
    );
    await this.memory.load(this.conversationId, memoryRecord);

    // Mark agent as ready after loading memory for new conversation
    this.state = AgentState.READY;
    this.logger.info(
      `Conversation switched successfully to ${conversationId}`,
      BaseAgent.name,
    );
    this.emit('agent-ready', {
      conversationId: this.conversationId,
      timestamp: new Date(),
    });

    this.emit('conversation-switched', {
      oldConversationId,
      newConversationId: conversationId,
      timestamp: new Date(),
    });
  }

  public async switchMemory(config: AgentMemoryConfig) {
    this.logger.info(
      `Switching memory from ${this.memoryConfig.type} to ${config.type}`,
      BaseAgent.name,
    );
    const oldConfig = this.memoryConfig;
    this.memoryConfig = config;
    await this.memory.changeMemoryStructure(this.conversationId, config);
    this.logger.info('Memory structure switched successfully', BaseAgent.name);
    this.emit('memory-switched', {
      conversationId: this.conversationId,
      oldConfig,
      newConfig: config,
      timestamp: new Date(),
    });
  }

  protected async buildPrompt(
    userprompt: string,
    newMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence: string[] = ['m_1', 'p_1', 'm_1', 'p_-1', 'm_-1'],
    attachments: {
      files: File[];
      action: 'vstore' | 'deliver' | 'parse';
    }[] = [{ files: this.attachmentBuffer, action: 'parse' }],
    intelligence: AgentIntelligenceConfig = this.intelligenceConfig,
  ): Promise<HumanMessage> {
    this.logger.info('Building prompt for BaseAgent', BaseAgent.name);
    this.logger.debug(
      `User prompt length: ${userprompt.length}, token target: ${tokenTarget || 'none'}`,
      BaseAgent.name,
    );

    await this.awaitInit();
    let prompt: string = this.custom_prompt + this.tools.preparePromptPayload();

    this.emit('prompt-building', {
      input: userprompt,
      tokenTarget,
      contentSequence,
      timestamp: new Date(),
    });

    // Initialize generators
    this.emit('memory-assembling', {
      conversationId: this.conversationId,
      timestamp: new Date(),
    });

    const memoryInjection = newMessages
      ? await this.memory.assembleMemoryPayload(
          newMessages as [HumanMessage, ...AIMessage[]],
          this.conversationId,
        )
      : '';

    // Handle attachments if present
    if (attachments.some((att) => att.files.length > 0)) {
      const totalSize = attachments.reduce(
        (sum, att) =>
          sum + att.files.reduce((fileSum, file) => fileSum + file.size, 0),
        0,
      );
      this.logger.debug(
        `Processing ${attachments.reduce((sum, att) => sum + att.files.length, 0)} attachments, total size: ${totalSize} bytes`,
        BaseAgent.name,
      );
      this.emit('attachments-processing', {
        fileCount: attachments.reduce((sum, att) => sum + att.files.length, 0),
        totalSize,
        timestamp: new Date(),
      });
    }

    const preloadInjection = await this.loaderService.preload(
      userprompt,
      attachments,
      {
        conversationId: this.conversationId,
        maxTokens: (tokenTarget || intelligence.llm.tokenLimit) / 1.5,
        userId: this.userId,
        shorteningStrategy: 'vstore',
      },
    );

    let memoryContent = '';
    let preloadContent = '';
  let _deliverFiles: File[] = [];
    let memoryTokens = 0;
    let preloadTokens = 0;

    // Track generator states
    const memoryIterator =
      memoryInjection === '' ? null : memoryInjection[Symbol.asyncIterator]();
    const preloadIterator = preloadInjection[Symbol.asyncIterator]();
    let memoryDone = false;
    let preloadDone = false;

    try {
      // Process content according to the specified sequence
      for (const instruction of contentSequence) {
        const [type, countStr] = instruction.includes('_')
          ? instruction.split('_')
          : [instruction, '-1'];
        const count = parseInt(countStr) || 1;
        const isExhaustive = count === -1;

        if (type === 'm' && memoryIterator !== null) {
          // Process memory chunks
          const iterations = isExhaustive ? Infinity : count;
          for (let i = 0; i < iterations && !memoryDone; i++) {
            const memoryResult = await memoryIterator.next();
            if (!memoryResult.done) {
              const testMemoryContent = memoryResult.value;
              const potentialPrompt =
                prompt +
                '\n' +
                testMemoryContent +
                '\n' +
                preloadContent +
                '\n' +
                userprompt;
              const tokenCount = this.llm.countTokens(potentialPrompt, {
                providerName: intelligence.llm.provider,
                modelId: intelligence.llm.model,
              });

              if (tokenCount <= (tokenTarget || intelligence.llm.tokenLimit)) {
                memoryContent = testMemoryContent;
                memoryTokens = this.llm.countTokens(testMemoryContent, {
                  providerName: intelligence.llm.provider,
                  modelId: intelligence.llm.model,
                });
              } else {
                // Token limit reached, stop processing this sequence step
                this.emit('prompt-token-limit-reached', {
                  currentTokens: tokenCount,
                  limit: tokenTarget || intelligence.llm.tokenLimit,
                  step: `memory-${instruction}`,
                  timestamp: new Date(),
                });
                break;
              }
            } else {
              memoryDone = true;
              break;
            }
          }
        } else if (type === 'p') {
          // Process preload chunks
          const iterations = isExhaustive ? Infinity : count;
          for (let i = 0; i < iterations && !preloadDone; i++) {
            const preloadResult = await preloadIterator.next();
            if (!preloadResult.done) {
              const {
                preloadInjection: testPreloadContent,
                deliverFiles: newDeliverFiles,
              } = preloadResult.value;
              const potentialPrompt =
                prompt +
                '\n' +
                memoryContent +
                '\n' +
                testPreloadContent +
                '\n' +
                userprompt;
              const tokenCount = this.llm.countTokens(potentialPrompt, {
                providerName: intelligence.llm.provider,
                modelId: intelligence.llm.model,
              });

              if (tokenCount <= (tokenTarget || intelligence.llm.tokenLimit)) {
                preloadContent = testPreloadContent;
                _deliverFiles = newDeliverFiles;
                preloadTokens = this.llm.countTokens(testPreloadContent, {
                  providerName: intelligence.llm.provider,
                  modelId: intelligence.llm.model,
                });
              } else {
                // Token limit reached, stop processing this sequence step
                this.emit('prompt-token-limit-reached', {
                  currentTokens: tokenCount,
                  limit: tokenTarget || intelligence.llm.tokenLimit,
                  step: `preload-${instruction}`,
                  timestamp: new Date(),
                });
                break;
              }
            } else {
              preloadDone = true;
              break;
            }
          }
        }

        // Check if we've hit the token limit
        const currentPrompt =
          prompt +
          '\n' +
          memoryContent +
          '\n' +
          preloadContent +
          '\n' +
          userprompt;
        const currentTokenCount = this.llm.countTokens(currentPrompt, {
          providerName: intelligence.llm.provider,
          modelId: intelligence.llm.model,
        });

        if (currentTokenCount > (tokenTarget || intelligence.llm.tokenLimit)) {
          // We've exceeded the limit, break from sequence processing
          break;
        }

        // If both generators are exhausted, break
        if (memoryDone && preloadDone) {
          break;
        }
      }
    } finally {
      // Always cleanup generators
      if (memoryInjection !== '') memoryInjection.cleanup();
      preloadInjection.cleanup();
    }

    // Build final prompt
    const finalContent = [memoryContent, preloadContent]
      .filter(Boolean)
      .join('\n');
    const finalPrompt = prompt + '\n' + finalContent + '\n' + userprompt;
    const finalTokenCount = this.llm.countTokens(finalPrompt, {
      providerName: intelligence.llm.provider,
      modelId: intelligence.llm.model,
    });

    this.emit('memory-assembled', {
      conversationId: this.conversationId,
      payloadSize: memoryTokens,
      timestamp: new Date(),
    });

    this.logger.debug(
      `Prompt built - final tokens: ${finalTokenCount}, memory tokens: ${memoryTokens}, preload tokens: ${preloadTokens}`,
      BaseAgent.name,
    );
    this.emit('prompt-built', {
      finalTokenCount,
      tokenTarget,
      memoryTokens,
      preloadTokens,
      timestamp: new Date(),
    });

    return new HumanMessage(finalPrompt);
  }

  public async invoke(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<string> {
    this.logger.info('Starting BaseAgent invoke operation', BaseAgent.name);
    this.logger.debug(
      `Input length: ${input.length}, provider: ${this.intelligenceConfig.llm.provider}`,
      BaseAgent.name,
    );

    await this.awaitInit();
    // Create a new AbortController for this operation
    this.abortController = new AbortController();
    const prompt = await this.buildPrompt(
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );

    const promptTokens = this.llm.countTokens(prompt.content as string, {
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
    });

    this.logger.debug(
      `LLM invocation starting - prompt tokens: ${promptTokens}`,
      BaseAgent.name,
    );
    this.emit('llm-invocation-start', {
      provider: this.intelligenceConfig.llm.provider,
      model: this.intelligenceConfig.llm.model,
      streaming: false,
      promptTokens,
      timestamp: new Date(),
    });

    try {
      const result = await this.llm.chat([prompt], {
        providerName: this.intelligenceConfig.llm.provider,
        modelId: this.intelligenceConfig.llm.model,
        stream: false,
        abort: this.abortController.signal,
      });

      this.logger.info(
        `LLM invocation completed successfully - response length: ${result.response?.length || 0}`,
        BaseAgent.name,
      );
      this.emit('llm-invocation-complete', {
        provider: this.intelligenceConfig.llm.provider,
        model: this.intelligenceConfig.llm.model,
        streaming: false,
        responseTokens: result.response?.length || 0,
        totalTokens: result.usage?.totalTokens || 0,
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        timestamp: new Date(),
      });

      return JSON.stringify(result.response);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'LLM invocation failed\n' + (info.stack || ''),
        BaseAgent.name,
      );
      this.emit('error', {
        error: new Error(info.message),
        context: 'LLM invocation',
        timestamp: new Date(),
      });
      throw new Error(info.message);
    } finally {
      this.abortController = null;
    }
  }

  public async stream(
    input: string,
    latestMessages: [HumanMessage, ...AIMessage[]] | [],
    tokenTarget?: number,
    contentSequence?: string[],
  ): Promise<AsyncIterable<any>> {
    this.logger.info('Starting BaseAgent stream operation', BaseAgent.name);
    this.logger.debug(
      `Input length: ${input.length}, provider: ${this.intelligenceConfig.llm.provider}`,
      BaseAgent.name,
    );

    await this.awaitInit();
    // Create a new AbortController for this operation
    this.abortController = new AbortController();
    const prompt = await this.buildPrompt(
      input,
      latestMessages,
      tokenTarget,
      contentSequence,
    );

    const promptTokens = this.llm.countTokens(prompt.content as string, {
      providerName: this.intelligenceConfig.llm.provider,
      modelId: this.intelligenceConfig.llm.model,
    });

    this.logger.debug(
      `LLM streaming starting - prompt tokens: ${promptTokens}`,
      BaseAgent.name,
    );
    this.emit('llm-invocation-start', {
      provider: this.intelligenceConfig.llm.provider,
      model: this.intelligenceConfig.llm.model,
      streaming: true,
      promptTokens,
      timestamp: new Date(),
    });

    try {
      const response = this.llm.chat([prompt], {
        providerName: this.intelligenceConfig.llm.provider,
        modelId: this.intelligenceConfig.llm.model,
        stream: true,
        abort: this.abortController.signal,
      });

      this.logger.debug(
        'LLM streaming response created successfully',
        BaseAgent.name,
      );
      return response;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'LLM streaming failed\n' + (info.stack || ''),
        BaseAgent.name,
      );
      this.emit('error', {
        error: new Error(info.message),
        context: 'LLM streaming',
        timestamp: new Date(),
      });
      throw new Error(info.message);
    }
  }

  /**
   * Interrupts the current operation with a quick correction prompt to the LLM
   */
  public async correct(input: string, context: string): Promise<void> {
    this.logger.info('Applying correction to BaseAgent', BaseAgent.name);
    this.logger.debug(
      `Correction input: ${input.substring(0, 100)}...`,
      BaseAgent.name,
    );

    await this.awaitInit();

    // First, abort any current operation
    this.abort();

    // Create a new AbortController for the correction operation
    this.abortController = new AbortController();

    try {
      // Build a simple correction prompt without full context loading
      // This is meant to be a quick interruption, not a full conversation
      const correctionPrompt = new HumanMessage(
        `${context}\n\nCORRECTION/INTERRUPTION: ${input}\n\nPlease acknowledge this correction and adjust accordingly.`,
      );

      this.logger.debug('Sending correction to LLM', BaseAgent.name);
      // Send the correction as a streaming request for immediate response
      await this.llm.chat([correctionPrompt], {
        providerName: this.intelligenceConfig.llm.provider,
        modelId: this.intelligenceConfig.llm.model,
        stream: true,
        abort: this.abortController.signal,
      });

      this.logger.info('Correction applied successfully', BaseAgent.name);
      // Emit an event to notify that a correction was applied
      this.emit('correction-applied', {
        input,
        // response: result.response,
        timestamp: new Date(),
      });
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Correction failed\n' + (info.stack || ''),
        BaseAgent.name,
      );
      // If the correction fails, emit an error event
      this.emit('correction-failed', {
        input,
        error: info.message || 'Unknown error',
        timestamp: new Date(),
      });

      // Re-throw the error so the caller can handle it
      throw new Error(info.message);
    } finally {
      // Clean up the abort controller
      this.abortController = null;
    }
  }

  /**
   * Aborts the current operation if one is in progress
   */
  public abort(): void {
    if (this.abortController) {
      this.logger.info('Aborting current BaseAgent operation', BaseAgent.name);
      this.abortController.abort();
      this.abortController = null;
      this.emit('operation-aborted', {
        operationType: 'LLM interaction',
        timestamp: new Date(),
      });
    } else {
      this.logger.debug('No active operation to abort', BaseAgent.name);
    }
  }
}
