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
    new Document({ pageContent: 'h:content', metadata: {} }),
  ]);
const HTMLLoaderMock = jest
  .fn()
  .mockImplementation((_html: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/html', () => ({
  HTMLWebBaseLoader: HTMLLoaderMock,
}));

import { HTMLWebLoader } from './html';

describe('HTMLWebLoader', () => {
  it('parses html and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new HTMLWebLoader(logger);
    const docs = await loader.load(
      '<html><body>hi</body></html>',
      { selector: 'body' },
      { tag: 'h' },
    );
    expect(HTMLLoaderMock).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('h');
  });
});
