import AnthropicProvider from './anthropic';
import { MyLogger } from '@core/services/logger/logger.service';
import type { BaseMessage } from '@langchain/core/messages';

// Mock Anthropic LangChain class inside factory to avoid hoisting issues
jest.mock('@langchain/anthropic', () => {
  class MockChatAnthropic {
    constructor(public opts: any) {}
    async invoke(_messages: BaseMessage[], _config?: any) {
      return {
        content: 'hello from anthropic',
        response_metadata: {
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
        },
      } as any;
    }
    async *stream(_messages: BaseMessage[], _config?: any) {
      yield { text: 'he' } as any;
      yield {
        text: 'llo',
        response_metadata: {
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
        },
      } as any;
    }
  }
  return { ChatAnthropic: MockChatAnthropic };
});

const fetchMock = jest.fn();
// @ts-ignore
global.fetch = fetchMock;

const logger: Partial<MyLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('AnthropicProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: 'sk-anthropic' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels returns empty array when key missing or error', async () => {
    process.env.ANTHROPIC_API_KEY = '' as any;
    const p = new AnthropicProvider(logger as MyLogger);
    await expect(p.listModels()).resolves.toEqual([]);
  });

  it('listModels maps names from API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'claude-3-opus' }] }),
    });
    const p = new AnthropicProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['claude-3-opus']);
  });

  it('getLLM returns a ChatAnthropic-like instance', () => {
    const p = new AnthropicProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    expect(typeof llm.invoke).toBe('function');
    expect(llm.opts.model).toBe(p.defaultLLMModelId);
    expect(llm.opts.apiKey).toBe('sk-anthropic');
  });

  it('invokeChat returns response and records usage', async () => {
    const p = new AnthropicProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from anthropic');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(3);
  });

  it('streamChat yields progressive content', async () => {
    const p = new AnthropicProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('embedding-related methods throw', async () => {
    const p = new AnthropicProvider(logger as MyLogger);
    await expect(p.listEmbeddingModels()).rejects.toThrow('not supported');
    expect(() => (p as any).getEmbeddingModel()).toThrow('not supported');
    await expect(p.embed()).rejects.toThrow('not supported');
    await expect(p.embedBatch()).rejects.toThrow('not supported');
  });

  it('countTokens roughly counts words', () => {
    const p = new AnthropicProvider(logger as MyLogger);
    expect(p.countTokens('two words')).toBe(2);
  });

  it('healthCheck returns true', async () => {
    const p = new AnthropicProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
