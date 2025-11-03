jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { TavilyRetriever } from './tavily.retriever';
import { MyLogger } from '@core/services/logger/logger.service';

describe('TavilyRetriever (behavior)', () => {
  it('fails validation when query missing', async () => {
    const tool = new TavilyRetriever(new MyLogger() as any);
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('merges options with ragConfig top_k and maps documents', async () => {
    const logger = new (MyLogger as any)();
    const loader = {
      load: jest.fn(async (query: string, _opts: any) => [
        { pageContent: `result for ${query}`, metadata: { score: 0.9 } },
      ]),
    } as any;
    const tool = new TavilyRetriever(logger, loader);
    const res = await tool.execute({
      name: 'tavily.retrieve',
      args: {
        query: 'ai news',
        // no maxResults provided: should use ragConfig.top_k fallback (default 8)
      } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    expect(out.data).toEqual([
      { content: 'result for ai news', metadata: { score: 0.9 } },
    ]);
    expect(loader.load).toHaveBeenCalledWith(
      'ai news',
      expect.objectContaining({
        maxResults: 8,
        searchDepth: 'advanced',
        includeRawContent: true,
        includeImages: false,
      }),
    );
  });

  it('respects explicit maxResults and apiKey argument over env, include flags, and domain filters', async () => {
    const logger = new (MyLogger as any)();
    const loader = { load: jest.fn(async () => []) } as any;
    const tool = new TavilyRetriever(logger, loader);
    process.env.TAVILY_API_KEY = 'ENVKEY';
    await tool.execute({
      name: 'tavily.retrieve',
      args: {
        query: 'q',
        maxResults: 3,
        apiKey: 'ARGKEY',
        includeRawContent: false,
        includeImages: true,
        filterDomains: ['example.com'],
        excludeDomains: ['bad.com'],
        safeSearch: true,
      } as any,
    });
    const [, opts] = (loader.load as jest.Mock).mock.calls[0];
    expect(opts.apiKey).toBe('ARGKEY');
    expect(opts.maxResults).toBe(3);
    expect(opts.includeRawContent).toBe(false);
    expect(opts.includeImages).toBe(true);
    expect(opts.filterDomains).toEqual(['example.com']);
    expect(opts.excludeDomains).toEqual(['bad.com']);
    expect(opts.safeSearch).toBe(true);
  });

  it('returns failure when loader throws', async () => {
    const logger = new (MyLogger as any)();
    const loader = {
      load: jest.fn(async () => {
        throw new Error('tavily down');
      }),
    } as any;
    const tool = new TavilyRetriever(logger, loader);
    const res = await tool.execute({
      name: 'tavily.retrieve',
      args: { query: 'x' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('tavily down');
    }
  });
});
