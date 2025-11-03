import GraphAgent from './graph';
import { HumanMessage } from '@langchain/core/messages';
import {
  AgentCheckpointConfig,
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentState,
  GraphAgent as GraphAgentConfig,
  Node,
  Edge,
  CheckPointTypes,
} from '../types/agent.entity';

// Strict minimal mocks
const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});
const makeToolkit = () => ({
  register: jest.fn(),
  preparePromptPayload: jest.fn(() => ''),
});
const makeMemory = () => ({
  load: jest.fn(),
  assembleMemoryPayload: jest.fn(),
});
const makeLLM = () => ({
  chat: jest.fn(async () => ({ response: 'yes' })),
  countTokens: jest.fn(() => 10),
});
const makeConversationRepo = () => ({ findById: jest.fn() });
const makeVectorStore = () => ({}) as any;
const makeCheckpointService = () => ({
  createCheckpoint: jest.fn(),
  getCheckpoints: jest.fn(async () => []),
  restoreCheckpoint: jest.fn(),
  getCheckpoint: jest.fn(),
});
const makeLoaderService = () => ({
  preload: jest.fn(async () => ({
    [Symbol.asyncIterator]: function* () {
      yield { preloadInjection: '', deliverFiles: [] };
    },
    cleanup: () => {},
  })),
});

const defaultIntelligence: AgentIntelligenceConfig = {
  llm: { provider: 'openai', model: 'gpt-4o-mini', tokenLimit: 4096 },
  escalate: false,
  providerEscalationOptions: ['openai' as any],
  modelEscalationTable: {
    openai: [{ model: 'gpt-4o-mini', tokenLimit: 4096 }],
  } as any,
};

const defaultConfig = () => ({
  memoryConfig: { type: 'cbm' } as any,
  checkpointConfig: {
    enabled: false,
    allowList: CheckPointTypes.All,
    maxCheckpoints: 5,
    autoSave: false,
  } as AgentCheckpointConfig,
  intelligenceConfig: defaultIntelligence,
  loaderConfig: {
    enabled: false,
    type: ['file'],
    maxFileSize: 1024,
    allowedTypes: [],
  } as AgentLoaderConfig,
  textsplitterConfig: {
    type: 'recursive',
    chunkSize: 512,
    chunkOverlap: 64,
  } as any,
  embedderConfig: {
    provider: 'openai',
    model: 'text-embedding-3-small',
  } as any,
});

function makeNode(id: string, name: string, command?: string): Node {
  return {
    _id: id as any,
    command: (command as any) || '_newmessage',
    name,
    description: 'test node',
    llm: { provider: 'openai', model: 'gpt-4o-mini', tokenLimit: 4096 },
    ReActConfig: {
      _id: `ra_${id}` as any,
      state: AgentState.READY,
      enabled: true,
      cot: {
        enabled: true,
        promptTemplate: 'Q: {input}',
        maxTokens: 128,
        temperature: 0.2,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        fewShotExamples: [],
        stopSequences: [],
        maxSteps: 1,
        selfConsistency: { enabled: false, samples: 1 },
        temperatureModifiable: true,
        maxTokensModifiable: true,
      },
      tools: [],
      canModifyStorage: false,
      intelligence: defaultIntelligence,
    },
  };
}

function makeEdge(from: string, to: string, keyword?: string): Edge {
  return {
    _id: `e_${from}_${to}` as any,
    from: from as any,
    to: to as any,
    condition: {
      type: keyword ? 'keyword' : 'analysis',
      keyword,
      analysisPrompt: 'Does text mention success? Answer yes/no',
      analysisProvider: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        tokenLimit: 4096,
      },
    },
    contextFrom: [],
  } as any;
}

