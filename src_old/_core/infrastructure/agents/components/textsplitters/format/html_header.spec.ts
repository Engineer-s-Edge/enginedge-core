import { HTMLHeaderTextSplitterAdapter } from './html_header';

jest.mock('../utils/split_position', () => ({
  splitWithPositions: async (
    text: string,
    splitFn: (t: string) => Promise<string[]>,
  ) => {
    const parts = await splitFn(text);
    let offset = 0;
    return parts.map((p) => {
      const start = { line: 1, character: offset };
      const end = { line: 1, character: offset + p.length };
      offset += p.length;
      return { text: p, start, end };
    });
  },
}));

describe('HTMLHeaderTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  const html = `
  <html><body>
    <h1>Title</h1>
    <p>Some text here.</p>
    <h2>Sub</h2>
    <p>More text.</p>
  </body></html>`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('splitText splits by headers and chunks', async () => {
    const adapter = new HTMLHeaderTextSplitterAdapter(logger);
    const out = await adapter.splitText(html, {
      chunkSize: 20,
      chunkOverlap: 5,
    });
    expect(out.length).toBeGreaterThan(0);
    expect(logger.info).toHaveBeenCalled();
  });

  it('splitTextWithPositions returns positions', async () => {
    const adapter = new HTMLHeaderTextSplitterAdapter(logger);
    const out = await adapter.splitTextWithPositions(html, {
      chunkSize: 30,
      chunkOverlap: 0,
    });
    expect(out[0]).toHaveProperty('start');
    expect(out[0]).toHaveProperty('end');
  });
});
