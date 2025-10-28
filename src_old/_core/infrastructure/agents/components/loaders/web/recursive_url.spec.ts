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
  .mockResolvedValue([new Document({ pageContent: 'r:page', metadata: {} })]);
const RecursiveUrlLoaderMock = jest
  .fn()
  .mockImplementation((_url: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/recursive_url', () => ({
  RecursiveUrlLoader: RecursiveUrlLoaderMock,
}));

import { RecursiveUrlWebLoader } from './recursive_url';

describe('RecursiveUrlWebLoader', () => {
  it('crawls recursively and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new RecursiveUrlWebLoader(logger);
    const docs = await loader.load(
      'https://example.com',
      { maxDepth: 1 },
      { tag: 'r' },
    );
    expect(RecursiveUrlLoaderMock).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('r');
  });
});
