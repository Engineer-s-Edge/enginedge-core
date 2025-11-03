import NvidiaProvider from './nvidia';
import { MyLogger } from '@core/services/logger/logger.service';
import type { BaseMessage } from '@langchain/core/messages';

jest.mock('@langchain/openai', () => {
  class MockOpenAIEmbeddings {
    constructor(public opts: any) {}
    model = this.opts.modelName;
    async embedQuery(input: string) {
      return input.split(/\s+/).map((_, i) => i / 10);
    }
  }
  class MockChatOpenAI {
    constructor(public opts: any) {}
    async invoke(_messages: BaseMessage[], _config?: any) {
      return {
        text: 'hello from nvidia',
        response_metadata: {
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        },
      } as any;
    }
    async *stream(_messages: BaseMessage[], _config?: any) {
      yield { text: 'he' } as any;
      yield { text: 'llo' } as any;
    }
  }
  return {
    OpenAIEmbeddings: MockOpenAIEmbeddings,
    ChatOpenAI: MockChatOpenAI,
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

describe('NvidiaProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      Nvidia_API_KEY: 'sk-nv',
      Nvidia_BASE_URL: 'https://example-nv/v1',
    };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels fetches and maps ids', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'llama' }, { id: 'mixtral' }] }),
    });
    const p = new NvidiaProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['llama', 'mixtral']);
  });

  it('getLLM returns ChatOpenAI-like pointed to Nvidia', () => {
    const p = new NvidiaProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    expect(typeof llm.invoke).toBe('function');
    expect(llm.opts.modelName).toBe(p.defaultLLMModelId);
    expect(llm.opts.openAIApiKey).toBe('sk-nv');
    expect(llm.opts.configuration?.baseURL).toBe('https://example-nv/v1');
  });

  it('invokeChat returns response text and records usage', async () => {
    const p = new NvidiaProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from nvidia');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(3);
  });

  it('streamChat yields progressive text', async () => {
    const p = new NvidiaProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('getEmbeddingModel returns OpenAIEmbeddings-like and embed works', async () => {
    const p = new NvidiaProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId);
    const res = await p.embed(emb as any, 'hello world');
    expect(Array.isArray(res.embeddings.embedding)).toBe(true);
    expect(res.embeddings.embeddingModelId).toBe(p.defaultEmbeddingModelId);
  });

  it('embedBatch aggregates results for multiple inputs', async () => {
    const p = new NvidiaProvider(logger as MyLogger);
    const emb = p.getEmbeddingModel(p.defaultEmbeddingModelId);
    const results = await p.embedBatch(emb as any, ['one two', 'three']);
    expect(results).toHaveLength(2);
  });

  it('countTokens roughly counts words', () => {
    const p = new NvidiaProvider(logger as MyLogger);
    expect(p.countTokens('two words')).toBe(2);
  });

  it('healthCheck returns true when listModels succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'foo' }] }),
    });
    const p = new NvidiaProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
