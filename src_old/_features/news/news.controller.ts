import {
  Controller,
  Get,
  Query,
  Param,
  Delete,
  Post,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { NewsService } from './news.service';
import {
  NewsFilter,
  NewsFeedResponse,
  NewsArticle,
} from '../../core/infrastructure/news/types';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  /**
   * Get news feed with pagination and filters
   */
  @Get('feed')
  async getNewsFeed(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
  ): Promise<NewsFeedResponse> {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

      const filters: NewsFilter = {
        category,
        source,
        dateFrom,
        dateTo,
        searchQuery: search,
        tags: tags ? tags.split(',').map((tag) => tag.trim()) : undefined,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key as keyof NewsFilter] === undefined) {
          delete filters[key as keyof NewsFilter];
        }
      });

      return await this.newsService.getNewsFeed(pageNum, pageSizeNum, filters);
    } catch (error) {
      throw new HttpException(
        'Failed to fetch news feed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search articles
   */
  @Get('search')
  async searchArticles(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Query('category') category?: string,
    @Query('source') source?: string,
  ): Promise<NewsFeedResponse> {
    if (!query || query.trim().length === 0) {
      throw new HttpException(
        'Search query is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

      const filters: NewsFilter = {
        category,
        source,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key as keyof NewsFilter] === undefined) {
          delete filters[key as keyof NewsFilter];
        }
      });

      return await this.newsService.searchArticles(
        query.trim(),
        pageNum,
        pageSizeNum,
        filters,
      );
    } catch (error) {
      throw new HttpException(
        'Failed to search articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get trending articles
   */
  @Get('trending')
  async getTrendingArticles(
    @Query('limit') limit: string = '10',
    @Query('category') category?: string,
  ): Promise<NewsArticle[]> {
    try {
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

      return await this.newsService.getTrendingArticles(limitNum, category);
    } catch (error) {
      throw new HttpException(
        'Failed to fetch trending articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get article by ID
   */
  @Get('article/:id')
  async getArticleById(@Param('id') id: string): Promise<NewsArticle> {
    if (!id || id.trim().length === 0) {
      throw new HttpException('Article ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const article = await this.newsService.getArticleById(id.trim());

      if (!article) {
        throw new HttpException('Article not found', HttpStatus.NOT_FOUND);
      }

      return article;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch article',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get articles by category
   */
  @Get('category/:category')
  async getArticlesByCategory(
    @Param('category') category: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ): Promise<NewsFeedResponse> {
    if (!category || category.trim().length === 0) {
      throw new HttpException('Category is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

      return await this.newsService.getArticlesByCategory(
        category.trim(),
        pageNum,
        pageSizeNum,
      );
    } catch (error) {
      throw new HttpException(
        'Failed to fetch articles by category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get articles by source
   */
  @Get('source/:source')
  async getArticlesBySource(
    @Param('source') source: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ): Promise<NewsFeedResponse> {
    if (!source || source.trim().length === 0) {
      throw new HttpException('Source is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize) || 20));

      return await this.newsService.getArticlesBySource(
        source.trim(),
        pageNum,
        pageSizeNum,
      );
    } catch (error) {
      throw new HttpException(
        'Failed to fetch articles by source',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get available categories
   */
  @Get('categories')
  async getCategories(): Promise<string[]> {
    try {
      const result = await this.newsService.getNewsFeed(1, 1);
      return result.filters.availableCategories;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get available sources
   */
  @Get('sources')
  async getSources(): Promise<string[]> {
    try {
      const result = await this.newsService.getNewsFeed(1, 1);
      return result.filters.availableSources;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete all articles
   */
  @Delete('articles/delete-all')
  async deleteAllArticles(): Promise<{ message: string; timestamp: string }> {
    try {
      await this.newsService.deleteAllArticles();

      return {
        message: 'All articles deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to delete all articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger ingestion of new articles from ScienceDaily
   */
  @Post('ingest/sciencedaily')
  async ingestScienceDailyArticles(
    @Query('limit') limit: string = '20',
  ): Promise<{ message: string; articlesIngested: number; timestamp: string }> {
    try {
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

      const result =
        await this.newsService.ingestScienceDailyArticles(limitNum);

      return {
        message: 'ScienceDaily articles ingested successfully',
        articlesIngested: result.articlesIngested,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to ingest ScienceDaily articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger ingestion of new articles from Science News
   */
  @Post('ingest/sciencenews')
  async ingestScienceNewsArticles(
    @Query('limit') limit: string = '20',
  ): Promise<{ message: string; articlesIngested: number; timestamp: string }> {
    try {
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

      const result = await this.newsService.ingestScienceNewsArticles(limitNum);

      return {
        message: 'Science News articles ingested successfully',
        articlesIngested: result.articlesIngested,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to ingest Science News articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger ingestion of new articles from Science.org
   */
  @Post('ingest/scienceorg')
  async ingestScienceOrgArticles(
    @Query('limit') limit: string = '20',
  ): Promise<{ message: string; articlesIngested: number; timestamp: string }> {
    try {
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

      const result = await this.newsService.ingestScienceOrgArticles(limitNum);

      return {
        message: 'Science.org articles ingested successfully',
        articlesIngested: result.articlesIngested,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to ingest Science.org articles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger ingestion of new articles from all sources (ScienceDaily, Science News, and Science.org)
   */
  @Post('ingest/all')
  async ingestAllNewsArticles(
    @Query('limit') limit: string = '60',
  ): Promise<{ message: string; articlesIngested: number; timestamp: string }> {
    try {
      const limitNum = Math.min(150, Math.max(1, parseInt(limit) || 60));

      const result = await this.newsService.ingestAllNewsArticles(limitNum);

      return {
        message: 'Articles from all sources ingested successfully',
        articlesIngested: result.articlesIngested,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to ingest articles from all sources',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
