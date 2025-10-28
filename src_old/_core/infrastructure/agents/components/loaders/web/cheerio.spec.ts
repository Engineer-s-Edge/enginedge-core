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
  .mockResolvedValue([new Document({ pageContent: 'c:body', metadata: {} })]);
const CheerioLoaderMock = jest
  .fn()
  .mockImplementation((_url: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/cheerio', () => ({
  CheerioWebBaseLoader: CheerioLoaderMock,
}));

import { CheerioWebLoader } from './cheerio';

describe('CheerioWebLoader', () => {
  it('loads via cheerio and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new CheerioWebLoader(logger);
    const docs = await loader.load(
      'https://example.com',
      { selector: 'body' },
      { tag: 'c' },
    );
    expect(CheerioLoaderMock).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('c');
  });
});
