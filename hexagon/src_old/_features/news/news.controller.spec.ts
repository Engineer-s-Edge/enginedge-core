import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('NewsController', () => {
  let controller: NewsController;
  let service: jest.Mocked<NewsService>;

  beforeEach(() => {
    service = {
      getNewsFeed: jest.fn().mockResolvedValue({
        articles: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        filters: {
          availableCategories: [],
          availableSources: [],
          availableTags: [],
        },
      }),
      searchArticles: jest.fn().mockResolvedValue({
        articles: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        filters: {
          availableCategories: [],
          availableSources: [],
          availableTags: [],
        },
      }),
      getTrendingArticles: jest.fn().mockResolvedValue([]),
      getArticleById: jest.fn().mockResolvedValue({ id: '1' } as any),
      getArticlesByCategory: jest.fn().mockResolvedValue({} as any),
      getArticlesBySource: jest.fn().mockResolvedValue({} as any),
      deleteAllArticles: jest.fn().mockResolvedValue(undefined),
      ingestScienceDailyArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 1 }),
      ingestScienceNewsArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 1 }),
      ingestScienceOrgArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 1 }),
      ingestAllNewsArticles: jest
        .fn()
        .mockResolvedValue({ articlesIngested: 3 }),
    } as any;

    controller = new NewsController(service);
  });

  it('getNewsFeed parses numbers and tags and calls service', async () => {
    const res = await controller.getNewsFeed(
      '2',
      '10',
      'science',
      'sd',
      '2024-01-01',
      '2024-01-31',
      'ai',
      'a,b',
    );
    expect(service.getNewsFeed).toHaveBeenCalledWith(
      2,
      10,
      expect.objectContaining({
        category: 'science',
        source: 'sd',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        searchQuery: 'ai',
        tags: ['a', 'b'],
      }),
    );
    expect(res.page).toBe(1); // mocked value
  });

  it('searchArticles requires query', async () => {
    await expect(controller.searchArticles('', '1', '10')).rejects.toThrow(
      HttpException,
    );
  });

  it('searchArticles calls service with parsed numbers and filters', async () => {
    await controller.searchArticles('ml', '3', '5', 'science', 'sd');
    expect(service.searchArticles).toHaveBeenCalledWith('ml', 3, 5, {
      category: 'science',
      source: 'sd',
    });
  });

  it('getTrendingArticles parses limit and forwards', async () => {
    await controller.getTrendingArticles('7', 'science');
    expect(service.getTrendingArticles).toHaveBeenCalledWith(7, 'science');
  });

  it('getArticleById validates input and returns', async () => {
    await expect(controller.getArticleById('  ')).rejects.toThrow(
      HttpException,
    );
    const res = await controller.getArticleById('1');
    expect(res.id).toBe('1');
  });

  it('getArticleById returns 404 when not found', async () => {
    service.getArticleById.mockResolvedValueOnce(null);
    await expect(controller.getArticleById('2')).rejects.toThrow(
      new HttpException('Article not found', HttpStatus.NOT_FOUND),
    );
  });

  it('category and source routes validate and forward', async () => {
    await expect(controller.getArticlesByCategory('')).rejects.toThrow(
      HttpException,
    );
    await controller.getArticlesByCategory('science', '2', '30');
    expect(service.getArticlesByCategory).toHaveBeenCalledWith(
      'science',
      2,
      30,
    );

    await expect(controller.getArticlesBySource('')).rejects.toThrow(
      HttpException,
    );
    await controller.getArticlesBySource('sd', '1', '15');
    expect(service.getArticlesBySource).toHaveBeenCalledWith('sd', 1, 15);
  });

  it('getCategories and getSources derive lists from minimal feed call', async () => {
    service.getNewsFeed.mockResolvedValueOnce({
      articles: [],
      totalCount: 0,
      page: 1,
      pageSize: 1,
      hasMore: false,
      filters: {
        availableCategories: ['science'],
        availableSources: ['sd'],
        availableTags: [],
      },
    } as any);
    const cats = await controller.getCategories();
    expect(cats).toEqual(['science']);

    service.getNewsFeed.mockResolvedValueOnce({
      articles: [],
      totalCount: 0,
      page: 1,
      pageSize: 1,
      hasMore: false,
      filters: {
        availableCategories: [],
        availableSources: ['sn'],
        availableTags: [],
      },
    } as any);
    const sources = await controller.getSources();
    expect(sources).toEqual(['sn']);
  });

  it('deleteAllArticles calls service and returns message', async () => {
    const resp = await controller.deleteAllArticles();
    expect(service.deleteAllArticles).toHaveBeenCalled();
    expect(resp.message).toContain('deleted successfully');
  });

  it('ingest endpoints parse limits and forward', async () => {
    await controller.ingestScienceDailyArticles('9');
    expect(service.ingestScienceDailyArticles).toHaveBeenCalledWith(9);

    await controller.ingestScienceNewsArticles('11');
    expect(service.ingestScienceNewsArticles).toHaveBeenCalledWith(11);

    await controller.ingestScienceOrgArticles('13');
    expect(service.ingestScienceOrgArticles).toHaveBeenCalledWith(13);

    await controller.ingestAllNewsArticles('27');
    expect(service.ingestAllNewsArticles).toHaveBeenCalledWith(27);
  });

  it('health endpoint returns ok', async () => {
    const res = await controller.healthCheck();
    expect(res.status).toBe('ok');
  });
});
