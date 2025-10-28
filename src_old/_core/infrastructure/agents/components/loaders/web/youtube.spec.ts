import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

const loadMock = jest
  .fn()
  .mockResolvedValue([
    new Document({ pageContent: 'y:transcript', metadata: {} }),
  ]);
const YoutubeLoaderMock = jest
  .fn()
  .mockImplementation((_opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/youtube', () => ({
  YoutubeLoader: YoutubeLoaderMock,
}));

import { YouTubeWebLoader } from './youtube';

describe('YouTubeWebLoader', () => {
  it('loads transcript and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new YouTubeWebLoader(logger);
    const docs = await loader.load(
      'https://youtu.be/xyz',
      { language: 'en' },
      { tag: 'yt' },
    );
    expect(YoutubeLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('yt');
  });
});
