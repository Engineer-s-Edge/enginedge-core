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
jest.mock('uuid', () => ({ v4: () => 'uuid-1357' }));

// OpenAI Whisper loader mock
const loadMock = jest
  .fn()
  .mockResolvedValue([
    new Document({ pageContent: 'whisper text', metadata: {} }),
  ]);
const WhisperMock = jest.fn().mockImplementation((_opts: any) => ({
  load: loadMock,
}));
jest.mock(
  '@langchain/community/document_loaders/fs/openai_whisper_audio',
  () => ({
    OpenAIWhisperAudio: WhisperMock,
  }),
);

import { OpenAIWhisperAudioLoader } from './openai_whisper_audio';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

describe('OpenAIWhisperAudioLoader', () => {
  it('writes temp audio, infers extension, and merges metadata', async () => {
    const loader = new OpenAIWhisperAudioLoader(logger);
    const blob = new Blob([new Uint8Array([0, 1, 2])], { type: 'audio/mpeg' });
    const docs = await loader.loadBlob(
      blob,
      { model: 'whisper-1' },
      { tag: 'audio' },
    );
    expect(fsOps.writeFileSync).toHaveBeenCalled();
    expect(WhisperMock).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.tag).toBe('audio');
    expect(docs[0].pageContent).toContain('whisper');
  });
});
