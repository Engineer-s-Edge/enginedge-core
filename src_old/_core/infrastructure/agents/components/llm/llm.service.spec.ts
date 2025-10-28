import LLMService from './llm.service';
import { ConfigService } from '@nestjs/config';

// Shared mutable behaviors for mocked providers (toggled per test)
const providerBehaviors: Record<string, any> = {
  openai: { embed: true, chat: true, countTokensThrows: false },
  groq: { embed: true, chat: true, countTokensThrows: false },
  anthropic: { embed: true, chat: true, countTokensThrows: false },
  google: { embed: true, chat: true, countTokensThrows: false },
  nvidia: { embed: true, chat: true, countTokensThrows: false },
  xai: { embed: true, chat: true, countTokensThrows: false },
};

// Mock fs to avoid reading real models file
jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify([
      {
        name: 'gpt-4o',
        provider: 'openai',
        description: 'OpenAI model',
        category: 'chat',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        inputCostPer1M: 1000,
        outputCostPer1M: 3000,
        cachedInputCostPer1M: 500,
        vision: true,
        functionCalling: true,
        multilingual: true,
        extendedThinking: false,
        knowledgeCutoff: '2023-10-01',
      },
      {
        name: 'llama3-70b',
        provider: 'groq',
        description: 'Groq model',
        category: 'chat',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        inputCostPer1M: 500,
        outputCostPer1M: 1500,
        cachedInputCostPer1M: null,
        vision: false,
        functionCalling: false,
        multilingual: true,
        extendedThinking: false,
        knowledgeCutoff: null,
      },
    ]),
  ),
}));

