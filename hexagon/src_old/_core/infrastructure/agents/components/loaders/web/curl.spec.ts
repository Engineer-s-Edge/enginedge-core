import { Document } from '@langchain/core/documents';

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

// axios mock that is both callable and has a post signature (for consistency)
const axiosMock: any = jest.fn(async () => ({
  status: 200,
  data: '<html><head><title>X</title><meta name="description" content="D"></head><body><div id="main">hello</div></body></html>',
  headers: { 'content-type': 'text/html' },
}));
axiosMock.post = jest.fn(async () => ({ status: 200, data: {}, headers: {} }));
jest.mock('axios', () => ({ __esModule: true, default: axiosMock }));

// cheerio and sanitize-html are used internally; provide minimal pass-through mocks if needed
// But default implementations should work in test env; avoid over-mocking

import { CurlWebLoader } from './curl';

describe('CurlWebLoader', () => {
  it('fetches HTML, processes content, and builds metadata', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new CurlWebLoader(logger);
    const [doc] = await loader.load(
      'https://example.com',
      { removeSelectors: ['script'] },
      { tag: 'curl' },
    );
    expect(axiosMock).toHaveBeenCalled();
    expect(doc).toBeInstanceOf(Document);
    expect(doc.metadata.tag).toBe('curl');
    expect(doc.metadata.title).toBe('X');
    expect(doc.pageContent).toContain('hello');
  });
});
