import GroqProvider from './groq';
import { MyLogger } from '@core/services/logger/logger.service';
import type { BaseMessage } from '@langchain/core/messages';

// Mock external LangChain Groq class (define inside factory to avoid hoisting issues)
jest.mock('@langchain/groq', () => {
  class MockChatGroq {
    constructor(public opts: any) {}
    async invoke(_messages: BaseMessage[], _config?: any) {
      return { content: 'hello from groq', response_metadata: {} } as any;
    }
    async *stream(_messages: BaseMessage[], _config?: any) {
      yield { text: 'he' } as any;
      yield { text: 'llo' } as any;
    }
  }
  return { ChatGroq: MockChatGroq };
});

// Mock global fetch for listModels and healthCheck
const fetchMock = jest.fn();
// @ts-ignore
global.fetch = fetchMock;

const logger: Partial<MyLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('GroqProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, GROQ_API_KEY: 'sk-groq' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels fetches and maps ids (openai-compatible)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'llama-3-8b' }, { id: 'mixtral-8x7b' }],
      }),
    });
    const p = new GroqProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['llama-3-8b', 'mixtral-8x7b']);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('listModels throws when api key missing', async () => {
    process.env.GROQ_API_KEY = '' as any;
    const p = new GroqProvider(logger as MyLogger);
    await expect(p.listModels()).rejects.toThrow('Missing GROQ_API_KEY');
  });

  it('getLLM returns a ChatGroq-like instance with opts', () => {
    const p = new GroqProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    expect(typeof llm.invoke).toBe('function');
    expect(llm.opts.model).toBe(p.defaultLLMModelId);
    expect(llm.opts.apiKey).toBe('sk-groq');
  });

  it('invokeChat returns response content and records usage', async () => {
    const p = new GroqProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from groq');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(0);
  });

  it('streamChat yields progressive responses', async () => {
    const p = new GroqProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('embedding-related methods throw because unsupported', async () => {
    const p = new GroqProvider(logger as MyLogger);
    await expect(p.listEmbeddingModels()).rejects.toThrow(
      'Groq does not support',
    );
    expect(() => p.getEmbeddingModel('x')).toThrow('Groq does not support');
    await expect(p.embed({} as any, 'hi')).rejects.toThrow(
      'Groq does not support',
    );
  });

  it('countTokens roughly counts words', () => {
    const p = new GroqProvider(logger as MyLogger);
    const n = p.countTokens('two words');
    expect(n).toBe(2);
  });

  it('healthCheck returns true when listModels succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'llama' }] }),
    });
    const p = new GroqProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
