import GoogleGenAIProvider from './google';
import { MyLogger } from '@core/services/logger/logger.service';
import type { BaseMessage } from '@langchain/core/messages';

jest.mock('@langchain/google-genai', () => {
  class MockGoogleGenerativeAIEmbeddings {
    constructor(public opts: any) {}
    modelName = this.opts.modelName;
    async embedQuery(input: string) {
      return input.split(/\s+/).map((_, i) => i / 10);
    }
  }
  class MockChatGoogleGenerativeAI {
    constructor(public opts: any) {}
    async invoke(_messages: BaseMessage[], _config?: any) {
      return { text: 'hello from google' } as any;
    }
    async *stream(_messages: BaseMessage[], _config?: any) {
      yield { text: 'he' } as any;
      yield { text: 'llo' } as any;
    }
  }
  return {
    GoogleGenerativeAIEmbeddings: MockGoogleGenerativeAIEmbeddings,
    ChatGoogleGenerativeAI: MockChatGoogleGenerativeAI,
  };
});

const fetchMock = jest.fn();
// @ts-ignore
global.fetch = fetchMock;

const logger: Partial<MyLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('GoogleGenAIProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, GEMINI_API_KEY: 'sk-gemini' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels maps model names from API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'gemini-2.0-flash' }] }),
    });
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['gemini-2.0-flash']);
  });

  it('getLLM returns ChatGoogleGenerativeAI-like', () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    expect(typeof llm.invoke).toBe('function');
    expect(llm.opts.model).toBe(p.defaultLLMModelId);
    expect(llm.opts.apiKey).toBe('sk-gemini');
  });

  it('invokeChat returns response and records usage', async () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from google');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(0);
  });

  it('streamChat yields progressive text', async () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('getEmbeddingModel returns GoogleGenerativeAIEmbeddings-like and embed works', async () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId);
    const res = await p.embed(emb as any, 'hello world');
    expect(Array.isArray(res.embeddings.embedding)).toBe(true);
    expect(res.embeddings.embeddingModelId).toBe(p.defaultEmbeddingModelId);
  });

  it('embedBatch aggregates results for multiple inputs', async () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId);
    const results = await p.embedBatch(emb as any, ['one two', 'three']);
    expect(results).toHaveLength(2);
  });

  it('countTokens roughly counts words', () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    expect(p.countTokens('two words')).toBe(2);
  });

  it('healthCheck returns true', async () => {
    const p = new GoogleGenAIProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
