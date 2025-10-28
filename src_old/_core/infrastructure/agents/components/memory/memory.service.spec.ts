import AgentMemory from './memory.service';
import {
  AgentMemoryType,
  BufferWindowMemoryConfig,
  TokenBufferMemoryConfig,
  SummaryMemoryConfig,
  SummaryBufferMemoryConfig,
  KGMemoryConfig,
  VectorStoreRetrieverMemoryConfig,
  BufferMemoryConfig,
} from './memory.interface';

// Mock the structures module with minimal behavior required by AgentMemory
jest.mock('./structures', () => {
  class ConversationBufferMemory {
    private messages: any[] = [];
    constructor(
      public config: any,
      public logger: any,
    ) {}
    set load(v: any[]) {
      this.messages = v || [];
    }
    addMessage(m: any) {
      this.messages.push(m);
    }
    getMessages() {
      return this.messages;
    }
  }
  class ConversationBufferWindowMemory extends ConversationBufferMemory {}
  class ConversationTokenBufferMemory {
    public buffer: any[] = [];
    constructor(
      public config: any,
      public llm: any,
      public logger: any,
    ) {}
    set load(v: any[]) {
      this.buffer = v || [];
    }
    recalculateTokens() {
      /* noop for tests */
    }
    getMessages() {
      return this.buffer;
    }
  }
  class ConversationSummaryMemory {
    public summary = '';
    constructor(
      public config: any,
      public llm: any,
      public logger: any,
    ) {}
    set load(v: string) {
      this.summary = v || '';
    }
  }
  class ConversationSummaryBufferMemory {
    public summary = '';
    public buffer: any[] = [];
    constructor(
      public config: any,
      public llm: any,
      public logger: any,
    ) {}
    set load(v: { summary?: string; buffer?: any[] }) {
      this.summary = v?.summary || '';
      this.buffer = v?.buffer || [];
    }
    getCombinedContext() {
      return { summary: this.summary, recentMessages: this.buffer };
    }
    duplicate() {
      return this;
    }
    kill() {}
    getMaxSize() {
      return 0;
    }
    resize(_n: number) {}
  }
  class ConversationEntityMemory {
    private entities = [{ name: 'A' }, { name: 'B' }];
    constructor(
      public config: any,
      public llm: any,
      public logger: any,
    ) {}
    getAllEntities() {
      return this.entities;
    }
  }
  class ConversationKGMemory {
    private graph: any = null;
    constructor(
      public config: any,
      public llm: any,
      public logger: any,
    ) {}
    loadFromJSON(g: any) {
      this.graph = g;
    }
    toJSON() {
      return this.graph || { nodes: [], edges: [] };
    }
    formatSubgraphForPrompt(_text: string) {
      return [];
    }
  }
  class VectorStoreRetrieverMemory {
    constructor(
      public vs: any,
      public config: any,
      public logger: any,
    ) {}
    async getContextForPrompt() {
      return 'ctx';
    }
  }
  return {
    ConversationBufferMemory,
    ConversationBufferWindowMemory,
    ConversationTokenBufferMemory,
    ConversationSummaryMemory,
    ConversationSummaryBufferMemory,
    ConversationEntityMemory,
    ConversationKGMemory,
    VectorStoreRetrieverMemory,
  };
});

