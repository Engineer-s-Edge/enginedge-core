import { HumanMessage } from '@langchain/core/messages';
import BaseAgent from './base';
import { ReActAgent } from './react';
import {
  AgentIntelligenceConfig,
  AgentLoaderConfig,
  AgentCheckpointConfig,
  AgentState,
  ReActAgentConfig,
  CheckPointTypes,
} from '../types/agent.entity';

// Minimal strict mocks for dependencies
const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

const makeToolkit = () => ({
  register: jest.fn(),
  preparePromptPayload: jest.fn(() => ''),
  executeCalls: jest.fn(async () => []),
});

const makeMemory = () => ({
  load: jest.fn(),
  assembleMemoryPayload: jest.fn(),
  changeMemoryStructure: jest.fn(),
});

const makeLLM = () => ({
  chat: jest.fn(),
  countTokens: jest.fn(() => 42),
});

const makeConversationRepo = () => ({
  findById: jest.fn(),
});

const makeVectorStore = () => ({
  // not used directly in these tests
});

const makeCheckpointService = () => ({
  createCheckpoint: jest.fn(),
  getCheckpoints: jest.fn(),
  restoreCheckpoint: jest.fn(),
});

const makeLoaderService = () => ({
  preload: jest.fn(),
});

function makeReActSettings(
  overrides: Partial<ReActAgentConfig> = {},
): ReActAgentConfig {
  return {
    _id: 'ra_123' as any,
    state: AgentState.INITIALIZING,
    enabled: true,
    cot: {
      enabled: true,
      promptTemplate: 'You are a helpful agent.\nQuestion: {input}',
      maxTokens: 256,
      temperature: 0.2,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      fewShotExamples: [
        {
          input: '2+2?',
          thought: 'Add numbers',
          action: 'calculator',
          observation: '4',
          finalAnswer: '4',
        },
      ],
      stopSequences: [],
      maxSteps: 3,
      selfConsistency: { enabled: false, samples: 1 },
      temperatureModifiable: true,
      maxTokensModifiable: true,
    },
    tools: [],
    canModifyStorage: false,
    intelligence: {
      llm: { provider: 'openai', model: 'gpt-4o-mini', tokenLimit: 4096 },
      escalate: false,
      providerEscalationOptions: ['openai'],
      modelEscalationTable: {
        openai: [{ model: 'gpt-4o-mini', tokenLimit: 4096 }],
        anthropic: [{ model: 'claude-3-haiku', tokenLimit: 4096 }],
        google: [{ model: 'gemini-1.5-pro', tokenLimit: 4096 }],
        groq: [{ model: 'llama-3-8b', tokenLimit: 4096 }],
        xai: [{ model: 'grok-beta', tokenLimit: 4096 }],
        nvidia: [{ model: 'nemotron-mini', tokenLimit: 4096 }],
      } as any,
    },
    ...overrides,
  } as ReActAgentConfig;
}

