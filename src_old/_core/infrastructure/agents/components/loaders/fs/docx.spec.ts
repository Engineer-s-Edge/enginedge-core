import { Document } from '@langchain/core/documents';
jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));
jest.mock('@langchain/community/document_loaders/fs/docx', () => ({
  DocxLoader: jest.fn().mockImplementation((_blob) => ({
    load: jest
      .fn()
      .mockResolvedValue([
        new Document({ pageContent: 'docx:p1', metadata: { page: 1 } }),
        new Document({ pageContent: 'docx:p2', metadata: { page: 2 } }),
      ]),
  })),
}));
import { DOCXDocumentLoader } from './docx';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('DOCXDocumentLoader', () => {
  it('combines pages when splitPages=false', async () => {
    const loader = new DOCXDocumentLoader(logger);
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const docs = await loader.loadBlob(
      blob,
      { splitPages: false },
      { tag: 'docx' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toContain('docx:p1');
    expect(docs[0].pageContent).toContain('docx:p2');
    expect(docs[0].metadata.tag).toBe('docx');
  });
});
