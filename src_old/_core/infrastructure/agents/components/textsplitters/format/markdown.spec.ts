// dynamic require used after jest.doMock when needed

jest.mock('../utils/split_position', () => ({
  splitWithPositions: async (
    text: string,
    splitFn: (t: string) => Promise<string[]>,
  ) => {
    const parts = await splitFn(text);
    let offset = 0;
    return parts.map((p) => {
      const start = { line: 1, character: offset };
      const end = { line: 1, character: offset + p.length };
      offset += p.length;
      return { text: p, start, end };
    });
  },
}));

describe('MarkdownTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const md = `# Title\nSome text\n## Sub\nMore text`;

  it('splitText returns chunks and logs', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      MarkdownTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest
          .fn()
          .mockResolvedValue(['# Title', 'Some text', '## Sub', 'More text']),
      })),
    }));
    const { MarkdownTextSplitterAdapter: Adapter } = require('./markdown');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText(md, { chunkSize: 10, chunkOverlap: 0 });
    expect(out.length).toBeGreaterThan(0);
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns positions', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      MarkdownTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['# Title', 'Some text']),
      })),
    }));
    const { MarkdownTextSplitterAdapter: Adapter } = require('./markdown');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions(md);
    expect(out[0]).toHaveProperty('start');
    expect(out[0]).toHaveProperty('end');
  });
});
