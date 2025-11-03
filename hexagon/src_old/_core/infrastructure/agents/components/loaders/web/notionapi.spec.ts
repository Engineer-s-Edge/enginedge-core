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
  .mockResolvedValue([new Document({ pageContent: 'n:api', metadata: {} })]);
const NotionAPILoaderMock = jest
  .fn()
  .mockImplementation((_opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/notionapi', () => ({
  NotionAPILoader: NotionAPILoaderMock,
}));

import { NotionAPIWebLoader } from './notionapi';

describe('NotionAPIWebLoader', () => {
  it('loads notion content and merges metadata', async () => {
    process.env.NOTION_INTEGRATION_TOKEN = 'test';
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new NotionAPIWebLoader(logger);
    const docs = await loader.load({ pageId: 'abc' }, { tag: 'notion' });
    expect(NotionAPILoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('notion');
  });
});
