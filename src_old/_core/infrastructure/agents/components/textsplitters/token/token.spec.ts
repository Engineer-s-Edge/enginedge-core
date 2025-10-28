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

describe('TokenTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splitText returns chunks and logs', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      TokenTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['tok1', 'tok2', 'tok3']),
      })),
    }));
    const { TokenTextSplitterAdapter: Adapter } = require('./token');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText('hello', {
      chunkSize: 2,
      chunkOverlap: 1,
      encodingName: 'gpt2',
    });
    expect(out).toEqual(['tok1', 'tok2', 'tok3']);
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns mapped positions and binds splitText', async () => {
    const split = jest.fn().mockResolvedValue(['T1', 'T2']);
    jest.doMock('@langchain/textsplitters', () => ({
      TokenTextSplitter: jest
        .fn()
        .mockImplementation(() => ({ splitText: split })),
    }));
    const { TokenTextSplitterAdapter: Adapter } = require('./token');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions('abcdef');
    expect(out.map((c: any) => c.text)).toEqual(['T1', 'T2']);
    expect(split).toHaveBeenCalled();
  });

  it('splitText logs error and rethrows', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      TokenTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockRejectedValue(new Error('bad tokens')),
      })),
    }));
    const { TokenTextSplitterAdapter: Adapter } = require('./token');
    const adapter = new Adapter(logger);
    await expect(adapter.splitText('x')).rejects.toThrow('bad tokens');
    expect(logger.error).toHaveBeenCalled();
  });
});
