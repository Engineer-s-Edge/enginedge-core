import { Document } from '@langchain/core/documents';
jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));
jest.mock('@langchain/community/document_loaders/fs/srt', () => ({
  SRTLoader: jest.fn().mockImplementation((_blob) => ({
    load: jest
      .fn()
      .mockResolvedValue([
        new Document({ pageContent: 'srt:hello', metadata: { lang: 'en' } }),
      ]),
  })),
}));
import { SRTDocumentLoader } from './srt';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('SRTDocumentLoader', () => {
  it('returns docs and merges metadata', async () => {
    const loader = new SRTDocumentLoader(logger);
    const blob = new Blob([`1\n00:00:00,000 --> 00:00:01,000\nHello`], {
      type: 'text/plain',
    });
    const docs = await loader.loadBlob(
      blob,
      { shouldParseInformation: true },
      { tag: 'srt' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toContain('srt:hello');
    expect(docs[0].metadata.tag).toBe('srt');
  });
});
