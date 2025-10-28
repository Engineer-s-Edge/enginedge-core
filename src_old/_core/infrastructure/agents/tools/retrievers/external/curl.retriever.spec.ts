jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { CurlRetriever } from './curl.retriever';
import { MyLogger } from '@core/services/logger/logger.service';
import axios from 'axios';

jest.mock('axios');

describe('CurlRetriever (behavior)', () => {
  const logger = new (MyLogger as any)();

  it('non-crawl: fetches a single page via loader and returns content/metadata', async () => {
    const mockedLoader = {
      load: jest.fn(async (url: string, _opts: any) => [
        { pageContent: 'Hello', metadata: { source: url, statusCode: 200 } },
      ]),
    } as any;
    const tool = new CurlRetriever(logger, mockedLoader);
    const res = await tool.execute({
      name: 'curl.retrieve',
      args: { url: 'https://example.com', headers: { 'X-Test': '1' } } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    expect(out.data).toEqual([
      {
        content: 'Hello',
        metadata: { source: 'https://example.com', statusCode: 200 },
      },
    ]);
    expect(mockedLoader.load).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: { 'X-Test': '1' },
        method: 'GET',
        timeout: 10000,
        extractMetadata: true,
      }),
    );
  });

  it('crawl: extracts links with sameDomainOnly, respects maxDepth and maxPages, and fetches each via loader', async () => {
    const mockedLoader = {
      load: jest.fn(async (url: string) => [
        {
          pageContent: `content:${new URL(url).pathname}`,
          metadata: { source: url, statusCode: 200 },
        },
      ]),
    } as any;
    // Mock axios.get for HTML fetching used in crawl
    (axios.get as jest.Mock).mockImplementation(async (url: string) => {
      if (url === 'https://site.com') {
        return {
          data: '<html><body><a href="/a">A</a><a href="https://site.com/b">B</a><a href="https://other.com/c">C</a></body></html>',
          status: 200,
        };
      }
      // pages /a and /b link to nothing further
      return { data: '<html><body><p>leaf</p></body></html>', status: 200 };
    });

    const tool = new CurlRetriever(logger, mockedLoader);
    const res = await tool.execute({
      name: 'curl.retrieve',
      args: {
        url: 'https://site.com',
        headers: { A: 'B' },
        timeoutMs: 5000,
        crawl: {
          enabled: true,
          maxDepth: 2,
          maxPages: 3,
          sameDomainOnly: true,
        },
      } as any,
    });

    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    // Should include seed page and up to maxPages total, excluding cross-domain link
    const contents = out.data.map((d: any) => d.content);
    expect(contents.some((c: string) => c === 'content:/')).toBe(true); // seed
    // At least one of /a or /b present, but capped by maxPages=3
    expect(
      contents.filter((c: string) => c.startsWith('content:/')).length,
    ).toBeLessThanOrEqual(3);
    // Cross-domain /c must be excluded
    expect(contents.some((c: string) => c === 'content:/c')).toBe(false);
    // Loader should be called for seed and for discovered same-domain links
    expect((mockedLoader.load as jest.Mock).mock.calls[0][0]).toBe(
      'https://site.com',
    );
    // axios.get should have been used for seed and maybe one of the discovered links depending on depth
    expect((axios.get as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('fails validation for missing required url', async () => {
    const tool = new CurlRetriever(logger);
    const res = await tool.execute({ name: 'curl.retrieve', args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });
});