describe('AgentMemory', () => {
  const mkLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });
  const mkLLM = () => ({ getFallbackEmbeddingModels: jest.fn() });
  const vs: any = {}; // VectorStoreService mock
  const splitter: any = {}; // TextSplitterService mock

  const messages = [
    { _id: '1', sender: 'human', text: 'hi' },
    { _id: '2', sender: 'ai', text: 'hello' },
  ];

  it('awaitInit uses preconfigured embedder without calling LLM', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any, {
      providerName: 'openai',
      modelId: 'text-embedding-3-small',
    });
    await expect(mem.awaitInit()).resolves.toBeUndefined();
    expect(llm.getFallbackEmbeddingModels).not.toHaveBeenCalled();
  });

  it('awaitInit lazily configures embedder via LLM', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed-xyz' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    await expect(mem.awaitInit()).resolves.toBeUndefined();
    expect(llm.getFallbackEmbeddingModels).toHaveBeenCalled();
  });

  it('awaitInit propagates error if no embedder available', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockRejectedValue(
      new Error('no models'),
    );
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    await expect(mem.awaitInit()).rejects.toThrow('no models');
    expect(logger.error).toHaveBeenCalled();
  });

  it('load and export: BufferWindowMemory', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const config: BufferWindowMemoryConfig = {
      type: AgentMemoryType.ConversationBufferWindowMemory,
      maxSize: 3,
    };
    await mem.load('c1' as any, { config, data: { messages } } as any);
    const exported = mem.exportMemory('c1' as any);
    expect(exported?.data).toMatchObject({ type: config.type, messages });
  });

  it('load and export: TokenBufferMemory', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const config: TokenBufferMemoryConfig = {
      type: AgentMemoryType.ConversationTokenBufferMemory,
      maxTokenLimit: 100,
    };
    await mem.load('c2' as any, { config, data: { messages } } as any);
    const exported = mem.exportMemory('c2' as any);
    expect(exported?.data).toMatchObject({ type: config.type, messages });
  });

  it('load and export: SummaryMemory and SummaryBufferMemory', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const csm: SummaryMemoryConfig = {
      type: AgentMemoryType.ConversationSummaryMemory,
      summary: 'short summary',
    } as any;
    await mem.load(
      'c3' as any,
      { config: csm, data: { summary: 'short summary' } } as any,
    );
    const exportedCsm = mem.exportMemory('c3' as any);
    expect(exportedCsm?.data).toMatchObject({
      type: csm.type,
      summary: 'short summary',
    });

    const csbm: SummaryBufferMemoryConfig = {
      type: AgentMemoryType.ConversationSummaryBufferMemory,
      maxSize: 2,
      summary: 'sum',
      summaryBuffer: messages,
    } as any;
    await mem.load(
      'c4' as any,
      { config: csbm, data: { summary: 'sum', buffer: messages } } as any,
    );
    const exportedCsbm = mem.exportMemory('c4' as any);
    expect(exportedCsbm?.data).toMatchObject({
      type: csbm.type,
      summary: 'sum',
      buffer: messages,
    });
  });

  it('load and export: EntityMemory, KGMemory, and VectorStoreRetrieverMemory', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);

    // EntityMemory
    await mem.load(
      'ce' as any,
      {
        config: { type: AgentMemoryType.ConversationEntityMemory } as any,
        data: { entities: [{ name: 'X' }], history: [] },
      } as any,
    );
    const expEntity = mem.exportMemory('ce' as any);
    expect(expEntity?.data).toMatchObject({
      type: AgentMemoryType.ConversationEntityMemory,
      entities: [{ name: 'A' }, { name: 'B' }],
    });

    // KGMemory
    const kgCfg: KGMemoryConfig = {
      type: AgentMemoryType.ConversationKGMemory,
    } as any;
    await mem.load(
      'ckg' as any,
      { config: kgCfg, data: { graph: { nodes: [1] } } } as any,
    );
    const expKg = mem.exportMemory('ckg' as any);
    expect(expKg?.data).toMatchObject({
      type: kgCfg.type,
      graph: { nodes: [1] },
    });

    // VectorStoreRetrieverMemory
    const vsCfg: VectorStoreRetrieverMemoryConfig = {
      type: AgentMemoryType.VectorStoreRetrieverMemory,
      userId: 'u1' as any,
      conversationId: 'conv1' as any,
      useSnippets: true,
      topK: 3,
    };
    await mem.load('cvs' as any, { config: vsCfg, data: {} } as any);
    const expVs = mem.exportMemory('cvs' as any);
    expect(expVs?.data).toMatchObject({ type: vsCfg.type, key: 'conv1' });
  });

  it('changeMemoryStructure: same type preserves messages', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const cfg: BufferWindowMemoryConfig = {
      type: AgentMemoryType.ConversationBufferWindowMemory,
      maxSize: 5,
    };
    await mem.load('cx' as any, { config: cfg, data: { messages } } as any);
    await mem.changeMemoryStructure('cx' as any, { ...cfg, maxSize: 10 });
    const exp = mem.exportMemory('cx' as any);
    expect(exp?.data).toMatchObject({ type: cfg.type, messages });
  });

  it('changeMemoryStructure: migrates from SummaryMemory to BufferMemory with synthesized message', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const csm: SummaryMemoryConfig = {
      type: AgentMemoryType.ConversationSummaryMemory,
      summary: 'S',
    } as any;
    await mem.load('cm' as any, { config: csm, data: { summary: 'S' } } as any);
    const cbm: BufferMemoryConfig = {
      type: AgentMemoryType.ConversationBufferMemory,
    } as any;
    await mem.changeMemoryStructure('cm' as any, cbm);
    const exp = mem.exportMemory('cm' as any)!;
    expect(exp.data).toHaveProperty('messages');
    const msgs = (exp.data as any).messages as any[];
    expect(msgs[0].sender).toBe('system');
    expect(msgs[0].text).toContain('Previous conversation summary: S');
  });

  it('evicts least-recently-used when cache is full', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(1, vs, splitter, llm as any, logger as any);
    const cfg: BufferWindowMemoryConfig = {
      type: AgentMemoryType.ConversationBufferWindowMemory,
      maxSize: 5,
    };
    await mem.load(
      'one' as any,
      {
        config: cfg,
        data: { messages: [{ _id: 'm1', sender: 'human', text: 'hi' }] },
      } as any,
    );
    await mem.load(
      'two' as any,
      {
        config: cfg,
        data: { messages: [{ _id: 'm2', sender: 'human', text: 'hey' }] },
      } as any,
    );
    expect(mem.exportMemory('one' as any)).toBeUndefined();
    expect(mem.exportMemory('two' as any)).toBeDefined();
    expect(logger.info).toHaveBeenCalled(); // eviction log present
  });

  it('clearCache empties all conversations', async () => {
    const logger = mkLogger();
    const llm = mkLLM();
    (llm.getFallbackEmbeddingModels as jest.Mock).mockResolvedValue([
      { provider: 'openai', modelId: 'embed' },
    ]);
    const mem = new AgentMemory(5, vs, splitter, llm as any, logger as any);
    const cfg: BufferWindowMemoryConfig = {
      type: AgentMemoryType.ConversationBufferWindowMemory,
      maxSize: 5,
    };
    await mem.load('a' as any, { config: cfg, data: { messages } } as any);
    await mem.load('b' as any, { config: cfg, data: { messages } } as any);
    mem.clearCache();
    expect(mem.exportMemory('a' as any)).toBeUndefined();
    expect(mem.exportMemory('b' as any)).toBeUndefined();
  });
});
