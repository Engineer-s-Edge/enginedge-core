import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

// Mock langchain PDFLoader
const loadMock = jest
  .fn()
  .mockResolvedValue([
    new Document({ pageContent: 'pdf text page 1', metadata: { page: 1 } }),
  ]);
const PDFLoaderMock = jest.fn().mockImplementation((_blob, _opts) => ({
  load: loadMock,
}));
jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
  PDFLoader: PDFLoaderMock,
}));

// Mock pdfjs-dist for OCR path
const pageObj = {
  objs: {
    get: jest.fn().mockResolvedValue({
      width: 100,
      height: 80,
      data: new Uint8Array([1, 2, 3]),
    }),
  },
  getOperatorList: jest
    .fn()
    .mockResolvedValue({ fnArray: [/* paint */ 92], argsArray: [['imgKey']] }),
};
const pdfDoc = { numPages: 1, getPage: jest.fn().mockResolvedValue(pageObj) };
const getDocumentMock = jest.fn(() => ({ promise: Promise.resolve(pdfDoc) }));
const OPS = { paintImageXObject: 92 };
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: getDocumentMock,
  OPS,
}));

// Mock ImageUtils and OcrService deps
jest.mock('./image', () => ({
  ImageUtils: class {
    extractImageBuffer = jest.fn(async () => Buffer.from([1, 2, 3]));
    isLikelyTextImage = jest.fn(() => true);
  },
}));
const batchRecognize = jest.fn(async () => ['OCR TEXT']);
jest.mock('../utils/ocr', () => ({
  OcrService: class {
    batchRecognize = batchRecognize;
  },
}));

import { PDFDocumentLoader } from './pdf';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('PDFDocumentLoader', () => {
  const imageUtilsMock = {
    extractImageBuffer: jest.fn(async () => Buffer.from([1, 2, 3])),
    isLikelyTextImage: jest.fn(() => true),
  } as any;
  it('loads PDF without OCR and merges metadata', async () => {
    const loader = new PDFDocumentLoader(
      imageUtilsMock,
      { batchRecognize } as any,
      logger,
    );
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/pdf',
    });
    const docs = await loader.loadBlob(
      blob,
      { splitPages: false, ocrEnabled: false },
      { tag: 'pdf' },
    );
    expect(PDFLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('pdf');
    expect(docs[0].pageContent).toContain('pdf text');
  });

  it('runs OCR path and enhances content', async () => {
    const loader = new PDFDocumentLoader(
      imageUtilsMock,
      { batchRecognize } as any,
      logger,
    );
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/pdf',
    });
    const docs = await loader.loadBlob(
      blob,
      { splitPages: true, ocrEnabled: true, ocrLanguage: 'eng' },
      {},
    );
    expect(getDocumentMock).toHaveBeenCalled();
    expect(batchRecognize).toHaveBeenCalled();
    expect(docs[0].metadata.containsOcrText).toBe(true);
    expect(docs[0].pageContent).toContain('OCR TEXT');
  });
});
