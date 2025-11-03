import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

// Mock fs/os/path/uuid for temp file behaviors
jest.mock('os', () => ({ tmpdir: () => 'C:/tmp' }));
jest.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));
const fsOps: any = {
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rm: jest.fn((dir: string, _opts: any, cb: Function) => cb && cb(undefined)),
};
jest.mock('fs', () => fsOps);
jest.mock('uuid', () => ({ v4: () => 'uuid-1234' }));

// Mock Unstructured loader
const loadMock = jest
  .fn()
  .mockResolvedValue([
    new Document({ pageContent: 'u:one', metadata: { from: 'unstructured' } }),
  ]);
const UnstructuredLoaderMock = jest.fn().mockImplementation((_fp, _opt) => ({
  load: loadMock,
}));
jest.mock('@langchain/community/document_loaders/fs/unstructured', () => ({
  UnstructuredLoader: UnstructuredLoaderMock,
}));

import { UnstructuredDocumentLoader } from './unstructured';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('UnstructuredDocumentLoader', () => {
  it('writes temp file, passes options, and merges metadata', async () => {
    const loader = new UnstructuredDocumentLoader(logger);
    const blob = new Blob([JSON.stringify({ hello: 'world' })], {
      type: 'application/json',
    });
    const docs = await loader.loadBlob(
      blob,
      { strategy: 'hi_res', coordinates: true, xmlKeepTags: true },
      { tag: 'u' },
    );
    expect(fsOps.mkdirSync).toHaveBeenCalled();
    expect(fsOps.writeFileSync).toHaveBeenCalled();
    expect(UnstructuredLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('u');
    expect(docs[0].pageContent).toContain('u:one');
  });
});
