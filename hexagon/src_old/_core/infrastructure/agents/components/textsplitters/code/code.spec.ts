// dynamic require used after jest.doMock for isolation

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

describe('CodeTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splitText uses language separators and returns chunks', async () => {
    const split = jest.fn().mockResolvedValue(['func', 'body']);
    const fromLanguage = jest.fn().mockReturnValue({ splitText: split });
    const getSep = jest.fn().mockReturnValue(['\n', ' ']);
    jest.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: {
        fromLanguage,
        getSeparatorsForLanguage: getSep,
      },
    }));
    const { CodeTextSplitterAdapter: Adapter } = require('./code');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText('code', {
      language: 'python' as any,
      chunkSize: 5,
      chunkOverlap: 0,
    });
    expect(out).toEqual(['func', 'body']);
    expect(getSep).toHaveBeenCalled();
    expect(fromLanguage).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns positions and binds splitter', async () => {
    const split = jest.fn().mockResolvedValue(['p1', 'p2']);
    const fromLanguage = jest.fn().mockReturnValue({ splitText: split });
    const getSep = jest.fn().mockReturnValue(['\n']);
    jest.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: {
        fromLanguage,
        getSeparatorsForLanguage: getSep,
      },
    }));
    const { CodeTextSplitterAdapter: Adapter } = require('./code');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions('code', {
      language: 'typescript' as any,
      chunkSize: 5,
      chunkOverlap: 0,
    });
    expect(out.map((c: any) => c.text)).toEqual(['p1', 'p2']);
    expect(split).toHaveBeenCalled();
  });
});