const defaultConfig = () => ({
  memoryConfig: { type: 'cbm' } as any,
  checkpointConfig: {
    enabled: false,
    allowList: CheckPointTypes.All,
    maxCheckpoints: 5,
    autoSave: false,
  } as AgentCheckpointConfig,
  intelligenceConfig: {
    llm: { provider: 'openai', model: 'gpt-4o-mini', tokenLimit: 4096 },
    escalate: false,
    providerEscalationOptions: ['openai'],
    modelEscalationTable: {
      openai: [{ model: 'gpt-4o-mini', tokenLimit: 4096 }],
    } as any,
  } as AgentIntelligenceConfig,
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

describe('ReActAgent (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets STOPPED state and emits when disabled', () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings = makeReActSettings({
      enabled: false,
      state: AgentState.READY,
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    expect(agent.state).toBe(AgentState.STOPPED);
    // Expect a disable event was emitted
    // Spy on emit by attaching a listener before: here we infer via logger.warn call as well
    expect(logger.warn).toHaveBeenCalled();
  });

  it('injects few-shot examples into prompt and emits injection event', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    // Avoid waiting on BaseAgent init in super.buildPrompt
    jest
      .spyOn(BaseAgent.prototype as any, 'buildPrompt')
      .mockResolvedValue(
        new HumanMessage('System preface\nQuestion: What is 2+2?'),
      );

    const emitSpy = jest.spyOn(agent as any, 'emit');
    const msg = await (agent as any).buildPrompt('What is 2+2?', []);

    expect(msg).toBeInstanceOf(HumanMessage);
    const content = (msg as HumanMessage).content as string;
    expect(content).toContain('Here are some examples:');
    expect(content).toContain('Question: 2+2?');
    expect(content.indexOf('Here are some examples:')).toBeLessThan(
      content.indexOf('Question: What is 2+2?'),
    );

    // Event emission with exampleCount and promptTokens (countTokens mocked to 42)
    expect(emitSpy).toHaveBeenCalledWith(
      'react-few-shot-examples-injected',
      expect.objectContaining({ exampleCount: 1, promptTokens: 42 }),
    );
  });

  it('updates runtime parameters when allowed', () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    const updated = agent.updateRuntimeParameters({
      temperature: 0.7,
      maxTokens: 123,
      maxSteps: 5,
    });
    expect(updated).toBe(true);
    expect(agent.getMaxSteps()).toBe(5);
  });

  it('streams: executes tool then yields final answer', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) {
          yield { response: c } as any;
        }
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const llm = makeLLM();
    // First call: emit thought + one action; Second call: emit final answer
    (llm.chat as jest.Mock)
      .mockResolvedValueOnce(
        streamFrom([
          'Thought: consider options\n',
          'Action: calculator\nAction Input: 2+2\n',
        ]),
      )
      .mockResolvedValueOnce(streamFrom(['FinalAnswer: 4']));

    // Single tool result
    (toolkit.executeCalls as jest.Mock).mockResolvedValue(['4']);

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      cot: { ...makeReActSettings().cot, maxSteps: 2 },
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    const chunks: string[] = [];
    const stream = await agent.stream('What is 2+2?', [
      new HumanMessage('hi'),
    ] as any);
    for await (const c of stream) chunks.push(c);

    const output = chunks.join('');
    expect(output).toContain('Observation: 4');
    expect(output).toContain('FinalAnswer: 4');
    expect(toolkit.executeCalls).toHaveBeenCalledWith([
      { name: 'calculator', args: '2+2' },
    ]);
  });

  it('streams: handles multiple actions and formats observations', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield { response: c } as any;
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    // One step that emits two actions
    (llm.chat as jest.Mock).mockResolvedValueOnce(
      streamFrom([
        'Thought: do actions\n',
        'Action: search\nAction Input: {"q":"kittens"}\nAction: fetch\nAction Input: https://example.com\n',
      ]),
    );

    (toolkit.executeCalls as jest.Mock).mockResolvedValue([
      'cute kittens result',
      'example html',
    ]);

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      cot: { ...makeReActSettings().cot, maxSteps: 1 },
    });
    const cfg = defaultConfig();
    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    const out: string[] = [];
    const stream = await agent.stream('do stuff', [
      new HumanMessage('hi'),
    ] as any);
    await (async () => {
      for await (const c of stream) out.push(c);
    })().catch(() => {});

    const s = out.join('');
    // Expect multi-observation formatting
    expect(s).toMatch(/Observation 1 \(search\):/);
    expect(s).toMatch(/Observation 2 \(fetch\):/);
  });

  it('denies storage modification and yields observation error', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield { response: c } as any;
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    (llm.chat as jest.Mock).mockResolvedValueOnce(
      streamFrom(['Thought: save\n', 'Action: saveFile\nAction Input: data\n']),
    );

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      canModifyStorage: false,
      cot: { ...makeReActSettings().cot, maxSteps: 1 },
    });
    const cfg = defaultConfig();
    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    const out: string[] = [];
    const stream = await agent.stream('save it', [
      new HumanMessage('hi'),
    ] as any);
    await (async () => {
      for await (const c of stream) out.push(c);
    })().catch(() => {});

    expect(out.join('')).toContain(
      'Observation: Storage modification not allowed',
    );
  });

  it('self-consistency yields best final answer', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield { response: c } as any;
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    // Any call returns a simple final answer stream
    (llm.chat as jest.Mock).mockImplementation(() =>
      streamFrom(['FinalAnswer: best']),
    );

    const base = makeReActSettings();
    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      cot: { ...base.cot, selfConsistency: { enabled: true, samples: 2 } },
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u_1' as any,
      logger as any,
    );

    const out: string[] = [];
    const stream = await agent.stream('q', [new HumanMessage('hi')] as any);
    for await (const c of stream) out.push(c);
    expect(out.join('')).toContain('Final Answer: best');
  });

  it('throws when max steps exceeded without final answer', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield { response: c } as any;
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    // Emit only a thought, no action or final answer
    (llm.chat as jest.Mock).mockResolvedValueOnce(
      streamFrom(['Thought: pondering...\n']),
    );

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      cot: { ...makeReActSettings().cot, maxSteps: 1 },
    });
    const cfg = defaultConfig();
    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u' as any,
      logger as any,
    );

    const iter = await agent.stream('q', [new HumanMessage('h')] as any);
    let threw = false;
    try {
      for await (const _ of iter) {
        // consume
      }
    } catch (e: any) {
      threw = true;
      expect(String(e.message || e)).toContain('Max ReAct steps (1) exceeded');
    }
    expect(threw).toBe(true);
  });

  it('escalates to next provider on failure and yields result', async () => {
    const streamFrom = (chunks: string[]) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield { response: c } as any;
      },
    });

    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    // First attempt throws (triggers escalation), second attempt (escalated) succeeds
    (llm.chat as jest.Mock)
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockResolvedValueOnce(streamFrom(['FinalAnswer: escalated success']));

    const base = makeReActSettings();
    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      intelligence: {
        ...base.intelligence,
        escalate: true,
        providerEscalationOptions: ['openai', 'anthropic'] as any,
      },
      cot: { ...base.cot, maxSteps: 1 },
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u' as any,
      logger as any,
    );

    const out: string[] = [];
    const stream = await agent.stream('q', [new HumanMessage('h')] as any);
    for await (const c of stream) out.push(c);
    expect(out.join('')).toContain('FinalAnswer: escalated success');
  });

  it('invalid runtime updates are ignored', () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const llm = makeLLM();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
    });
    const cfg = defaultConfig();

    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u' as any,
      logger as any,
    );

    expect(agent.updateRuntimeParameters({ temperature: 1.5 })).toBe(false);
    expect(agent.updateRuntimeParameters({ maxTokens: 999999 })).toBe(false);
    expect(agent.updateRuntimeParameters({ maxSteps: 0 })).toBe(false);
  });

  it('propagates llm errors when escalation disabled', async () => {
    const toolkit = makeToolkit();
    const memory = makeMemory();
    const convRepo = makeConversationRepo();
    const vstore = makeVectorStore();
    const cps = makeCheckpointService();
    const loader = makeLoaderService();
    const logger = makeLogger();
    const llm = makeLLM();

    (llm.chat as jest.Mock).mockRejectedValueOnce(new Error('Timeout'));

    const settings = makeReActSettings({
      enabled: true,
      state: AgentState.READY,
      cot: { ...makeReActSettings().cot, maxSteps: 1 },
    });
    const cfg = defaultConfig();
    const agent = new ReActAgent(
      toolkit as any,
      memory as any,
      llm as any,
      convRepo as any,
      vstore as any,
      cps as any,
      loader as any,
      settings,
      cfg as any,
      'u' as any,
      logger as any,
    );

    const iter = await agent.stream('q', [new HumanMessage('h')] as any);
    let threw = false;
    try {
      for await (const _ of iter) {
        // consume
      }
    } catch (e: any) {
      threw = true;
      expect(String(e.message || e)).toContain('Timeout');
    }
    expect(threw).toBe(true);
  });
});
