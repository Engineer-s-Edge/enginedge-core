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
    new Document({ pageContent: 'p:rendered', metadata: {} }),
  ]);
const PlaywrightLoaderMock = jest
  .fn()
  .mockImplementation((_url: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/playwright', () => ({
  PlaywrightWebBaseLoader: PlaywrightLoaderMock,
}));

import { PlaywrightWebLoader } from './playwright';

describe('PlaywrightWebLoader', () => {
  it('loads via headless browser and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new PlaywrightWebLoader(logger);
    const docs = await loader.load('https://example.com', {}, { tag: 'pw' });
    expect(PlaywrightLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('pw');
  });
});
