import { Document } from '@langchain/core/documents';
jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rm: jest.fn((path: string, opts: any, cb: Function) => cb?.(undefined)),
}));
jest.mock('os', () => {
  const actual = jest.requireActual('os');
  return { ...actual, tmpdir: () => 'C:/tmp' };
});
jest.mock('path', () => ({ join: (...args: string[]) => args.join('/') }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
jest.mock('@langchain/community/document_loaders/fs/epub', () => ({
  EPubLoader: jest.fn().mockImplementation((_path, _opts) => ({
    load: jest
      .fn()
      .mockResolvedValue([
        new Document({ pageContent: 'epub:c1', metadata: { chapter: 1 } }),
      ]),
  })),
}));
import { EPUBDocumentLoader } from './epub';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('EPUBDocumentLoader', () => {
  it('writes temp file and loads docs', async () => {
    const loader = new EPUBDocumentLoader(logger);
    const blob = new Blob([new Uint8Array([1, 2])], {
      type: 'application/epub+zip',
    } as any);
    const docs = await loader.loadBlob(
      blob,
      { splitChapters: true },
      { tag: 'epub' },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toContain('epub:c1');
    expect(docs[0].metadata.tag).toBe('epub');
  });
});
