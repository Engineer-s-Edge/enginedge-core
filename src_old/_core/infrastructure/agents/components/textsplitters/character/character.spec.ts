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

describe('CharacterTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splitText returns chunks and logs', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      CharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['a', 'b']),
      })),
    }));
    const { CharacterTextSplitterAdapter: Adapter } = require('./character');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText('hello', {
      chunkSize: 2,
      chunkOverlap: 0,
    });
    expect(out).toEqual(['a', 'b']);
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns mapped positions', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      CharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['aa', 'bbb']),
      })),
    }));
    const { CharacterTextSplitterAdapter: Adapter } = require('./character');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions('helloworld');
    expect(out[0].text).toBe('aa');
    expect(out[1].end.character).toBeGreaterThan(out[0].end.character);
  });

  it('splitText logs error and rethrows', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      CharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockRejectedValue(new Error('fail')),
      })),
    }));
    const { CharacterTextSplitterAdapter: Adapter } = require('./character');
    const adapter = new Adapter(logger);
    await expect(adapter.splitText('x')).rejects.toThrow('fail');
    expect(logger.error).toHaveBeenCalled();
  });
});
