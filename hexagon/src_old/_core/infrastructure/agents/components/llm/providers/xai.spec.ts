import ChatXAIProvider from './xai';
import { MyLogger } from '@core/services/logger/logger.service';

jest.mock('@langchain/xai', () => {
  class MockChatXAI {
    constructor(public opts: any) {}
    async invoke(_msgs: any[], _config?: any) {
      return { text: 'hello from xai' } as any;
    }
    async *stream(_msgs: any[], _config?: any) {
      yield { text: 'he' } as any;
      yield { text: 'llo' } as any;
    }
  }
  return { ChatXAI: MockChatXAI };
});

const fetchMock = jest.fn();
// @ts-ignore
global.fetch = fetchMock;

const logger: Partial<MyLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('ChatXAIProvider', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, XAI_API_KEY: 'sk-xai' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('listModels maps names', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'grok-beta' }] }),
    });
    const p = new ChatXAIProvider(logger as MyLogger);
    const models = await p.listModels();
    expect(models).toEqual(['grok-beta']);
  });

  it('getLLM returns ChatXAI-like', () => {
    const p = new ChatXAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    expect(typeof llm.invoke).toBe('function');
  });

  it('invokeChat returns response and records usage', async () => {
    const p = new ChatXAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const res = await p.invokeChat(llm as any, [] as any, {} as any);
    expect(String(res.response)).toContain('hello from xai');
    const stats = p.getUsageStats();
    expect(stats.cumulative?.totalTokens).toBe(0);
  });

  it('streamChat yields progressive text', async () => {
    const p = new ChatXAIProvider(logger as MyLogger);
    const llm = p.getLLM(p.defaultLLMModelId, {} as any) as any;
    const chunks: any[] = [];
    for await (const ch of p.streamChat(llm as any, [] as any, {} as any)) {
      chunks.push(ch.response);
    }
    expect(chunks[chunks.length - 1]).toBe('hello');
  });

  it('embedding methods throw unsupported', async () => {
    const p = new ChatXAIProvider(logger as MyLogger);
    await expect(p.listEmbeddingModels()).rejects.toThrow(
      'Embeddings not supported',
    );
    expect(() => p.getEmbeddingModel()).toThrow('Embeddings not supported');
    await expect(p.embed()).rejects.toThrow('Embeddings not supported');
    await expect(p.embedBatch()).rejects.toThrow('Embeddings not supported');
  });

  it('countTokens roughly counts words', () => {
    const p = new ChatXAIProvider(logger as MyLogger);
    expect(p.countTokens('two words')).toBe(2);
  });

  it('healthCheck returns true when listModels succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'grok' }] }),
    });
    const p = new ChatXAIProvider(logger as MyLogger);
    await expect(p.healthCheck()).resolves.toBe(true);
  });
});
