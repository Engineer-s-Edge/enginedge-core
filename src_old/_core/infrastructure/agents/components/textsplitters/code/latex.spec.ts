jest.mock('../utils/split_position', () => ({
  splitWithPositions: async (
    text: string,
    splitFn: (t: string) => Promise<string[]>,
  ) => {
    const parts = await splitFn(text);
    let cursor = 0;
    return parts.map((p) => {
      const start = { line: 1, character: cursor };
      const end = { line: 1, character: cursor + p.length };
      cursor += p.length;
      return { text: p, start, end };
    });
  },
}));

describe('LatexTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splitText splits latex with language params', async () => {
    const split = jest.fn().mockResolvedValue(['sec', 'content']);
    jest.doMock('@langchain/textsplitters', () => ({
      LatexTextSplitter: class {
        opts: any;
        constructor(opts: any) {
          this.opts = opts;
        }
        splitText = split;
      },
    }));
    const { LatexTextSplitterAdapter: Adapter } = require('./latex');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText('\\section{A} body', {
      chunkSize: 10,
      chunkOverlap: 0,
    } as any);
    expect(out).toEqual(['sec', 'content']);
    expect(split).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns positions', async () => {
    const split = jest.fn().mockResolvedValue(['a', 'b']);
    jest.doMock('@langchain/textsplitters', () => ({
      LatexTextSplitter: class {
        constructor(public opts: any) {}
        splitText = split;
      },
    }));
    const { LatexTextSplitterAdapter: Adapter } = require('./latex');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions('x', {
      chunkSize: 5,
      chunkOverlap: 0,
    } as any);
    expect(out.map((c: any) => c.text)).toEqual(['a', 'b']);
    expect(split).toHaveBeenCalled();
  });
});
