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

describe('RecursiveCharacterTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('splitText returns chunks and logs', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['para', 'graph']),
      })),
    }));
    const {
      RecursiveCharacterTextSplitterAdapter: Adapter,
    } = require('./recursive');
    const adapter = new Adapter(logger);
    const out = await adapter.splitText('hello', {
      chunkSize: 2,
      chunkOverlap: 0,
    });
    expect(out).toEqual(['para', 'graph']);
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns mapped positions', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockResolvedValue(['A', 'BB', 'CCC']),
      })),
    }));
    const {
      RecursiveCharacterTextSplitterAdapter: Adapter,
    } = require('./recursive');
    const adapter = new Adapter(logger);
    const out = await adapter.splitTextWithPositions('abcdef');
    expect(out.map((c: any) => c.text)).toEqual(['A', 'BB', 'CCC']);
  });

  it('splitText logs error and rethrows', async () => {
    jest.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
        splitText: jest.fn().mockRejectedValue(new Error('boom')),
      })),
    }));
    const {
      RecursiveCharacterTextSplitterAdapter: Adapter,
    } = require('./recursive');
    const adapter = new Adapter(logger);
    await expect(adapter.splitText('x')).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });
});
