import { Document } from '@langchain/core/documents';
jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));
jest.mock('@langchain/community/document_loaders/fs/pptx', () => ({
  PPTXLoader: jest.fn().mockImplementation((_blob) => ({
    load: jest
      .fn()
      .mockResolvedValue([
        new Document({ pageContent: 'pptx:s1', metadata: { slide: 1 } }),
        new Document({ pageContent: 'pptx:s2', metadata: { slide: 2 } }),
      ]),
  })),
}));
import { PPTXDocumentLoader } from './pptx';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('PPTXDocumentLoader', () => {
  it('combines slides when splitPages=false', async () => {
    const loader = new PPTXDocumentLoader(logger);
    const blob = new Blob([new Uint8Array([1, 2])], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const docs = await loader.loadBlob(
      blob,
      { splitPages: false },
      { tag: 'pptx' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toContain('pptx:s1');
    expect(docs[0].pageContent).toContain('pptx:s2');
    expect(docs[0].metadata.tag).toBe('pptx');
  });
});
