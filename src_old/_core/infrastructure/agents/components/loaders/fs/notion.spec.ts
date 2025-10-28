import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

// fs/os/path/uuid mocks
jest.mock('os', () => ({ tmpdir: () => 'C:/tmp' }));
jest.mock('path', () => ({ join: (...p: string[]) => p.join('/') }));
const fsOps: any = {
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rm: jest.fn((dir: string, _opts: any, cb: Function) => cb && cb(undefined)),
};
jest.mock('fs', () => fsOps);
jest.mock('uuid', () => ({ v4: () => 'uuid-5678' }));

// extract-zip virtual mock
const extractMock = jest.fn().mockResolvedValue(undefined);
jest.mock('extract-zip', () => extractMock, { virtual: true });

// Notion loader mock
const loadMock = jest
  .fn()
  .mockResolvedValue([new Document({ pageContent: 'n:hello', metadata: {} })]);
const NotionLoaderMock = jest.fn().mockImplementation((_dir: string) => ({
  load: loadMock,
}));
jest.mock('@langchain/community/document_loaders/fs/notion', () => ({
  NotionLoader: NotionLoaderMock,
}));

import { NotionDocumentLoader } from './notion';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('NotionDocumentLoader', () => {
  it('writes zip, extracts, loads, and merges metadata', async () => {
    const loader = new NotionDocumentLoader(logger);
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/zip',
    });
    const docs = await loader.loadBlob(blob, {}, { tag: 'notion' });
    expect(fsOps.writeFileSync).toHaveBeenCalled();
    expect(extractMock).toHaveBeenCalled();
    expect(NotionLoaderMock).toHaveBeenCalledWith(
      'C:/tmp/notion-import-uuid-5678',
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('notion');
    expect(docs[0].pageContent).toContain('n:hello');
  });
});
