// Mock split position util to provide deterministic positions
jest.mock('../utils/split_position', () => ({
  splitWithPositions: async (
    text: string,
    splitFn: (t: string) => Promise<string[]>,
  ) => {
    const parts = await splitFn(text);
    let idx = 0;
    return parts.map((p) => {
      const start = { line: 1, character: idx };
      const end = { line: 1, character: idx + p.length };
      idx += p.length;
      return { text: p, start, end };
    });
  },
}));

// Mocks for natural, OpenAIEmbeddings, mathjs, d3-array
jest.mock('natural', () => {
  return {
    SentenceTokenizer: class {
      tokenize(text: string) {
        // naive split on period to simulate sentences
        return text
          .split('.')
          .map((s) => s)
          .filter((s) => s.length);
      }
    },
  };
});

jest.mock('@langchain/openai', () => {
  return {
    OpenAIEmbeddings: class {
      async embedDocuments(texts: string[]) {
        // map text length to simple vectors to create deterministic distances
        return texts.map((t) => [t.length, 1]);
      }
    },
  };
});

jest.mock('mathjs', () => ({
  dot: (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1],
  norm: (a: number[]) => Math.sqrt(a[0] * a[0] + a[1] * a[1]),
}));

jest.mock('d3-array', () => ({
  quantile: (arr: number[], q: number) => {
    if (!arr.length) return 0;
    const idx = Math.floor((arr.length - 1) * q);
    return arr[idx];
  },
}));

describe('SemanticTextSplitter and Adapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splits text semantically into chunks', async () => {
    const { SemanticTextSplitter } = require('./semantic');
    const splitter = new SemanticTextSplitter({
      bufferSize: 1,
      percentile: 50,
      splitterOptions: { chunkSize: 50 },
    });
    const chunks = await splitter.splitText('A. BB. CCC. DDDD.');
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('adapter splitText returns strings and logs', async () => {
    const { SemanticTextSplitterAdapter } = require('./semantic');
    const adapter = new SemanticTextSplitterAdapter(logger);
    const out = await adapter.splitText('Hello. World.');
    expect(out.length).toBeGreaterThan(0);
    expect(logger.info).toHaveBeenCalled();
  });

  it('adapter splitTextWithPositions returns positions', async () => {
    const { SemanticTextSplitterAdapter } = require('./semantic');
    const adapter = new SemanticTextSplitterAdapter(logger);
    const out = await adapter.splitTextWithPositions('Hello. World.');
    expect(out.every((c: any) => c.start && c.end)).toBe(true);
  });
});
