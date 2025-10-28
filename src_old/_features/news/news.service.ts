import { Injectable } from '@nestjs/common';
import { DataLakeService } from '../../core/infrastructure/datalake';
import { NewsInfrastructureService } from '../../core/infrastructure/news';
import {
  NewsArticle,
  NewsFilter,
  NewsFeedResponse,
} from '../../core/infrastructure/news/types';
import { MyLogger } from '../../core/services/logger/logger.service';

@Injectable()
export class NewsService {
  constructor(
    private readonly dataLakeService: DataLakeService,
    private readonly newsInfrastructureService: NewsInfrastructureService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('NewsService initialized', NewsService.name);
  }

  async getNewsFeed(
    page: number = 1,
    pageSize: number = 20,
    filters: NewsFilter = {},
  ): Promise<NewsFeedResponse> {
    try {
      // Load articles from the data lake
      const allArticles =
        await this.newsInfrastructureService.loadArticles(filters);

      // Apply filters
      const filteredArticles = this.newsInfrastructureService.filterArticles(
        allArticles,
        filters,
      );

      // Sort by published date (newest first)
      const sortedArticles = this.newsInfrastructureService.sortArticles(
        filteredArticles,
        'published_date',
        false,
      );

      // Paginate results
      const paginatedResult = this.dataLakeService.paginate<NewsArticle>(
        sortedArticles,
        page,
        pageSize,
      );

      // Get filter metadata
      const filterMetadata =
        this.newsInfrastructureService.extractFilterMetadata(allArticles);

      return {
        articles: paginatedResult.items as NewsArticle[],
        totalCount: paginatedResult.totalCount,
        page: paginatedResult.page,
        pageSize: paginatedResult.pageSize,
        hasMore: paginatedResult.hasMore,
        filters: filterMetadata,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error getting news feed:', e.stack, NewsService.name);
      throw e;
    }
  }

  /**
   * Search articles by query
   */
  async searchArticles(
    query: string,
    page: number = 1,
    pageSize: number = 20,
    filters: NewsFilter = {},
  ): Promise<NewsFeedResponse> {
    try {
      // Load articles first
      const allArticles =
        await this.newsInfrastructureService.loadArticles(filters);

      // Apply filters
      const filteredArticles = this.newsInfrastructureService.filterArticles(
        allArticles,
        filters,
      );

      // Apply search query
      const searchedArticles = this.newsInfrastructureService.searchArticles(
        filteredArticles,
        query,
      );

      // Sort by published date (newest first)
      const sortedArticles = this.newsInfrastructureService.sortArticles(
        searchedArticles,
        'published_date',
        false,
      );

      // Paginate results
      const paginatedResult = this.dataLakeService.paginate<NewsArticle>(
        sortedArticles,
        page,
        pageSize,
      );

      // Get filter metadata
      const filterMetadata =
        this.newsInfrastructureService.extractFilterMetadata(allArticles);

      return {
        articles: paginatedResult.items as NewsArticle[],
        totalCount: paginatedResult.totalCount,
        page: paginatedResult.page,
        pageSize: paginatedResult.pageSize,
        hasMore: paginatedResult.hasMore,
        filters: filterMetadata,
      };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error searching articles:', e.stack, NewsService.name);
      throw e;
    }
  }

  /**
   * Get trending articles based on recent ingestion and engagement
   */
  async getTrendingArticles(
    limit: number = 10,
    category?: string,
  ): Promise<NewsArticle[]> {
    try {
      return await this.newsInfrastructureService.getTrendingArticles(
        limit,
        category,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error getting trending articles:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Get article by ID
   */
  async getArticleById(articleId: string): Promise<NewsArticle | null> {
    try {
      return await this.newsInfrastructureService.findArticleById(articleId);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error getting article ${articleId}:`,
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Get articles by category
   */
  async getArticlesByCategory(
    category: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<NewsFeedResponse> {
    return this.getNewsFeed(page, pageSize, { category });
  }

  /**
   * Get articles by source
   */
  async getArticlesBySource(
    source: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<NewsFeedResponse> {
    return this.getNewsFeed(page, pageSize, { source });
  }

  /**
   * Delete all articles from the data lake
   */
  async deleteAllArticles(): Promise<void> {
    try {
      this.logger.info(
        'Deleting all news articles from data lake',
        NewsService.name,
      );
      await this.newsInfrastructureService.deleteAllArticles();
      this.logger.info(
        'Successfully deleted all news articles',
        NewsService.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error deleting all articles:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest new articles from ScienceDaily RSS feeds
   */
  async ingestScienceDailyArticles(
    limit: number = 20,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(
        `Starting ScienceDaily ingestion with limit: ${limit}`,
        NewsService.name,
      );

      const result =
        await this.newsInfrastructureService.ingestScienceDailyArticles(limit);

      this.logger.info(
        `Successfully ingested ${result.articlesIngested} ScienceDaily articles`,
        NewsService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting ScienceDaily articles:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest new articles from Science News RSS feed
   */
  async ingestScienceNewsArticles(
    limit: number = 20,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(
        `Starting Science News ingestion with limit: ${limit}`,
        NewsService.name,
      );

      const result =
        await this.newsInfrastructureService.ingestScienceNewsArticles(limit);

      this.logger.info(
        `Successfully ingested ${result.articlesIngested} Science News articles`,
        NewsService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting Science News articles:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest new articles from Science.org RSS feed
   */
  async ingestScienceOrgArticles(
    limit: number = 20,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(
        `Starting Science.org ingestion with limit: ${limit}`,
        NewsService.name,
      );

      const result =
        await this.newsInfrastructureService.ingestScienceOrgArticles(limit);

      this.logger.info(
        `Successfully ingested ${result.articlesIngested} Science.org articles`,
        NewsService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting Science.org articles:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest new articles from all RSS feeds (ScienceDaily, Science News, and Science.org)
   */
  async ingestAllNewsArticles(
    limit: number = 60,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(
        `Starting comprehensive news ingestion with limit: ${limit}`,
        NewsService.name,
      );

      const result =
        await this.newsInfrastructureService.ingestAllNewsArticles(limit);

      this.logger.info(
        `Successfully ingested ${result.articlesIngested} total articles from all sources`,
        NewsService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting news articles from all sources:',
        e.stack,
        NewsService.name,
      );
      throw e;
    }
  }
}
