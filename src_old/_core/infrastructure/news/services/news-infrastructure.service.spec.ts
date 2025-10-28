import { Test, TestingModule } from '@nestjs/testing';
import { NewsInfrastructureService } from './news-infrastructure.service';
import { MyLogger } from '../../../services/logger/logger.service';

// Minimal DataLakeService contract for mocking
class MockDataLakeService {
  loadRecords = jest.fn();
  deduplicateRecords = jest.fn((arr: any[]) => arr);
  applyFilters = jest.fn((arr: any[], _filters: any) => arr);
  sortByDate = jest.fn((arr: any[], _field: any, ascending: boolean) =>
    [...arr].sort((a, b) =>
      ascending
        ? a.published_date.localeCompare(b.published_date)
        : b.published_date.localeCompare(a.published_date),
    ),
  );
  extractMetadata = jest.fn((arr: any[], fields: string[]) => {
    const meta: Record<string, string[]> = {} as any;
    for (const f of fields)
      meta[f] = [...new Set(arr.map((a: any) => a[f]).flat())].filter(Boolean);
    return meta as any;
  });
  filterNewRecords = jest.fn((incoming: any[], existing: any[]) => {
    const existingIds = new Set(existing.map((e: any) => e.id));
    return incoming.filter((i) => !existingIds.has(i.id));
  });
  deleteObjectsWithPrefix = jest.fn();
  storeRecord = jest.fn();
}

const logger: Partial<MyLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

// Mock rss-parser module with controllable items per test
let __rssMockItems: any[] = [];
jest.mock('rss-parser', () => {
  const ctor = jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(async (_url: string) => ({ items: __rssMockItems })),
  }));
  return Object.assign(ctor, {
    __setMockItems: (items: any[]) => {
      __rssMockItems = items;
    },
  });
});

