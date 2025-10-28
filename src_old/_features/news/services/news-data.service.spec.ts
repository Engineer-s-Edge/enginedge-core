import { NewsDataService } from './news-data.service';
import { DataLakeService } from '../../../core/infrastructure/datalake';
import { MyLogger } from '../../../core/services/logger/logger.service';

describe('NewsDataService', () => {
  let service: NewsDataService;
  let dataLake: jest.Mocked<DataLakeService>;
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
      loadRecords: jest.fn().mockResolvedValue(articles as any),
      applyFilters: jest.fn((items) => items),
      sortByDate: jest.fn((items, field, ascending) =>
        [...items].sort((a: any, b: any) =>
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

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as any;
    service = new NewsDataService(dataLake, logger);
  });

  it('loadArticles calls data lake with criteria from filters', async () => {
    const res = await service.loadArticles({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
    } as any);
    expect(dataLake.loadRecords).toHaveBeenCalledWith(
      'news-articles',
      expect.objectContaining({
        prefix: 'articles/',
        extensions: ['.jsonl', '.json'],
        maxResults: 50,
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      }),
    );
    expect(res.length).toBe(3);
  });

  it('filterArticles delegates to data lake', () => {
    const out = service.filterArticles(
      articles as any,
      { category: 'science' } as any,
    );
    expect(dataLake.applyFilters).toHaveBeenCalled();
    expect(out.length).toBe(3);
  });

  it('sortArticles delegates to data lake sortByDate', () => {
    const out = service.sortArticles(articles as any, false);
    expect(dataLake.sortByDate).toHaveBeenCalledWith(
      articles,
      'published_date',
      false,
    );
    expect(out[0].published_date >= out[1].published_date).toBe(true);
  });

  it('findArticleById loads and returns matching item', async () => {
    const res = await service.findArticleById('2');
    expect(res?.id).toBe('2');
  });

  it('extractFilterMetadata maps from data lake metadata', () => {
    const meta = service.extractFilterMetadata(articles as any);
    expect(dataLake.extractMetadata).toHaveBeenCalled();
    expect(meta.availableCategories).toContain('science');
    expect(meta.availableSources).toContain('sd');
    expect(meta.availableTags).toContain('ai');
  });
});
