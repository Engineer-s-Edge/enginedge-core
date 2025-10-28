import TextSplitterService from './textsplitter.service';

describe('TextSplitterService', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const splitter = {
    splitText: jest.fn().mockResolvedValue(['a', 'b']),
    splitTextWithPositions: jest.fn().mockResolvedValue([
      {
        text: 'a',
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      },
    ]),
  };
  const factory = { getSplitter: jest.fn().mockReturnValue(splitter) } as any;
  const service = new (TextSplitterService as any)(factory, logger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('split returns chunks and logs', async () => {
    const out = await service.split('hello', 'character');
    expect(out).toEqual(['a', 'b']);
    expect(factory.getSplitter).toHaveBeenCalledWith('character');
    expect(logger.info).toHaveBeenCalled();
  });

  it('split logs error and rethrows', async () => {
    splitter.splitText.mockRejectedValueOnce(new Error('bad'));
    await expect(service.split('x', 'character')).rejects.toThrow('bad');
    expect(logger.error).toHaveBeenCalled();
  });

  it('splitWithLines returns chunks with positions and logs', async () => {
    const out = await service.splitWithLines('hello', 'character');
    expect(out[0].text).toBe('a');
    expect(factory.getSplitter).toHaveBeenCalledWith('character');
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitWithLines logs error and rethrows', async () => {
    splitter.splitTextWithPositions.mockRejectedValueOnce(new Error('fail'));
    await expect(service.splitWithLines('x', 'character')).rejects.toThrow(
      'fail',
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
