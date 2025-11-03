import { AgentConfigurationService } from './configuration.service';
import { AgentMemoryType } from '@core/infrastructure/agents/components/memory/memory.interface';

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('AgentConfigurationService', () => {
  const userId = 'user-1' as any;
  const conversationId = 'conv-1' as any;
  let svc: AgentConfigurationService;
  let logger: any;

  beforeEach(() => {
    logger = makeLogger();
    svc = new AgentConfigurationService(logger);
  });

  it('creates default config and merges overrides', () => {
    const cfg = svc.createDefaultConfig(userId, conversationId, {
      memoryConfig: { maxSize: 42 } as any,
      intelligenceConfig: {
        llm: { provider: 'groq', model: 'llama3', tokenLimit: 4096 },
      } as any,
      textsplitterConfig: {
        options: { chunkSize: 123, chunkOverlap: 45 },
      } as any,
      embedderConfig: {
        providerName: 'openai',
        modelId: 'text-embedding-3-small',
      },
    });

    expect(cfg.memoryConfig).toEqual(expect.objectContaining({ maxSize: 42 }));
    expect(cfg.intelligenceConfig.llm.provider).toBe('groq');
    expect(cfg.textsplitterConfig).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({ chunkSize: 123 }),
      }),
    );
    expect(cfg.embedderConfig.modelId).toBe('text-embedding-3-small');
  });

  it('getDefaultX helpers return expected shapes', () => {
    expect(svc.getDefaultMemoryConfig().type).toBe(
      AgentMemoryType.ConversationBufferMemory,
    );
    expect(svc.getDefaultCheckpointConfig()).toEqual(
      expect.objectContaining({
        enabled: true,
        maxCheckpoints: expect.any(Number),
      }),
    );
    expect(svc.getDefaultIntelligenceConfig().llm).toEqual(
      expect.objectContaining({ provider: 'openai', model: 'gpt-4' }),
    );
    expect(svc.getDefaultLoaderConfig()).toEqual(
      expect.objectContaining({
        enabled: true,
        allowedTypes: expect.any(Array),
      }),
    );
    expect(svc.getDefaultTextSplitterConfig()).toEqual(
      expect.objectContaining({
        type: 'recursive',
        options: expect.any(Object),
      }),
    );
    expect(svc.getDefaultEmbedderConfig()).toEqual(
      expect.objectContaining({ providerName: 'openai' }),
    );
  });

  it('mergeWithDefaults proxies to createDefaultConfig', () => {
    const partial = { memoryConfig: { maxSize: 5 } as any };
    const a = svc.mergeWithDefaults(userId, conversationId, partial);
    const b = svc.createDefaultConfig(userId, conversationId, partial);
    expect(a).toEqual(b);
  });

  it('validateConfiguration returns true for complete config and false for missing fields', () => {
    const full = svc.createDefaultConfig(userId, conversationId, {});
    expect(svc.validateConfiguration(full)).toBe(true);

    const missing = { memoryConfig: full.memoryConfig } as any;
    expect(svc.validateConfiguration(missing)).toBe(false);
  });

  it('updateConfiguration merges memory when type unchanged', () => {
    const current = svc.createDefaultConfig(userId, conversationId, {});
    const updated = svc.updateConfiguration(current, {
      memoryConfig: { maxSize: 99 } as any,
    });
    expect(updated.memoryConfig).toEqual(
      expect.objectContaining({ maxSize: 99 }),
    );
  });

  it('updateConfiguration switches memory type and fills defaults when type changes', () => {
    const current = svc.createDefaultConfig(userId, conversationId, {});
    const updated = svc.updateConfiguration(current, {
      memoryConfig: {
        type: AgentMemoryType.ConversationTokenBufferMemory,
        maxTokenLimit: 1234,
      } as any,
    });
    expect(updated.memoryConfig.type).toBe(
      AgentMemoryType.ConversationTokenBufferMemory,
    );
    expect((updated.memoryConfig as any).maxTokenLimit).toBe(1234);
  });

  it('throws on unsupported memory type when switching types', () => {
    const current = svc.createDefaultConfig(userId, conversationId, {});
    expect(() =>
      svc.updateConfiguration(current, {
        memoryConfig: { type: 'unknown' as any },
      }),
    ).toThrow('Unsupported memory type');
  });
});