describe('NewsInfrastructureService', () => {
  let service: NewsInfrastructureService;
  let dataLake: MockDataLakeService;

  const makeArticle = (id: string, overrides: Partial<any> = {}) => ({
    id,
    title: `Title ${id}`,
    description: `Desc ${id}`,
    content: `Body ${id}`,
    url: `https://example.com/${id}`,
    published_date: new Date(2025, 0, Number(id)).toISOString(),
    author: 'Author',
    source: 'src',
    category: 'cat',
    tags: ['t1', 't2'],
    ...overrides,
  });

  beforeEach(async () => {
    dataLake = new MockDataLakeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsInfrastructureService,
        { provide: MyLogger, useValue: logger },
        {
          provide:
            (require('../../datalake') as any).DataLakeService ||
            'DataLakeService',
          useValue: dataLake,
        },
        // Fallback token mapping: the service imports from '../../datalake' barrel; our mock instance is injected by type
      ],
    })
      // force injection token matching the constructor param name
      .overrideProvider('DataLakeService')
      .useValue(dataLake)
      .compile();

    service = module.get(NewsInfrastructureService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('loadArticles should pass criteria and deduplicate results', async () => {
    const articles = [makeArticle('1'), makeArticle('2')];
    dataLake.loadRecords.mockResolvedValueOnce(articles);
    const res = await service.loadArticles({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
    } as any);
    expect(dataLake.loadRecords).toHaveBeenCalledWith(
      'news-articles',
      expect.objectContaining({
        prefix: 'articles/',
        extensions: ['.jsonl', '.json'],
        maxResults: 100,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      }),
    );
    expect(res).toEqual(articles);
  });

  it('filterArticles should delegate to dataLakeService.applyFilters', () => {
    const arr = [makeArticle('1')];
    dataLake.applyFilters.mockReturnValueOnce(arr);
    const out = service.filterArticles(arr as any, { category: 'x' } as any);
    expect(dataLake.applyFilters).toHaveBeenCalled();
    expect(out).toBe(arr);
  });

  it('sortArticles should use sortByDate for published_date', () => {
    const arr = [makeArticle('2'), makeArticle('1')];
    const out = service.sortArticles(arr as any, 'published_date', true);
    expect(dataLake.sortByDate).toHaveBeenCalled();
    expect(out[0].id).toBe('1');
  });

  it('sortArticles should generically sort other fields and handle undefineds', () => {
    const arr = [
      makeArticle('1', { author: undefined }),
      makeArticle('2', { author: 'A' }),
      makeArticle('3', { author: 'Z' }),
    ];
    const out = service.sortArticles(arr as any, 'author' as any, true);
    expect(out.map((a) => a.id)).toEqual(['1', '2', '3']);
  });

  it('findArticleById returns match or null', async () => {
    dataLake.loadRecords.mockResolvedValue([
      makeArticle('1'),
      makeArticle('2'),
    ]);
    expect(await service.findArticleById('2')).toMatchObject({ id: '2' });
    expect(await service.findArticleById('9')).toBeNull();
  });

  it('searchArticles should scan multiple fields and tags', () => {
    const arr = [
      makeArticle('1', { title: 'The Quantum Leap' }),
      makeArticle('2', { description: 'climate change impacts' }),
      makeArticle('3', { content: 'biology insights' }),
      makeArticle('4', { author: 'Ada' }),
      makeArticle('5', { source: 'TechCrunch' }),
      makeArticle('6', { category: 'health' }),
      makeArticle('7', { tags: ['innovation'] }),
    ];
    const res = service.searchArticles(arr as any, 'climate');
    expect(res.map((a) => a.id)).toEqual(['2']);
    expect(service.searchArticles(arr as any, '').length).toBe(arr.length);
  });

  it('extractFilterMetadata maps to available fields', () => {
    const arr = [
      makeArticle('1', { category: 'A', source: 'S', tags: ['x'] }),
      makeArticle('2', { category: 'B', source: 'S', tags: ['y'] }),
    ];
    const meta = service.extractFilterMetadata(arr as any);
    expect(meta.availableCategories.sort()).toEqual(['A', 'B']);
    expect(meta.availableSources).toEqual(['S']);
    expect(meta.availableTags.sort()).toEqual(['x', 'y']);
  });

  it('getArticlesByCategory/getArticlesBySource should load and filter', async () => {
    const arr = [
      makeArticle('1', { category: 'cat' }),
      makeArticle('2', { category: 'other' }),
    ];
    dataLake.loadRecords.mockResolvedValue(arr);
    dataLake.applyFilters.mockImplementation((a, f) =>
      a
        .filter((x: any) => !f.category || x.category === f.category)
        .filter((x: any) => !f.source || x.source === f.source),
    );
    const byCat = await service.getArticlesByCategory('cat');
    expect(byCat.map((a) => a.id)).toEqual(['1']);
    const bySrc = await service.getArticlesBySource('src');
    expect(bySrc.map((a) => a.id)).toEqual(['1', '2']);
  });

  it('getTrendingArticles should limit recent with quality metadata', async () => {
    const now = Date.now();
    const recent = new Date(now - 60 * 60 * 1000).toISOString();
    const arr = [
      makeArticle('1', {
        published_date: recent,
        title: 'A'.repeat(21),
        description: 'D'.repeat(101),
      }),
      makeArticle('2', {
        published_date: recent,
        title: 'short',
        description: 'short',
      }),
    ];
    dataLake.loadRecords.mockResolvedValue(arr);
    const out = await service.getTrendingArticles(1);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('bulkLoadArticlesByIds filters correctly', async () => {
    const arr = [makeArticle('1'), makeArticle('2'), makeArticle('3')];
    dataLake.loadRecords.mockResolvedValue(arr);
    const out = await service.bulkLoadArticlesByIds(['2', '3']);
    expect(out.map((a) => a.id)).toEqual(['2', '3']);
  });

  it('getArticleStats computes totals and counts', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const older = new Date(
      now.getTime() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const arr = [
      makeArticle('1', {
        category: 'c1',
        source: 's1',
        published_date: recent,
      }),
      makeArticle('2', { category: 'c1', source: 's2', published_date: older }),
    ];
    dataLake.loadRecords.mockResolvedValue(arr);
    const stats = await service.getArticleStats();
    expect(stats.total).toBe(2);
    expect(stats.categoryCounts).toEqual({ c1: 2 });
    expect(stats.sourceCounts).toEqual({ s1: 1, s2: 1 });
    expect(stats.recentCount).toBe(1);
  });

  it('deleteAllArticles calls data lake and logs', async () => {
    await service.deleteAllArticles();
    expect(dataLake.deleteObjectsWithPrefix).toHaveBeenCalledWith(
      'news-articles',
      'articles/',
    );
  });

  it('ingestScienceDailyArticles dedupes, filters new, and stores', async () => {
    // Make parser return two items so each feed will contribute 1 (articlesPerFeed)
    const items = [
      {
        link: 'https://x/a1',
        title: 'Article One',
        contentSnippet: 'desc',
        pubDate: new Date().toISOString(),
        ['dc:creator']: 'A',
      },
      {
        link: 'https://x/a2',
        title: 'Article Two',
        contentSnippet: 'desc2',
        pubDate: new Date().toISOString(),
        ['dc:creator']: 'B',
      },
    ];
    // Set the captured items used by our mock
    // @ts-ignore - variable from jest.mock closure
    __rssMockItems = items;
    const Parser = require('rss-parser');
    // Also force instance method to return our items in case of any closure mismatch
    Parser.prototype.parseURL = jest.fn(async () => ({ items }));
    dataLake.loadRecords.mockResolvedValueOnce([
      /* existing */
    ]);
    dataLake.filterNewRecords.mockImplementation((incoming: any[]) =>
      incoming.slice(0, 1),
    );
    const spyStore = jest
      .spyOn<any, any>(service as any, 'storeArticles')
      .mockResolvedValue(undefined);
    const res = await service.ingestScienceDailyArticles(4);
    expect(dataLake.deduplicateRecords).toHaveBeenCalled();
    expect(dataLake.filterNewRecords).toHaveBeenCalled();
    const incomingLen = (dataLake.filterNewRecords as any).mock.calls[0][0]
      .length;
    expect(incomingLen).toBeGreaterThan(0);
    expect(res.articlesIngested).toBe(1);
    expect(spyStore).toHaveBeenCalledTimes(1);
  });

  it('ingestAllNewsArticles aggregates per-source results', async () => {
    const spyDaily = jest
      .spyOn(service, 'ingestScienceDailyArticles')
      .mockResolvedValue({ articlesIngested: 2 });
    const spyNews = jest
      .spyOn(service, 'ingestScienceNewsArticles')
      .mockResolvedValue({ articlesIngested: 3 });
    const spyOrg = jest
      .spyOn(service, 'ingestScienceOrgArticles')
      .mockResolvedValue({ articlesIngested: 5 });
    const res = await service.ingestAllNewsArticles(15);
    expect(res.articlesIngested).toBe(10);
    expect(spyDaily).toHaveBeenCalled();
    expect(spyNews).toHaveBeenCalled();
    expect(spyOrg).toHaveBeenCalled();
  });
});
