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
  .mockResolvedValue([
    new Document({ pageContent: 'g:file', metadata: { path: 'README.md' } }),
  ]);
const GithubRepoLoaderMock = jest
  .fn()
  .mockImplementation((_repo: string, _opts: any) => ({ load: loadMock }));
jest.mock('@langchain/community/document_loaders/web/github', () => ({
  GithubRepoLoader: GithubRepoLoaderMock,
}));

import { GitHubRepoLoader } from './github';

describe('GitHubRepoLoader', () => {
  it('loads repo and merges metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new GitHubRepoLoader(logger);
    const docs = await loader.load(
      'owner/repo',
      { branch: 'main' },
      { tag: 'gh' },
    );
    expect(GithubRepoLoaderMock).toHaveBeenCalled();
    expect(docs[0].metadata.tag).toBe('gh');
  });
});
