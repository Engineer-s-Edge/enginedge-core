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
jest.mock('uuid', () => ({ v4: () => 'uuid-2468' }));

// extract-zip virtual mock
const extractMock = jest.fn().mockResolvedValue(undefined);
jest.mock('extract-zip', () => extractMock, { virtual: true });

// Obsidian loader mock
const loadMock = jest
  .fn()
  .mockResolvedValue([new Document({ pageContent: 'o:note', metadata: {} })]);
const ObsidianLoaderMock = jest.fn().mockImplementation((_dir: string) => ({
  load: loadMock,
}));
jest.mock('@langchain/community/document_loaders/fs/obsidian', () => ({
  ObsidianLoader: ObsidianLoaderMock,
}));

import { ObsidianDocumentLoader } from './obsidian';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('ObsidianDocumentLoader', () => {
  it('writes zip, extracts, loads, and merges metadata', async () => {
    const loader = new ObsidianDocumentLoader(logger);
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/zip',
    });
    const docs = await loader.loadBlob(blob, {}, { tag: 'obs' });
    expect(fsOps.writeFileSync).toHaveBeenCalled();
    expect(extractMock).toHaveBeenCalled();
    expect(ObsidianLoaderMock).toHaveBeenCalledWith(
      'C:/tmp/obsidian-import-uuid-2468',
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('obs');
    expect(docs[0].pageContent).toContain('o:note');
  });
});
