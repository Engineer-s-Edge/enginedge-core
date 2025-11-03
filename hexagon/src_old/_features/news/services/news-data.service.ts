import { Injectable } from '@nestjs/common';
import {
  DataLakeService,
  FilterCriteria,
} from '../../../core/infrastructure/datalake';
import { NewsArticle, NewsFilter } from '../types/news.types';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class NewsDataService {
  private readonly bucketName = 'news-articles';

  constructor(
    private readonly dataLakeService: DataLakeService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('NewsDataService initialized', NewsDataService.name);
  }

  /**
   * Load news articles from the data lake
   */
  async loadArticles(filters: NewsFilter = {}): Promise<NewsArticle[]> {
    try {
      const criteria: FilterCriteria = {
        prefix: 'articles/',
        extensions: ['.jsonl', '.json'],
        maxResults: 50, // Limit file loading
      };

      // Add date-based filtering at the storage level if possible
      if (filters.dateFrom) {
        criteria.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        criteria.dateTo = filters.dateTo;
      }

      // Load articles from the data lake
      const articles = await this.dataLakeService.loadRecords<NewsArticle>(
        this.bucketName,
        criteria,
      );

      this.logger.info(
        `Loaded ${articles.length} articles from data lake`,
        NewsDataService.name,
      );
      return articles;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error loading articles from data lake:',
        e.stack,
        NewsDataService.name,
      );
      throw e;
    }
  }

  /**
   * Filter articles using the data lake service
   */
  filterArticles(articles: NewsArticle[], filters: NewsFilter): NewsArticle[] {
    return this.dataLakeService.applyFilters(articles, filters);
  }

  /**
   * Sort articles by published date
   */
  sortArticles(
    articles: NewsArticle[],
    ascending: boolean = false,
  ): NewsArticle[] {
    return this.dataLakeService.sortByDate(
      articles,
      'published_date',
      ascending,
    );
  }

  /**
   * Get article by ID
   */
  async findArticleById(articleId: string): Promise<NewsArticle | null> {
    try {
      const articles = await this.loadArticles();
      return articles.find((article) => article.id === articleId) || null;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error finding article ${articleId}:`,
        e.stack,
        NewsDataService.name,
      );
      throw e;
    }
  }

  /**
   * Extract filter metadata from articles
   */
  extractFilterMetadata(articles: NewsArticle[]): {
    availableCategories: string[];
    availableSources: string[];
    availableTags: string[];
  } {
    const metadata = this.dataLakeService.extractMetadata(articles, [
      'category',
      'source',
      'tags',
    ]);

    return {
      availableCategories: metadata.category || [],
      availableSources: metadata.source || [],
      availableTags: metadata.tags || [],
    };
  }
}
