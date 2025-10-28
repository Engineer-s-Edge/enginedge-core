import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

const loadMock = jest
  .fn()
  .mockResolvedValue([new Document({ pageContent: 's3:obj', metadata: {} })]);
const S3LoaderMock = jest
  .fn()
  .mockImplementation((_opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/s3', () => ({
  S3Loader: S3LoaderMock,
}));

import { S3WebLoader } from './s3';

describe('S3WebLoader', () => {
  it('loads S3 object and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new S3WebLoader(logger);
    const docs = await loader.load(
      'b',
      'k',
      { region: 'us-east-1' },
      { tag: 's3' },
    );
    expect(S3LoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('s3');
  });
});
