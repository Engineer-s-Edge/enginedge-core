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
    new Document({ pageContent: 'pp:rendered', metadata: {} }),
  ]);
const PuppeteerLoaderMock = jest
  .fn()
  .mockImplementation((_url: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/puppeteer', () => ({
  PuppeteerWebBaseLoader: PuppeteerLoaderMock,
}));

import { PuppeteerWebLoader } from './puppeteer';

describe('PuppeteerWebLoader', () => {
  it('loads via puppeteer and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new PuppeteerWebLoader(logger);
    const docs = await loader.load('https://example.com', {}, { tag: 'pp' });
    expect(PuppeteerLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('pp');
  });
});