describe('GraphAgent (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes and chooses _newmessage node when no command', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    // Two nodes: one default, one with /cmd
    const nodes = [
      makeNode('n1', 'DefaultNewMsg'),
      makeNode('n2', 'CmdNode', '/cmd'),
    ];
    const edges: Edge[] = [];

    const settings: GraphAgentConfig = {
      _id: 'ga_1' as any,
      state: AgentState.READY,
      nodes,
      edges,
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    // Mock ReActAgent to avoid deep logic; ensure invoke returns a simple string
    const invokeMock = jest.fn(async () => 'node-result');
    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    // Replace constructor with a fake that returns object having invoke
    // Note: jest.spyOn returns a mock function wrapper; we can mockImplementation to return instance-like
    (reactCtor as any).mockImplementation(() => ({
      invoke: invokeMock,
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u_1' as any,
      'c_1' as any,
      logger as any,
    );

    // Ready after init()
    expect(agent.state).toBe(AgentState.READY);

    const chunks: string[] = [];
    const stream = await agent.stream('hello world', [
      new HumanMessage('hi'),
    ] as any);
    for await (const c of stream) chunks.push(c);

    expect(invokeMock).toHaveBeenCalled();
    expect(chunks.join('')).toContain('node-result');
  });

  it('selects command node when input has /cmd and traverses keyword edge', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'CmdNode', '/cmd');
    const n2 = makeNode('n2', 'Follower');
    const edges: Edge[] = [makeEdge('n1', 'n2', 'node-result')];
    const settings: GraphAgentConfig = {
      _id: 'ga_2' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges,
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('node-result') // n1 output
      // Add a small delay so GraphAgent's polling can observe the running state and then completion
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('final-output'), 200),
          ),
      ); // n2 output when keyword matches
    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u_1' as any,
      'c_1' as any,
      logger as any,
    );

    const chunks: string[] = [];
    const stream = await agent.stream('/cmd do it', [
      new HumanMessage('hi'),
    ] as any);
    for await (const c of stream) chunks.push(c);

    // Both nodes should have been executed (at least two invokes)
    expect(invokeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(chunks.join('')).toContain('final-output');
  });

  it('falls back to _newmessage when no command nodes', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Default');
    const settings: GraphAgentConfig = {
      _id: 'ga_3' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'hello'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const chunks: string[] = [];
    for await (const c of await agent.stream('no command', [] as any))
      chunks.push(c);
    expect(chunks.join('')).toContain('hello');
  });

  it('analysis edge triggers when llm says yes', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    // Make analysis chat always return yes
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('a', 'A', '/run');
    const n2 = makeNode('b', 'B');
    const e = makeEdge('a', 'b'); // analysis type
    const settings: GraphAgentConfig = {
      _id: 'ga_4' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('some text')
      .mockResolvedValueOnce('followed');
    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const out: string[] = [];
    for await (const c of await agent.stream('/run now', [] as any))
      out.push(c);
    expect(out.join('')).toContain('followed');
    expect(invokeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('respects exclusive group priority (first match only)', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Start', '/go');
    const n2 = makeNode('n2', 'PathA');
    const n3 = makeNode('n3', 'PathB');
    const e1 = {
      ...makeEdge('n1', 'n2'),
      exclusiveGroup: 'G',
      priority: 1,
    } as any;
    const e2 = {
      ...makeEdge('n1', 'n3'),
      exclusiveGroup: 'G',
      priority: 2,
    } as any;

    const settings: GraphAgentConfig = {
      _id: 'ga_5' as any,
      state: AgentState.READY,
      nodes: [n1, n2, n3],
      edges: [e1, e2],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('seed output')
      .mockResolvedValueOnce('A only');
    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const out: string[] = [];
    for await (const c of await agent.stream('/go', [] as any)) out.push(c);
    const s = out.join('');
    expect(s).toContain('A only');
    // Should not have invoked n3
    expect(invokeMock.mock.calls.length).toBe(2);
  });

  it('contextFrom aggregates previous outputs into messages', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/run');
    const n2 = makeNode('n2', 'Second');
    const e = { ...makeEdge('n1', 'n2', 'first'), contextFrom: ['n1'] } as any;

    const settings: GraphAgentConfig = {
      _id: 'ga_6' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('first output')
      .mockImplementationOnce(async (_input: string, msgs: any[]) => {
        // Expect an AIMessage with context from n1 present
        const hasContext = msgs.some(
          (m) =>
            typeof m?.content === 'string' &&
            m.content.includes('First: first output'),
        );
        expect(hasContext).toBe(true);
        return 'second output';
      });

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const out: string[] = [];
    for await (const c of await agent.stream('/run', [] as any)) out.push(c);
    expect(out.join('')).toContain('second output');
  });

  it('memoryOverride temporarily switches memory config and restores it', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Start', '/go');
    const n2 = makeNode('n2', 'Next');
    const e = {
      ...makeEdge('n1', 'n2'),
      memoryOverride: { type: 'summary' },
    } as any;

    const settings: GraphAgentConfig = {
      _id: 'ga_7' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('seed')
      .mockResolvedValueOnce('done');
    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const originalType = (agent as any).memoryConfig.type;
    const out: string[] = [];
    for await (const c of await agent.stream('/go', [] as any)) out.push(c);
    expect(out.join('')).toContain('done');
    // memory override should have restored
    expect((agent as any).memoryConfig.type).toBe(originalType);
  });

  it('pause/resume between nodes triggers checkpoint path', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/go');
    const n2 = makeNode('n2', 'Second');
    const e = makeEdge('n1', 'n2');
    const settings: GraphAgentConfig = {
      _id: 'ga_8' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e],
      memory: { type: 'cbm' } as any,
      checkpoints: {
        enabled: true,
        allowList: CheckPointTypes.All,
        autoSave: true,
      },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    const invokeMock = jest
      .fn()
      .mockResolvedValueOnce('one')
      .mockImplementationOnce(async () => 'two');
    (reactCtor as any).mockImplementation(() => ({ invoke: invokeMock }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    // Pause between nodes and then resume
    agent.pause({ pauseBetweenNodes: true });
    const chunks: string[] = [];
    const iter = await agent.stream('/go x', [] as any);
    const collect = (async () => {
      for await (const c of iter) chunks.push(c);
    })();
    // Give it a moment to pause
    await new Promise((r) => setTimeout(r, 100));
    agent.resume();
    await collect;
    expect(chunks.join('')).toContain('two');
  });

  it('continuous_chat flow ends with provideChatAction', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'reply' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Chat', '/chat');
    (n1 as any).userInteraction = { mode: 'continuous_chat' };
    const settings: GraphAgentConfig = {
      _id: 'ga_9' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'answer'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const chunks: string[] = [];
    const iter = await agent.stream('/chat hello', [] as any);
    const run = (async () => {
      for await (const c of iter) chunks.push(c);
    })();
    // End chat
    await new Promise((r) => setTimeout(r, 50));
    agent.provideChatAction('n1' as any, 'end');
    await run;
    expect(chunks.join('')).toContain('answer');
  });

  it('updateGraphConfiguration works only while paused', () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings: GraphAgentConfig = {
      _id: 'ga_10' as any,
      state: AgentState.READY,
      nodes: [makeNode('n1', 'A')],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    expect(() =>
      (agent as any).updateGraphConfiguration({
        nodes: [{ _id: 'n2', name: 'B' } as any],
      }),
    ).toThrow();
    agent.pause({ pauseBeforeNodes: true });
    const changed = (agent as any).updateGraphConfiguration({
      nodes: [{ _id: 'n2', name: 'B' } as any],
    });
    expect(changed).toBe(true);
  });

  it('restoreFromCheckpoint returns false when missing', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    (cps.getCheckpoint as jest.Mock).mockResolvedValue(null);
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings: GraphAgentConfig = {
      _id: 'ga_11' as any,
      state: AgentState.READY,
      nodes: [makeNode('n1', 'A')],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const ok = await agent.restoreFromCheckpoint('missing');
    expect(ok).toBe(false);
  });

  it('requires approval and handles rejection error path', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'NeedsApproval', '/go');
    (n1 as any).userInteraction = { requireApproval: true };
    const settings: GraphAgentConfig = {
      _id: 'ga_12' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'proposed'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const iter = await agent.stream('/go', [] as any);
    // Simulate user rejection
    setTimeout(() => agent.provideUserApproval('n1' as any, false), 50);
    const chunks: string[] = [];
    for await (const c of iter) chunks.push(c);
    expect(chunks.join('')).toContain('Error in node execution: User rejected');
  });

  it('low confidence prompts user and accepts original output', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'LowConf', '/go');
    (n1 as any).userInteraction = {
      confidenceThreshold: 0.95,
      allowUserPrompting: true,
    };
    const settings: GraphAgentConfig = {
      _id: 'ga_13' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'maybe result'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const chunks: string[] = [];
    const iter = await agent.stream('/go', [] as any);
    setTimeout(() => agent.provideUserInput('n1' as any, 'accept'), 50);
    for await (const c of iter) chunks.push(c);
    expect(chunks.join('')).toContain('maybe result');
  });

  it('terminates when no edges are available from current node', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Solo', '/go');
    const settings: GraphAgentConfig = {
      _id: 'ga_14' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'done'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const chunks: string[] = [];
    for await (const c of await agent.stream('/go', [] as any)) chunks.push(c);
    expect(chunks.join('')).toContain('done');
  });

  it('creates autosave checkpoint when enabled during pause', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/go');
    const n2 = makeNode('n2', 'Second');
    const e = makeEdge('n1', 'n2');
    const settings: GraphAgentConfig = {
      _id: 'ga_15' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e],
      memory: { type: 'cbm' } as any,
      checkpoints: {
        enabled: true,
        allowList: CheckPointTypes.All,
        autoSave: true,
      },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest
        .fn()
        .mockResolvedValueOnce('one')
        .mockResolvedValueOnce('two'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    agent.pause({ pauseBetweenNodes: true });
    const iter = await agent.stream('/go', [] as any);
    // Start consuming the iterator so the stream reaches the pause point
    const consume = (async () => {
      for await (const _ of iter) {
      }
    })();
    // Resume after a short delay to allow checkpoint creation at the between-nodes pause
    setTimeout(() => agent.resume(), 50);
    await consume;
    expect(
      (cps.createCheckpoint as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it('emits exclusive-group no match when none of the edges match', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'Solo', '/go');
    const n2 = makeNode('n2', 'Next');
    const e1 = {
      ...makeEdge('n1', 'n2', 'NEVER'),
      exclusiveGroup: 'g1',
      priority: 1,
    } as any;
    const e2 = {
      ...makeEdge('n1', 'n2', 'ALSO_NEVER'),
      exclusiveGroup: 'g1',
      priority: 2,
    } as any;
    const settings: GraphAgentConfig = {
      _id: 'ga_16' as any,
      state: AgentState.READY,
      nodes: [n1, n2],
      edges: [e1, e2],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn(async () => 'foo output'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    let noMatchEmitted = false;
    agent.on('graph-exclusive-group-no-match', () => (noMatchEmitted = true));
    const chunks: string[] = [];
    for await (const c of await agent.stream('/go', [] as any)) chunks.push(c);
    expect(chunks.join('')).toContain('foo output');
    expect(noMatchEmitted).toBe(true);
  });

  it('waits for both predecessors before executing a join node', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/go');
    const n2 = makeNode('n2', 'Second', '/go');
    const j = makeNode('j', 'Join');
    const joinPreds = ['n1', 'n2'] as any;
    const e1: any = makeEdge('n1', 'j');
    e1.isJoin = true;
    e1.joinPredecessors = joinPreds;
    const e2: any = makeEdge('n2', 'j');
    e2.isJoin = true;
    e2.joinPredecessors = joinPreds;
    const settings: GraphAgentConfig = {
      _id: 'ga_17' as any,
      state: AgentState.READY,
      nodes: [n1, n2, j],
      edges: [e1, e2],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest
        .fn()
        .mockResolvedValueOnce('one')
        .mockResolvedValueOnce('two')
        .mockResolvedValueOnce('joined'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    let waitingEmitted = false;
    let readyEmitted = false;
    agent.on('graph-join-node-waiting', () => (waitingEmitted = true));
    agent.on('graph-join-node-ready', () => (readyEmitted = true));
    const chunks: string[] = [];
    for await (const c of await agent.stream('/go', [] as any)) chunks.push(c);
    // Each ReActAgent instance returns its own first mock value ('one'), so we expect three chunks
    expect(chunks.length).toBe(3);
    expect(waitingEmitted).toBe(true);
    expect(readyEmitted).toBe(true);
  });

  it('creates checkpoint when pausing before node execution', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/go');
    const settings: GraphAgentConfig = {
      _id: 'ga_19' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: {
        enabled: true,
        allowList: CheckPointTypes.All,
        autoSave: true,
      },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValueOnce('one'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    agent.pause({ pauseBeforeNodes: true });
    const iter = await agent.stream('/go', [] as any);
    const consumer = (async () => {
      for await (const _ of iter) {
      }
    })();
    // Allow time for pause and checkpoint, then resume
    setTimeout(() => agent.resume(), 50);
    await consumer;
    expect(
      (cps.createCheckpoint as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it('creates checkpoint when pausing after node execution', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'First', '/go');
    const settings: GraphAgentConfig = {
      _id: 'ga_20' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: {
        enabled: true,
        allowList: CheckPointTypes.All,
        autoSave: true,
      },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValueOnce('one'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    agent.pause({ pauseAfterNodes: true });
    const iter = await agent.stream('/go', [] as any);
    const consumer = (async () => {
      for await (const _ of iter) {
      }
    })();
    setTimeout(() => agent.resume(), 50);
    await consumer;
    expect(
      (cps.createCheckpoint as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it('low confidence path supports retry on user request', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    (llm.chat as jest.Mock).mockResolvedValue({ response: 'yes' });
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const n1 = makeNode('n1', 'LowConf', '/go');
    (n1 as any).userInteraction = {
      confidenceThreshold: 0.95,
      allowUserPrompting: true,
    };
    const settings: GraphAgentConfig = {
      _id: 'ga_18' as any,
      state: AgentState.READY,
      nodes: [n1],
      edges: [],
      memory: { type: 'cbm' } as any,
      checkpoints: { enabled: false, allowList: CheckPointTypes.All },
    } as any;

    const reactCtor = jest.spyOn(require('./react'), 'ReActAgent');
    (reactCtor as any).mockImplementation(() => ({
      invoke: jest
        .fn()
        .mockResolvedValueOnce('maybe result')
        .mockResolvedValueOnce('final result'),
    }));

    const agent = new GraphAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      defaultConfig() as any,
      'u' as any,
      'c' as any,
      logger as any,
    );

    const chunks: string[] = [];
    const iter = await agent.stream('/go', [] as any);
    setTimeout(() => agent.provideUserInput('n1' as any, 'retry'), 50);
    for await (const c of iter) chunks.push(c);
    expect(chunks.join('')).toContain('final result');
  });
});
