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
  .mockResolvedValue([new Document({ pageContent: 's:page', metadata: {} })]);
const SitemapLoaderMock = jest
  .fn()
  .mockImplementation((_url: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/sitemap', () => ({
  SitemapLoader: SitemapLoaderMock,
}));

import { SitemapWebLoader } from './sitemap';

describe('SitemapWebLoader', () => {
  it('loads via sitemap and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new SitemapWebLoader(logger);
    const docs = await loader.load(
      'https://example.com/sitemap.xml',
      {},
      { tag: 'sm' },
    );
    expect(SitemapLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('sm');
  });
});
