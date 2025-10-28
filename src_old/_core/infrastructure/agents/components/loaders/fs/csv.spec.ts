import { Document } from '@langchain/core/documents';
jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));
jest.mock('@langchain/community/document_loaders/fs/csv', () => ({
  CSVLoader: jest.fn().mockImplementation((_blob, _opts) => ({
    load: jest
      .fn()
      .mockResolvedValue([
        new Document({ pageContent: 'csv:row1', metadata: { type: 'csv' } }),
      ]),
  })),
}));
import { CSVDocumentLoader } from './csv';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('CSVDocumentLoader', () => {
  it('loadBlob returns docs and merges metadata', async () => {
    const loader = new CSVDocumentLoader(logger);
    const blob = new Blob([`a,b\n1,2`], { type: 'text/csv' });
    const docs = await loader.loadBlob(
      blob,
      { column: 'a' },
      { source: 'csv' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toContain('csv:row1');
    expect(docs[0].metadata.type).toBe('csv');
    expect(docs[0].metadata.source).toBe('csv');
  });
});
