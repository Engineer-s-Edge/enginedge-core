import { NewsService } from './news.service';
import { DataLakeService } from '../../core/infrastructure/datalake';
import { NewsInfrastructureService } from '../../core/infrastructure/news';
import { MyLogger } from '../../core/services/logger/logger.service';

describe('NewsService', () => {
  let service: NewsService;
  let dataLake: jest.Mocked<DataLakeService>;
  let infra: jest.Mocked<NewsInfrastructureService>;
  let logger: jest.Mocked<MyLogger>;

  const articles = [
    {
      id: '1',
      title: 'A',
      published_date: '2024-01-02',
      category: 'science',
      source: 'sd',
      tags: ['ai'],
    },
    {
      id: '2',
      title: 'B',
      published_date: '2024-01-03',
      category: 'tech',
      source: 'sn',
      tags: ['ml'],
    },
    {
      id: '3',
      title: 'C',
      published_date: '2024-01-01',
      category: 'science',
      source: 'so',
      tags: ['ai', 'nlp'],
    },
  ] as any[];

  beforeEach(() => {
    dataLake = {
      paginate: jest.fn().mockImplementation((items, page, pageSize) => ({
        items: items.slice(0, pageSize),
        totalCount: items.length,
        page,
        pageSize,
        hasMore: items.length > pageSize,
      })),
      applyFilters: jest.fn((items) => items),
      sortByDate: jest.fn((items, field, ascending) =>
        [...items].sort((a, b) =>
          ascending
            ? (a[field] as string).localeCompare(b[field])
            : (b[field] as string).localeCompare(a[field]),
        ),
      ),
      extractMetadata: jest.fn(() => ({
        category: ['science', 'tech'],
        source: ['sd', 'sn', 'so'],
        tags: ['ai', 'ml', 'nlp'],
      })),
    } as any;

    infra = {
      loadArticles: jest.fn().mockResolvedValue(articles as any),
      filterArticles: jest.fn((items) => items),
      sortArticles: jest.fn((items, field, ascending) =>
        [...items].sort((a: any, b: any) =>
          ascending
            ? (a[field] as string).localeCompare(b[field])
            : (b[field] as string).localeCompare(a[field]),
        ),
      ),
      extractFilterMetadata: jest.fn(() => ({
        availableCategories: ['science', 'tech'],
        availableSources: ['sd', 'sn', 'so'],
        availableTags: ['ai', 'ml', 'nlp'],
      })),
      searchArticles: jest.fn((items, query) =>
        items.filter((i: any) => i.title.includes(query)),
      ),
      getTrendingArticles: jest
        .fn()
        .mockResolvedValue(articles.slice(0, 2) as any),
      findArticleById: jest.fn().mockResolvedValue(articles[0] as any),
      deleteAllArticles: jest.fn().mockResolvedValue(undefined),
      ingestScienceDailyArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 5 }),
      ingestScienceNewsArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 6 }),
      ingestScienceOrgArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 7 }),
      ingestAllNewsArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 18 }),
    } as any;

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as any;

    service = new NewsService(dataLake, infra, logger);
  });

  it('getNewsFeed returns paginated, sorted, and filter metadata', async () => {
    const res = await service.getNewsFeed(1, 2, { category: 'science' } as any);
    expect(infra.loadArticles).toHaveBeenCalled();
    expect(infra.filterArticles).toHaveBeenCalled();
    expect(infra.sortArticles).toHaveBeenCalled();
    expect(dataLake.paginate).toHaveBeenCalled();
    expect(res.articles.length).toBe(2);
    expect(res.totalCount).toBe(3);
    expect(res.filters.availableCategories).toContain('science');
  });

  it('searchArticles applies search then paginates', async () => {
    const res = await service.searchArticles('A', 1, 10, {} as any);
    expect(infra.searchArticles).toHaveBeenCalled();
    // Only one article title contains 'A' in the mock dataset
    expect(res.totalCount).toBe(1);
    expect(res.articles[0].title).toBe('A');
  });

  it('getTrendingArticles delegates to infra', async () => {
    const res = await service.getTrendingArticles(2, 'science');
    expect(infra.getTrendingArticles).toHaveBeenCalledWith(2, 'science');
    expect(res.length).toBe(2);
  });

  it('getArticleById delegates to infra', async () => {
    const res = await service.getArticleById('1');
    expect(infra.findArticleById).toHaveBeenCalledWith('1');
    expect(res?.id).toBe('1');
  });

  it('deleteAllArticles calls infra and logs', async () => {
    await service.deleteAllArticles();
    expect(infra.deleteAllArticles).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('ingestion methods call corresponding infra functions', async () => {
    await expect(service.ingestScienceDailyArticles(5)).resolves.toEqual({
      articlesIngested: 5,
    });
    await expect(service.ingestScienceNewsArticles(6)).resolves.toEqual({
      articlesIngested: 6,
    });
    await expect(service.ingestScienceOrgArticles(7)).resolves.toEqual({
      articlesIngested: 7,
    });
    await expect(service.ingestAllNewsArticles(18)).resolves.toEqual({
      articlesIngested: 18,
    });
    expect(infra.ingestScienceDailyArticles).toHaveBeenCalledWith(5);
    expect(infra.ingestScienceNewsArticles).toHaveBeenCalledWith(6);
    expect(infra.ingestScienceOrgArticles).toHaveBeenCalledWith(7);
    expect(infra.ingestAllNewsArticles).toHaveBeenCalledWith(18);
  });

  it('propagates errors and logs from getNewsFeed', async () => {
    infra.loadArticles.mockRejectedValueOnce(new Error('boom'));
    await expect(service.getNewsFeed()).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalled();
  });
});
