import EmbeddingHandler from './embedder.service';
import { LLMService } from '../llm';
import { MyLogger } from '@core/services/logger/logger.service';
import type { Embed } from '../vectorstores/entities/store.entity';

describe('EmbeddingHandler', () => {
  let llm: jest.Mocked<LLMService>;
  let logger: jest.Mocked<MyLogger>;

  beforeEach(() => {
    llm = {
      embed: jest.fn(),
    } as any;

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as any;
  });

  it('embed() normalizes and adjusts vector to target dimension', async () => {
    const handler = new EmbeddingHandler(4, llm, logger);
    const raw: Embed = {
      embedding: [3, 4], // norm 5 -> normalized [0.6, 0.8]
      size: 2,
      embeddingModelId: 'mock-model',
    };
    llm.embed.mockResolvedValue({ embeddings: raw } as any);

    const out = await handler.embed('hello', {
      providerName: 'openai',
      config: { temperature: 0 },
    });

    // called with modelId coming from handler (undefined is acceptable here)
    expect(llm.embed).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ providerName: 'openai', modelId: undefined }),
    );
    expect(out.size).toBe(4);
    expect(out.embedding.length).toBe(4);
    // normalized head ~ [0.6, 0.8]
    expect(out.embedding[0]).toBeCloseTo(0.6, 5);
    expect(out.embedding[1]).toBeCloseTo(0.8, 5);
    // padded tail zeros
    expect(out.embedding[2]).toBeCloseTo(0, 5);
    expect(out.embedding[3]).toBeCloseTo(0, 5);
  });

  it('embed() wraps and logs errors from LLM', async () => {
    const handler = new EmbeddingHandler(4, llm, logger);
    llm.embed.mockRejectedValueOnce(new Error('upstream failure'));

    await expect(handler.embed('oops', {})).rejects.toThrow(
      'Failed to generate embedding: upstream failure',
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('cosineSimilarity returns 1 for identical vectors', () => {
    const a: Embed = { embedding: [1, 2, 3], size: 3, embeddingModelId: 'm' };
    const b: Embed = { embedding: [1, 2, 3], size: 3, embeddingModelId: 'm' };
    const sim = EmbeddingHandler.cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(1, 6);
  });

  it('euclideanDistance returns 0 for identical vectors', () => {
    const a: Embed = { embedding: [1, 2, 3], size: 3, embeddingModelId: 'm' };
    const b: Embed = { embedding: [1, 2, 3], size: 3, embeddingModelId: 'm' };
    const dist = EmbeddingHandler.euclideanDistance(a, b);
    expect(dist).toBeCloseTo(0, 6);
  });

  it('searchBySimilarity returns top-k most similar and filters invalid items', () => {
    const q: Embed = { embedding: [1, 0, 0], size: 3, embeddingModelId: 'm' };
    const items = [
      {
        id: 'a',
        embedding: { embedding: [1, 0, 0], size: 3, embeddingModelId: 'm' },
      },
      {
        id: 'b',
        embedding: { embedding: [0, 1, 0], size: 3, embeddingModelId: 'm' },
      },
      { id: 'c', embedding: { embedding: [], size: 0, embeddingModelId: 'm' } }, // invalid, filtered
    ];

    const res = EmbeddingHandler.searchBySimilarity(q, items, 1);
    expect(res.length).toBe(1);
    expect(res[0].item.id).toBe('a');
    expect(res[0].score).toBeGreaterThanOrEqual(0.99);
  });

  it('searchByDistance returns top-k closest by Euclidean distance', () => {
    const q: Embed = { embedding: [0, 0], size: 2, embeddingModelId: 'm' };
    const items = [
      {
        id: 'a',
        embedding: { embedding: [1, 1], size: 2, embeddingModelId: 'm' },
      },
      {
        id: 'b',
        embedding: { embedding: [0.1, 0.1], size: 2, embeddingModelId: 'm' },
      },
    ];

    const res = EmbeddingHandler.searchByDistance(q, items, 1);
    expect(res.length).toBe(1);
    expect(res[0].item.id).toBe('b');
    // distance is the actual Euclidean distance
    expect(res[0].score).toBeCloseTo(Math.sqrt(0.02), 6);
  });
});
