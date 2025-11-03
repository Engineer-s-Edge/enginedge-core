import {
  BufferMemoryConfig,
  BufferWindowMemoryConfig,
  TokenBufferMemoryConfig,
  SummaryMemoryConfig,
  SummaryBufferMemoryConfig,
  EntityMemoryConfig,
  KGMemoryConfig,
  VectorStoreRetrieverMemoryConfig,
  AgentMemoryType,
  AgentMemoryConfig,
  AgentMemoryRecord,
} from './memory.interface';
import * as structs from './structures';
import VectorStoreService from '../vectorstores/services/vectorstore.service';
import { TextSplitterService } from '../textsplitters';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ConversationIdType } from '@core/infrastructure/database/utils/custom_types';
import { EmbeddingOptions } from '../embedder/embedder.service';
import { Inject } from '@nestjs/common';
import { getErrorInfo } from '@common/error-assertions';
import { LLMService } from '../llm';
import { MyLogger } from '@core/services/logger/logger.service';
import { Types } from 'mongoose';

/**
 * AgentMemory orchestrates different memory structures per conversation.
 */
export default class AgentMemory {
  private cache: Map<
    ConversationIdType,
    { config: AgentMemoryConfig; instance: any }
  >;
  private cacheAccessOrder: Map<ConversationIdType, number>;
  private cacheSize: number;
  private embedderConfig?: EmbeddingOptions;
  private ready: boolean = false;
  constructor(
    cacheSize: number = 5,
    @Inject(VectorStoreService) private vectorStoreService: VectorStoreService,
    @Inject(TextSplitterService)
    private textSplitterService: TextSplitterService,
    @Inject(LLMService) private llm: LLMService,
    private readonly logger: MyLogger,
    embedderConfig?: EmbeddingOptions,
  ) {
    this.cache = new Map();
    this.cacheAccessOrder = new Map();
    this.cacheSize = cacheSize;
    this.vectorStoreService = vectorStoreService;
    this.textSplitterService = textSplitterService;
    this.embedderConfig = embedderConfig;

    this.logger.info(
      `AgentMemory initialized with cache size: ${cacheSize}`,
      AgentMemory.name,
    );

    if (this.embedderConfig) {
      this.ready = true;
      this.logger.info(
        'AgentMemory ready with pre-configured embedder',
        AgentMemory.name,
      );
    } else {
      // Defer embedder configuration to when it's first needed
      this.ready = false;
      this.logger.info(
        'AgentMemory will configure embedder on first use',
        AgentMemory.name,
      );
    }
  }
  /** Ensure the embedder is configured and ready to use. */
  private async ensureEmbedder(): Promise<EmbeddingOptions> {
    if (this.embedderConfig) {
      return this.embedderConfig;
    }

    this.logger.info('Configuring embedder for AgentMemory', AgentMemory.name);

    try {
      const embeddingModels = await this.llm.getFallbackEmbeddingModels();
      if (embeddingModels.length === 0) {
        this.logger.error(
          'No embedding models available for AgentMemory',
          undefined,
          AgentMemory.name,
        );
        throw new Error(
          'No embedding models available. Please configure at least one embedding model.',
        );
      }
      const model = embeddingModels.filter((model) => model !== null)[0];
      this.embedderConfig = {
        providerName: model.provider,
        modelId: model.modelId,
      };
      this.ready = true;

      this.logger.info(
        `AgentMemory embedder configured with provider: ${model.provider}, model: ${model.modelId}`,
        AgentMemory.name,
      );
      return this.embedderConfig;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Failed to configure embedder for AgentMemory:\n' + (info.stack || ''),
        AgentMemory.name,
      );
      throw new Error(info.message);
    }
  }

  /** Clear all conversations from the cache. */
  clearCache() {
    const cacheSize = this.cache.size;
    this.cache.clear();
    this.cacheAccessOrder.clear();
    this.logger.info(
      `Cleared AgentMemory cache, removed ${cacheSize} conversations`,
      AgentMemory.name,
    );
  }

  /** Resize the cache, evicting least-recently-used entries if needed. */
  setCacheSize(size: number) {
    const oldSize = this.cacheSize;
    this.cacheSize = size;

    let evictedCount = 0;
    while (this.cache.size > this.cacheSize) {
      const oldest = [...this.cacheAccessOrder.entries()].sort(
        (a, b) => a[1] - b[1],
      )[0][0];
      this.cache.delete(oldest);
      this.cacheAccessOrder.delete(oldest);
      evictedCount++;
    }

    this.logger.info(
      `AgentMemory cache resized from ${oldSize} to ${size}, evicted ${evictedCount} conversations`,
      AgentMemory.name,
    );
  }

  /** Instantiate the proper memory structure based on config. */
  private initMemory(config: AgentMemoryConfig) {
    // Support legacy/alias string identifiers that may appear in dynamically created configs
    // without strictly using the AgentMemoryType enum values.
    let type: any = (config as any).type;
    switch (type) {
      case 'buffer':
        type = AgentMemoryType.ConversationBufferMemory;
        break;
      case 'buffer_window':
        type = AgentMemoryType.ConversationBufferWindowMemory;
        break;
      case 'token_buffer':
        type = AgentMemoryType.ConversationTokenBufferMemory;
        break;
      case 'summary':
        type = AgentMemoryType.ConversationSummaryMemory;
        break;
      case 'summary_buffer':
        type = AgentMemoryType.ConversationSummaryBufferMemory;
        break;
      case 'entity':
        type = AgentMemoryType.ConversationEntityMemory;
        break;
      case 'knowledge_graph':
      case 'kg':
        type = AgentMemoryType.ConversationKGMemory;
        break;
      case 'vector_retriever':
      case 'vector_store':
        type = AgentMemoryType.VectorStoreRetrieverMemory;
        break;
    }

    switch (type) {
      case AgentMemoryType.ConversationBufferMemory:
        return new structs.ConversationBufferMemory(
          config as BufferMemoryConfig,
          this.logger,
        );
      case AgentMemoryType.ConversationBufferWindowMemory:
        return new structs.ConversationBufferWindowMemory(
          config as BufferWindowMemoryConfig,
          this.logger,
        );
      case AgentMemoryType.ConversationTokenBufferMemory:
        return new structs.ConversationTokenBufferMemory(
          config as TokenBufferMemoryConfig,
          this.llm,
          this.logger,
        );
      case AgentMemoryType.ConversationSummaryMemory:
        return new structs.ConversationSummaryMemory(
          config as SummaryMemoryConfig,
          this.llm,
          this.logger,
        );
      case AgentMemoryType.ConversationSummaryBufferMemory:
        return new structs.ConversationSummaryBufferMemory(
          config as SummaryBufferMemoryConfig,
          this.llm,
          this.logger,
        );
      case AgentMemoryType.ConversationEntityMemory:
        return new structs.ConversationEntityMemory(
          config as EntityMemoryConfig,
          this.llm,
          this.logger,
        );
      case AgentMemoryType.ConversationKGMemory:
        return new structs.ConversationKGMemory(
          config as KGMemoryConfig,
          this.llm,
          this.logger,
        );
      case AgentMemoryType.VectorStoreRetrieverMemory:
        if (!this.vectorStoreService || !this.textSplitterService) {
          throw new Error(
            'VectorStoreService and TextSplitterService must be provided to use VectorStoreRetrieverMemory',
          );
        }
        return new structs.VectorStoreRetrieverMemory(
          this.vectorStoreService,
          config as VectorStoreRetrieverMemoryConfig,
          this.logger,
        );
      default:
        throw new Error(`Unsupported memory type: ${(config as any).type}`);
    }
  }

  /**
   * Wait for the memory service to be initialized.
   */
  async awaitInit() {
    if (!this.ready) {
      // Proactively configure the embedder instead of busy-waiting and propagate errors
      await this.ensureEmbedder();
    }
  }

  /**
   * Load a memory record into the cache, instantiating its structure and populating stored data.
   */
  async load(conversationId: ConversationIdType, record: AgentMemoryRecord) {
    this.logger.info(
      `Loading memory for conversation: ${conversationId}, type: ${record.config.type}`,
      AgentMemory.name,
    );

    await this.awaitInit();

    if (!this.cache.has(conversationId) && this.cache.size >= this.cacheSize) {
      const oldest = [...this.cacheAccessOrder.entries()].sort(
        (a, b) => a[1] - b[1],
      )[0][0];
      this.cache.delete(oldest);
      this.cacheAccessOrder.delete(oldest);
      this.logger.info(
        `Evicted oldest conversation from cache: ${oldest}`,
        AgentMemory.name,
      );
    }

    const instance = this.initMemory(record.config);
    const data = record.data as any;

    // Normalize legacy alias types for downstream switch just like initMemory
    let loadType: any = (record.config as any).type;
    switch (loadType) {
      case 'buffer':
        loadType = AgentMemoryType.ConversationBufferMemory;
        break;
      case 'buffer_window':
        loadType = AgentMemoryType.ConversationBufferWindowMemory;
        break;
      case 'token_buffer':
        loadType = AgentMemoryType.ConversationTokenBufferMemory;
        break;
      case 'summary':
        loadType = AgentMemoryType.ConversationSummaryMemory;
        break;
      case 'summary_buffer':
        loadType = AgentMemoryType.ConversationSummaryBufferMemory;
        break;
      case 'entity':
        loadType = AgentMemoryType.ConversationEntityMemory;
        break;
      case 'knowledge_graph':
      case 'kg':
        loadType = AgentMemoryType.ConversationKGMemory;
        break;
      case 'vector_retriever':
      case 'vector_store':
        loadType = AgentMemoryType.VectorStoreRetrieverMemory;
        break;
    }

    switch (loadType) {
      case AgentMemoryType.ConversationBufferMemory:
      case AgentMemoryType.ConversationBufferWindowMemory:
        (instance as structs.ConversationBufferWindowMemory).load =
          data.messages;
        break;
      case AgentMemoryType.ConversationTokenBufferMemory:
        (instance as any).buffer = data.messages;
        (instance as structs.ConversationTokenBufferMemory).recalculateTokens();
        break;
      case AgentMemoryType.ConversationSummaryMemory:
        (instance as structs.ConversationSummaryMemory).load = data.summary;
        break;
      case AgentMemoryType.ConversationSummaryBufferMemory:
        (instance as structs.ConversationSummaryBufferMemory).load = {
          summary: data.summary,
          buffer: data.buffer,
        };
        break;
      case AgentMemoryType.ConversationEntityMemory:
        // Entities loaded via default constructor state
        break;
      case AgentMemoryType.ConversationKGMemory:
        (instance as structs.ConversationKGMemory).loadFromJSON(data.graph);
        break;
      case AgentMemoryType.VectorStoreRetrieverMemory:
        // No state to restore
        break;
      default:
        throw new Error(`Unsupported memory type: ${record.config as any}`);
    }

    this.cache.set(conversationId, { config: record.config, instance });
    this.cacheAccessOrder.set(conversationId, Date.now());

    this.logger.info(
      `Successfully loaded memory for conversation: ${conversationId}`,
      AgentMemory.name,
    );
  }
  /**
   * Update memory structure for an existing conversation, preserving data through migration.
   */
  async changeMemoryStructure(
    conversationId: ConversationIdType,
    newConfig: AgentMemoryConfig,
  ) {
    await this.awaitInit();
    const entry = this.cache.get(conversationId);
    if (!entry) throw new Error(`Conversation ${conversationId} not loaded`);

    // If it's the same memory type, just update the config and reinitialize
    if (entry.config.type === newConfig.type) {
      const instance = this.initMemory(newConfig);
      // For same type, try to preserve existing data by exporting and re-loading
      const currentRecord = this.exportMemory(conversationId);
      if (currentRecord) {
        await this.loadMemoryData(instance, newConfig, currentRecord.data);
      }
      this.cache.set(conversationId, { config: newConfig, instance });
      this.cacheAccessOrder.set(conversationId, Date.now());
      return;
    }

    // Export current memory data
    const currentRecord = this.exportMemory(conversationId);
    if (!currentRecord) {
      throw new Error(`Failed to export current memory for ${conversationId}`);
    }

    // Create new memory instance
    const newInstance = this.initMemory(newConfig);

    // Migrate data between different memory types
    const migratedData = await this.migrateMemoryData(
      entry.config,
      newConfig,
      currentRecord.data,
    );

    // Load migrated data into new instance
    await this.loadMemoryData(newInstance, newConfig, migratedData);

    // Update cache
    this.cache.set(conversationId, {
      config: newConfig,
      instance: newInstance,
    });
    this.cacheAccessOrder.set(conversationId, Date.now());
  }

  /**
   * Incorporate a new human+AI turn, yielding context payloads of decreasing size.
   * Returns an async generator with a single .cleanup() to kill all temporaries.
   */
  async assembleMemoryPayload(
    newMessages: [HumanMessage, ...AIMessage[]],
    conversationId: ConversationIdType,
  ): Promise<AsyncGenerator<string> & { cleanup: () => void }> {
    const entry = this.cache.get(conversationId);
    if (!entry) throw new Error(`Memory for ${conversationId} not loaded`);

    // Wait for embedder to be ready if needed
    await this.awaitInit();

    const cleanupFns: Array<() => void> = [];
    const self = this;

    const gen = async function* (embedderConfig?: EmbeddingOptions) {
      embedderConfig = embedderConfig ?? self.embedderConfig;
      const { config, instance } = entry;

      // Add new messages
      const [human, ...ais] = newMessages;
      
      // Check if we have valid messages
      if (!human) {
        self.logger.warn(
          `No human message in newMessages array for conversation ${conversationId}`,
          AgentMemory.name,
        );
        return; // Early return if no valid messages
      }
      
      const wrap = (msg: HumanMessage | AIMessage) => ({
        _id: msg.id || new Types.ObjectId().toString(),  // Generate ID if not present
        sender: msg instanceof HumanMessage ? 'human' : 'ai',
        text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
      if ('addMessage' in instance) {
        instance.addMessage(wrap(human));
        for (const ai of ais) instance.addMessage(wrap(ai));
      } else if ('processMessage' in instance) {
        await instance.processMessage(wrap(human));
        for (const ai of ais) await instance.processMessage(wrap(ai));
      }

      switch (config.type) {
        case AgentMemoryType.ConversationBufferMemory:
        case AgentMemoryType.ConversationBufferWindowMemory: {
          const buf = instance as
            | structs.ConversationBufferMemory
            | structs.ConversationBufferWindowMemory;

          // 1) Full buffer
          yield `Full buffer:\n${buf
            .getMessages()
            .map((m) => `${m.sender}: ${m.text}`)
            .join('\n')}`;

          // 2) SummaryBuffer fallback
          const sbm = new structs.ConversationSummaryBufferMemory(
            {
              ...config,
              summaryBuffer: buf.getMessages(),
              maxSize: 5,
              type: AgentMemoryType.ConversationSummaryBufferMemory,
            },
            self.llm,
            self.logger,
          );
          cleanupFns.push(() => sbm.kill());
          const combinedSBM = sbm.getCombinedContext();
          yield `Summary:\n${combinedSBM.summary}\n\nRecent messages:\n${combinedSBM.recentMessages
            .map((m) => `${m.sender}: ${m.text}`)
            .join('\n')}`;

          // 3) Shrink window
          const maxSize = sbm.getMaxSize();
          for (let i = maxSize; i > 0; i--) {
            sbm.resize(i);
            yield `Window:\n${sbm
              .getMessages()
              .map((m) => `${m.sender}: ${m.text}`)
              .join('\n')}`;
          }

          // 4) Summary-only fallback
          sbm.resize(0);
          yield `Summary:\n${sbm.getCombinedContext().summary}`;
          break;
        }

        case AgentMemoryType.ConversationTokenBufferMemory: {
          const buf = instance as structs.ConversationTokenBufferMemory;
          const maxSize = buf.getMaxTokens();
          const currentSize = buf.getCurrentTokenCount();

          // 1) Full buffer
          yield `Token buffer (${currentSize}/${maxSize} tokens):\n${buf
            .getMessages()
            .map((m) => `${m.sender}: ${m.text}`)
            .join('\n')}`;

          // 2) Shrink window in steps
          const steps = 4;
          for (let i = 1; i <= steps; i++) {
            const targetSize = Math.floor(maxSize * (1 - i / (steps + 1)));
            if (targetSize <= 0) break;

            const tempBuf = buf.duplicate();
            cleanupFns.push(() => tempBuf.kill());
            tempBuf.trimToTokens(targetSize);

            yield `Reduced token buffer (${tempBuf.getCurrentTokenCount()}/${targetSize} tokens):\n${tempBuf
              .getMessages()
              .map((m) => `${m.sender}: ${m.text}`)
              .join('\n')}`;
          }

          break;
        }

        case AgentMemoryType.ConversationSummaryMemory: {
          // This will always be a very small summary, so theoretically no need to reduce
          const sm = instance as structs.ConversationSummaryMemory;
          yield sm.summary;
          break;
        }

        case AgentMemoryType.ConversationSummaryBufferMemory: {
          const orig = instance as structs.ConversationSummaryBufferMemory;
          const dup = orig.duplicate();
          cleanupFns.push(() => dup.kill());

          // 1) Full
          let ctx = dup.getCombinedContext();
          yield `Summary:\n${ctx.summary}\n\nRecent messages:\n${ctx.recentMessages
            .map((m) => `${m.sender}: ${m.text}`)
            .join('\n')}`;

          // 2) Shrink window
          const maxSize = dup.getMaxSize();
          for (let i = maxSize; i > 0; i--) {
            dup.resize(i);
            ctx = dup.getCombinedContext();
            yield `Summary:\n${ctx.summary}\n\nRecent messages:\n${ctx.recentMessages
              .map((m) => `${m.sender}: ${m.text}`)
              .join('\n')}`;
          }

          // 3) Summary-only
          dup.resize(0);
          yield dup.getCombinedContext().summary;
          break;
        }

        case AgentMemoryType.ConversationEntityMemory: {
          const cem = instance as structs.ConversationEntityMemory;

          // 1) Full entity list
          yield `Entities:\n${cem.formatEntitiesForPrompt()}`;

          const total = cem.getAllEntities().length;

          // 2) Gradually reduce topK
          for (let k = total - 1; k > 0; k--) {
            yield `Top ${k} entities:\n${cem.formatEntitiesForPrompt({ topK: k })}`;
          }

          // 3) Final fallback: just names
          const names = cem
            .getAllEntities()
            .map((e) => e.name)
            .join(', ');
          yield `Entity names: ${names}`;
          break;
        }

        case AgentMemoryType.ConversationKGMemory: {
          const kg = instance as structs.ConversationKGMemory;
          // Generate subgraph prompts based on the latest user message
          const prompts = kg.formatSubgraphForPrompt(human.text);
          for (const p of prompts) {
            yield p;
          }
          break;
        }

        case AgentMemoryType.VectorStoreRetrieverMemory: {
          const cfg = config as VectorStoreRetrieverMemoryConfig;
          for (let k = cfg.topK || 5; k > 0; k--) {
            yield await (
              instance as structs.VectorStoreRetrieverMemory
            ).getContextForPrompt(
              human.text,
              k,
              cfg.useSnippets,
              embedderConfig!,
            );
          }
          break;
        }
      }
    }.bind(self)();

    // single cleanup to kill _all_ temporaries
    (gen as any).cleanup = () => {
      cleanupFns.forEach((fn) => fn());
    };

    return gen as AsyncGenerator<string> & { cleanup: () => void };
  }

  /**
   * Export the serialized memory record for persistence.
   */
  exportMemory(
    conversationId: ConversationIdType,
  ): AgentMemoryRecord | undefined {
    const entry = this.cache.get(conversationId);
    if (!entry) return;
    const { config, instance } = entry;
    let data: any;

    switch (config.type) {
      case AgentMemoryType.ConversationBufferMemory:
      case AgentMemoryType.ConversationBufferWindowMemory:
        data = { type: config.type, messages: instance.getMessages() };
        break;
      case AgentMemoryType.ConversationTokenBufferMemory:
        data = { type: config.type, messages: instance.getMessages() };
        break;
      case AgentMemoryType.ConversationSummaryMemory:
        data = { type: config.type, summary: instance.summary };
        break;
      case AgentMemoryType.ConversationSummaryBufferMemory: {
        const ctx = (
          instance as structs.ConversationSummaryBufferMemory
        ).getCombinedContext();
        data = {
          type: config.type,
          summary: ctx.summary,
          buffer: ctx.recentMessages,
        };
        break;
      }
      case AgentMemoryType.ConversationEntityMemory:
        data = {
          type: config.type,
          entities: (
            instance as structs.ConversationEntityMemory
          ).getAllEntities(),
        };
        break;
      case AgentMemoryType.ConversationKGMemory:
        data = {
          type: config.type,
          graph: (instance as structs.ConversationKGMemory).toJSON(),
        };
        break;
      case AgentMemoryType.VectorStoreRetrieverMemory:
        data = {
          type: config.type,
          key: (config as VectorStoreRetrieverMemoryConfig).conversationId,
        };
        break;
    }

    return { config, data, lastUpdated: new Date().toISOString() };
  }

  /**
   * Migrate data from one memory type to another, preserving as much information as possible.
   */
  private async migrateMemoryData(
    oldConfig: AgentMemoryConfig,
    newConfig: AgentMemoryConfig,
    oldData: any,
  ): Promise<any> {
    // Extract base message data from old memory type
    const messages = this.extractMessages(oldConfig, oldData);

    // Convert to new memory type format
    return this.convertToMemoryFormat(newConfig, messages, oldData);
  }

  /**
   * Extract messages from any memory type's data.
   */
  private extractMessages(config: AgentMemoryConfig, data: any): any[] {
    switch (config.type) {
      case AgentMemoryType.ConversationBufferMemory:
      case AgentMemoryType.ConversationBufferWindowMemory:
      case AgentMemoryType.ConversationTokenBufferMemory:
        return data.messages || [];

      case AgentMemoryType.ConversationSummaryBufferMemory:
        return data.buffer || [];

      case AgentMemoryType.ConversationSummaryMemory:
        // For summary only, create a single summary message
        return data.summary
          ? [
              {
                _id: 'summary',
                sender: 'system',
                text: `Previous conversation summary: ${data.summary}`,
              },
            ]
          : [];

      case AgentMemoryType.ConversationEntityMemory:
        // Convert entities to messages if needed
        if (data.entities && data.entities.length > 0) {
          return [
            {
              _id: 'entities',
              sender: 'system',
              text: `Known entities: ${data.entities.map((e: any) => e.name || e).join(', ')}`,
            },
          ];
        }
        return data.history || [];

      case AgentMemoryType.ConversationKGMemory:
        // Convert knowledge graph to a summary message
        return [
          {
            _id: 'kg_summary',
            sender: 'system',
            text: 'Knowledge graph data preserved from previous conversation',
          },
        ];

      case AgentMemoryType.VectorStoreRetrieverMemory:
        // Vector store doesn't contain direct messages
        return [];

      default:
        return [];
    }
  }

  /**
   * Convert messages to the appropriate format for the new memory type.
   */
  private convertToMemoryFormat(
    newConfig: AgentMemoryConfig,
    messages: any[],
    originalData: any,
  ): any {
    switch (newConfig.type) {
      case AgentMemoryType.ConversationBufferMemory:
      case AgentMemoryType.ConversationBufferWindowMemory:
      case AgentMemoryType.ConversationTokenBufferMemory:
        return {
          type: newConfig.type,
          messages: messages,
        };

      case AgentMemoryType.ConversationSummaryMemory:
        // Create a summary from messages or preserve existing summary
        const existingSummary = originalData.summary;
        if (existingSummary) {
          return { type: newConfig.type, summary: existingSummary };
        }
        // Generate basic summary from messages
        const messageText = messages
          .map((m) => `${m.sender}: ${m.text}`)
          .join('\n');
        return {
          type: newConfig.type,
          summary: messageText || 'Conversation started',
        };

      case AgentMemoryType.ConversationSummaryBufferMemory:
        return {
          type: newConfig.type,
          summary: originalData.summary || 'Conversation history preserved',
          buffer: messages.slice(
            -((newConfig as SummaryBufferMemoryConfig).maxSize || 5),
          ),
        };

      case AgentMemoryType.ConversationEntityMemory:
        return {
          type: newConfig.type,
          entities: originalData.entities || [],
          history: messages,
        };

      case AgentMemoryType.ConversationKGMemory:
        return {
          type: newConfig.type,
          graph: originalData.graph || { entities: [], relations: [] },
        };

      case AgentMemoryType.VectorStoreRetrieverMemory:
        return {
          type: newConfig.type,
          key: (newConfig as VectorStoreRetrieverMemoryConfig).conversationId,
        };

      default:
        throw new Error(
          `Unsupported target memory type: ${(newConfig as any).type}`,
        );
    }
  }

  /**
   * Load migrated data into a memory instance.
   */
  private async loadMemoryData(
    instance: any,
    config: AgentMemoryConfig,
    data: any,
  ): Promise<void> {
    switch (config.type) {
      case AgentMemoryType.ConversationBufferMemory:
      case AgentMemoryType.ConversationBufferWindowMemory:
        if (data.messages) {
          (instance as structs.ConversationBufferWindowMemory).load =
            data.messages;
        }
        break;

      case AgentMemoryType.ConversationTokenBufferMemory:
        if (data.messages) {
          (instance as structs.ConversationTokenBufferMemory).load =
            data.messages;
          (
            instance as structs.ConversationTokenBufferMemory
          ).recalculateTokens();
        }
        break;

      case AgentMemoryType.ConversationSummaryMemory:
        if (data.summary) {
          (instance as structs.ConversationSummaryMemory).load = data.summary;
        }
        break;

      case AgentMemoryType.ConversationSummaryBufferMemory:
        if (data.summary || data.buffer) {
          (instance as structs.ConversationSummaryBufferMemory).load = {
            summary: data.summary || '',
            buffer: data.buffer || [],
          };
        }
        break;

      case AgentMemoryType.ConversationEntityMemory:
        // Entities are loaded via default constructor state
        // The history will be processed when new messages are added
        break;

      case AgentMemoryType.ConversationKGMemory:
        if (data.graph) {
          (instance as structs.ConversationKGMemory).loadFromJSON(data.graph);
        }
        break;

      case AgentMemoryType.VectorStoreRetrieverMemory:
        // No state to restore for vector store memory
        break;

      default:
        throw new Error(
          `Unsupported memory type for loading: ${(config as any).type}`,
        );
    }
  }
}