// Helper to create a mock provider class for a given name
function createMockProviderClass(name: string) {
  return class MockProvider {
    public defaultLLMModelId = `${name}-llm-model`;
    public defaultEmbeddingModelId = `${name}-embed-model`;
    constructor(public logger?: any) {}

    listModels = jest.fn(async () => [
      this.defaultLLMModelId,
      this.defaultEmbeddingModelId,
    ]);

    getEmbeddingModel = jest.fn(() => ({ provider: name }));

    embed = jest.fn(async (_model: any, _input: any, _config?: any) => {
      if (!providerBehaviors[name].embed) throw new Error(`${name} embed fail`);
      return { embeddings: [0.1, 0.2, 0.3], usage: { promptTokens: 42 } };
    });

    getLLM = jest.fn((_mid: string, _config?: any) => ({ provider: name }));

    invokeChat = jest.fn(async (_llm: any, _messages: any, _config?: any) => {
      if (!providerBehaviors[name].chat) throw new Error(`${name} chat fail`);
      return {
        response: `${name} says hi`,
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    // Streaming path (tests will provide a generator via mockReturnValue)
    streamChat = jest.fn((_llm: any, _messages: any, _config?: any) => {
      // Default: simple one-shot stream with final chunk
      async function* gen() {
        yield {
          response: `${name} says`,
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        };
        yield {
          response: ' hi',
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
          done: true,
        };
      }
      return gen();
    });

    countTokens = jest.fn((_: any) => {
      if (providerBehaviors[name].countTokensThrows)
        throw new Error('countTokens fail');
      return 7;
    });

    getUsageStats = jest.fn(() => ({ requests: 1 }));
  } as any;
}

// Mock all provider modules used by LLMService
jest.mock('./providers/openai', () => ({
  __esModule: true,
  default: createMockProviderClass('openai'),
}));
jest.mock('./providers/groq', () => ({
  __esModule: true,
  default: createMockProviderClass('groq'),
}));
jest.mock('./providers/anthropic', () => ({
  __esModule: true,
  default: createMockProviderClass('anthropic'),
}));
jest.mock('./providers/google', () => ({
  __esModule: true,
  default: createMockProviderClass('google'),
}));
jest.mock('./providers/nvidia', () => ({
  __esModule: true,
  default: createMockProviderClass('nvidia'),
}));
jest.mock('./providers/xai', () => ({
  __esModule: true,
  default: createMockProviderClass('xai'),
}));

describe('LLMService', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const config = new (class implements Partial<ConfigService> {
    get<T = any>(key: string): T | undefined {
      const map: Record<string, any> = {
        'llm.defaultProvider': 'openai',
        'llm.fallbackProviders': ['groq', 'anthropic'],
        'llm.maxRetries': 3,
        'llm.debug': false,
      };
      return map[key];
    }
  })() as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset behaviors to defaults
    for (const k of Object.keys(providerBehaviors)) {
      providerBehaviors[k].embed = true;
      providerBehaviors[k].chat = true;
      providerBehaviors[k].countTokensThrows = false;
    }
  });

  it('lists all registered providers', () => {
    const svc = new LLMService(config, logger as any);
    const providers = svc.listProviders();
    expect(providers.sort()).toEqual(
      ['anthropic', 'google', 'groq', 'nvidia', 'openai', 'xai'].sort(),
    );
  });

  it('embed succeeds with default provider', async () => {
    const svc = new LLMService(config, logger as any);
    const res = await svc.embed('hello world');
    expect(res.embeddings).toBeDefined();
    expect(Array.isArray(res.embeddings)).toBe(true);
    expect(logger.info).toHaveBeenCalled();
  });

  it('embed falls back to next provider on failure', async () => {
    // Fail openai, succeed groq
    providerBehaviors.openai.embed = false;
    providerBehaviors.groq.embed = true;

    const svc = new LLMService(config, logger as any);
    const res = await svc.embed('test');
    expect(res.embeddings).toBeDefined();
    // Ensure warning logged for failed provider
    expect(logger.warn).toHaveBeenCalled();
  });

  it('chat (non-stream) returns response and applies usage cost', async () => {
    const svc = new LLMService(config, logger as any);
    const res: any = await svc.chat([] as any, { stream: false });
    expect(res.response).toContain('openai');
    const usage = svc.getUsageStats();
    expect(usage.estimatedTotalCost).toBeGreaterThanOrEqual(0);
  });

  it('countTokens falls back to heuristic when provider throws', () => {
    providerBehaviors.openai.countTokensThrows = true;
    const svc = new LLMService(config, logger as any);
    const n = svc.countTokens('hello world');
    // heuristic is ceil(words * 1.3) -> ceil(2 * 1.3) = 3
    expect(n).toBe(3);
  });

  it('listModelsWithDetails merges data and provider API results', async () => {
    const svc = new LLMService(config, logger as any);
    const details = await svc.listModelsWithDetails('openai');
    // From mocked fs we have 1 openai model, plus provider API default IDs (2)
    expect(details.length).toBeGreaterThanOrEqual(1);
    const names = details.map((d) => d.name);
    expect(names).toContain('gpt-4o');
  });

  // Helper to consume an AsyncIterable for streaming tests
  async function consumeStream(stream: AsyncIterable<any>) {
    const chunks: any[] = [];
    let finalResult: any = null;
    try {
      for await (const chunk of stream) {
        if ((chunk as any)?.done) finalResult = chunk;
        else chunks.push(chunk);
      }
    } catch (error) {
      return { chunks, error };
    }
    return { chunks, finalResult };
  }

  it('streams chunks in order and exposes final usage metadata', async () => {
    const svc = new LLMService(config, logger as any);
    // Spy on the underlying provider to inject custom stream
    const provider: any = (svc as any).providers.get('openai');

    async function* mockStream() {
      yield {
        response: 'Hel',
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
      };
      yield {
        response: 'lo',
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      };
      yield {
        response: '!',
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        done: true,
      };
    }
    provider.streamChat.mockReturnValue(mockStream());

    const stream = await svc.chat([{ role: 'user', content: 'Hello' }] as any, {
      providerName: 'openai',
      modelId: 'gpt-4o',
      config: { temperature: 0.2 } as any,
      stream: true,
    });

    const { chunks, finalResult } = await consumeStream(
      stream as AsyncIterable<any>,
    );
    expect(chunks.map((c: any) => c.response).join('')).toBe('Hello');
    expect(finalResult).toMatchObject({
      done: true,
      usage: expect.objectContaining({ totalTokens: 8 }),
    });
    expect(provider.streamChat).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  it('passes custom modelId and config through to provider on chat', async () => {
    const svc = new LLMService(config, logger as any);
    const provider: any = (svc as any).providers.get('openai');
    await svc.chat([{ role: 'user', content: 'Hi' }] as any, {
      providerName: 'openai',
      modelId: 'custom-model',
      config: { temperature: 0.7, topP: 0.9, maxTokens: 1000 } as any,
      stream: false,
    });
    expect(provider.getLLM).toHaveBeenCalledWith(
      'custom-model',
      expect.objectContaining({ temperature: 0.7, topP: 0.9, maxTokens: 1000 }),
    );
    expect(provider.invokeChat).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({ temperature: 0.7, topP: 0.9, maxTokens: 1000 }),
    );
  });

  it('maps/provider-propagates rate limit and timeout errors on chat', async () => {
    const svc = new LLMService(config, logger as any);
    const provider: any = (svc as any).providers.get('openai');

    provider.invokeChat.mockRejectedValueOnce(new Error('Rate limit exceeded'));
    await expect(
      svc.chat([{ role: 'user', content: 'Hi' }] as any, {
        providerName: 'openai',
        stream: false,
      }),
    ).rejects.toThrow('Rate limit exceeded');

    provider.invokeChat.mockRejectedValueOnce(
      Object.assign(new Error('Request timeout'), { code: 'TIMEOUT' }),
    );
    await expect(
      svc.chat([{ role: 'user', content: 'Hi' }] as any, {
        providerName: 'openai',
        stream: false,
      }),
    ).rejects.toThrow('Request timeout');
  });

  it('throws on unknown provider selection', async () => {
    const svc = new LLMService(config, logger as any);
    await expect(
      svc.chat([{ role: 'user', content: 'Hi' }] as any, {
        providerName: 'unknown-provider' as any,
        stream: false,
      }),
    ).rejects.toThrow();
  });

  it('stream errors mid-flight are surfaced cleanly', async () => {
    const svc = new LLMService(config, logger as any);
    const provider: any = (svc as any).providers.get('openai');
    async function* errStream() {
      yield {
        response: 'Hel',
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
      };
      yield {
        response: 'lo',
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      };
      throw new Error('Stream error');
    }
    provider.streamChat.mockReturnValue(errStream());

    const stream = await svc.chat([{ role: 'user', content: 'Hello' }] as any, {
      providerName: 'openai',
      stream: true,
    });
    const { chunks, error } = await consumeStream(stream as AsyncIterable<any>);
    expect(chunks).toHaveLength(2);
    expect(error).toBeInstanceOf(Error);
    expect((error as any).message).toBe('Stream error');
  });
});
