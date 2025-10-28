import { HTMLSectionTextSplitterAdapter } from './html_section';

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

describe('HTMLSectionTextSplitterAdapter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  const html = `
  <html><body>
    <h1>Section 1</h1>
    <p>Alpha beta.</p>
    <h2>Section 2</h2>
    <p>Gamma delta.</p>
  </body></html>`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('splitText splits into sections', async () => {
    const adapter = new HTMLSectionTextSplitterAdapter(logger);
    const out = await adapter.splitText(html, {
      chunkSize: 50,
      chunkOverlap: 0,
    });
    expect(out.length).toBeGreaterThan(0);
  });

  it('splitTextWithPositions returns positions', async () => {
    const adapter = new HTMLSectionTextSplitterAdapter(logger);
    const out = await adapter.splitTextWithPositions(html, {
      chunkSize: 50,
      chunkOverlap: 0,
    });
    expect(out[0]).toHaveProperty('start');
    expect(out[0]).toHaveProperty('end');
  });
});
