import OpenAIProvider from './openai';
import { MyLogger } from '@core/services/logger/logger.service';
import type { BaseMessage } from '@langchain/core/messages';

// Mock external OpenAI LangChain classes (define inside factory to avoid hoisting issues)
jest.mock('@langchain/openai', () => {
  const embedQueryMock = jest.fn(async (_: any) => [0.1, 0.2, 0.3]);
  class MockOpenAIEmbeddings {
    constructor(public opts: any) {}
    model = this.opts.model;
    embedQuery = embedQueryMock;
  }
  class MockChatOpenAI {
    constructor(public opts: any) {}
    async invoke(_messages: BaseMessage[], _config?: any) {
      return {
        text: 'hello from openai',
        response_metadata: {
          token_usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
          },
        },
      } as any;
    }
    async *stream(_messages: BaseMessage[], _config?: any) {
      yield { text: 'he' } as any;
      yield { text: 'llo' } as any;
    }
  }
  return {
    ChatOpenAI: MockChatOpenAI,
    OpenAIEmbeddings: MockOpenAIEmbeddings,
  };
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

describe('OpenAIProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, OPENAI_API_KEY: 'sk-test' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels fetches and maps ids', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4.1' }] }),
    });
    const p = new OpenAIProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['gpt-4o', 'gpt-4.1']);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('getLLM returns a ChatOpenAI instance using default api key', () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    // We can only assert shape because class is defined inside mock factory
    expect(typeof llm.invoke).toBe('function');
    expect(llm.opts.modelName).toBe(p.defaultLLMModelId);
    expect(llm.opts.apiKey).toBe('sk-test');
  });

  it('invokeChat returns response text and records usage', async () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from openai');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(3);
  });

  it('streamChat yields progressive responses', async () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('getEmbeddingModel returns an OpenAIEmbeddings-like instance', () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId, {});
    expect(typeof (emb as any).embedQuery).toBe('function');
  });

  it('embed returns a vector and metadata for string input', async () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId, {});
    const res = await p.embed(emb as any, 'hello world');
    expect(Array.isArray(res.embeddings.embedding)).toBe(true);
    expect(res.embeddings.embeddingModelId).toBe(p.defaultEmbeddingModelId);
  });

  it('countTokens roughly counts words', () => {
    const p = new OpenAIProvider(logger as MyLogger);
    const n = p.countTokens('two words');
    expect(n).toBe(2);
  });

  it('healthCheck returns true when listModels succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }] }),
    });
    const p = new OpenAIProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
