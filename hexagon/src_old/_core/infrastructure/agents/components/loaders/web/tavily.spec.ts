// no imports needed from langchain docs for this test

jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
  },
}));

const axiosPost = jest.fn(async () => ({
  status: 200,
  data: {
    results: [
      {
        title: 'A',
        url: 'https://a.example',
        content: 'aa',
        raw_content: 'raw a',
        score: 0.9,
      },
      {
        title: 'B',
        url: 'https://b.example',
        content: 'bb',
        raw_content: 'raw b',
        score: 0.8,
      },
    ],
  },
  headers: { 'content-type': 'application/json' },
}));
const axiosMock: any = Object.assign(jest.fn(), { post: axiosPost });
jest.mock('axios', () => ({ __esModule: true, default: axiosMock }));

import { TavilySearchLoader } from './tavily';

describe('TavilySearchLoader', () => {
  it('calls Tavily API and maps results to docs', async () => {
    process.env.TAVILY_API_KEY = 'test';
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    const loader = new TavilySearchLoader(logger);
    const docs = await loader.load(
      'query',
      { includeRawContent: true },
      { tag: 'tv' },
    );
    expect(axiosPost).toHaveBeenCalled();
    expect(docs).toHaveLength(2);
    expect(docs[0].metadata.tag).toBe('tv');
    expect(docs[0].pageContent).toContain('Title:');
  });
});
