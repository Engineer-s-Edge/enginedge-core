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
  .mockResolvedValue([new Document({ pageContent: 'sp:res', metadata: {} })]);
const SerpAPILoaderMock = jest
  .fn()
  .mockImplementation((_opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/serpapi', () => ({
  SerpAPILoader: SerpAPILoaderMock,
}));

import { SerpAPIWebLoader } from './serpapi';

describe('SerpAPIWebLoader', () => {
  it('loads search results and merges metadata', async () => {
    process.env.SERPAPI_API_KEY = 'test';
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new SerpAPIWebLoader(logger);
    const docs = await loader.load('q', {}, { tag: 'sp' });
    expect(SerpAPILoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('sp');
  });
});
