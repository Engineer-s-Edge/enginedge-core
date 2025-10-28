import { Injectable } from '@nestjs/common';
import { DataLakeService, FilterCriteria } from '../../datalake';
import { NewsArticle, NewsFilter, NewsMetadata } from '../types';
import { MyLogger } from '../../../services/logger/logger.service';
import * as crypto from 'crypto';
const Parser = require('rss-parser');

@Injectable()
export class NewsInfrastructureService {
  private readonly bucketName = 'news-articles';

  constructor(
    private readonly dataLakeService: DataLakeService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'NewsInfrastructureService initialized',
      NewsInfrastructureService.name,
    );
  }

  /**
   * Load news articles from the data lake with filtering
   */
  async loadArticles(filters: NewsFilter = {}): Promise<NewsArticle[]> {
    try {
      const criteria: FilterCriteria = {
        prefix: 'articles/',
        extensions: ['.jsonl', '.json'],
        maxResults: 100, // Configurable limit
      };

      // Add date-based filtering at the storage level
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

      // Deduplicate articles in case there are any duplicates in storage
      const deduplicatedArticles =
        this.dataLakeService.deduplicateRecords(articles);

      this.logger.info(
        `Loaded ${deduplicatedArticles.length} unique articles from data lake`,
        NewsInfrastructureService.name,
      );
      return deduplicatedArticles;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error loading articles from data lake:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Apply business logic filters to articles
   */
  filterArticles(articles: NewsArticle[], filters: NewsFilter): NewsArticle[] {
    return this.dataLakeService.applyFilters(articles, filters);
  }

  /**
   * Sort articles by published date or other criteria
   */
  sortArticles(
    articles: NewsArticle[],
    field: keyof NewsArticle = 'published_date',
    ascending: boolean = false,
  ): NewsArticle[] {
    if (field === 'published_date') {
      return this.dataLakeService.sortByDate(articles, field, ascending);
    }

    // Generic sorting for other fields
    return articles.sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];

      // Handle undefined values
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return ascending ? -1 : 1;
      if (bValue === undefined) return ascending ? 1 : -1;

      if (aValue < bValue) return ascending ? -1 : 1;
      if (aValue > bValue) return ascending ? 1 : -1;
      return 0;
    });
  }

  /**
   * Find a single article by ID
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
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Search articles by text query
   */
  searchArticles(articles: NewsArticle[], query: string): NewsArticle[] {
    if (!query || query.trim() === '') {
      return articles;
    }

    const searchTerm = query.toLowerCase().trim();

    return articles.filter(
      (article) =>
        article.title.toLowerCase().includes(searchTerm) ||
        article.description.toLowerCase().includes(searchTerm) ||
        article.content.toLowerCase().includes(searchTerm) ||
        article.author.toLowerCase().includes(searchTerm) ||
        article.source.toLowerCase().includes(searchTerm) ||
        article.category.toLowerCase().includes(searchTerm) ||
        article.tags.some((tag) => tag.toLowerCase().includes(searchTerm)),
    );
  }

  /**
   * Extract metadata for filtering UI
   */
  extractFilterMetadata(articles: NewsArticle[]): NewsMetadata {
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

  /**
   * Get articles by category
   */
  async getArticlesByCategory(category: string): Promise<NewsArticle[]> {
    const articles = await this.loadArticles({ category });
    return this.filterArticles(articles, { category });
  }

  /**
   * Get articles by source
   */
  async getArticlesBySource(source: string): Promise<NewsArticle[]> {
    const articles = await this.loadArticles({ source });
    return this.filterArticles(articles, { source });
  }

  /**
   * Get trending articles based on recency and quality
   */
  async getTrendingArticles(
    limit: number = 10,
    category?: string,
  ): Promise<NewsArticle[]> {
    const filters: NewsFilter = {
      category,
      dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
    };

    const articles = await this.loadArticles(filters);
    const filteredArticles = this.filterArticles(articles, filters);
    const sortedArticles = this.sortArticles(
      filteredArticles,
      'published_date',
      false,
    );

    // Apply trending criteria: good metadata and recent
    const trending = sortedArticles
      .filter(
        (article) =>
          article.description &&
          article.description.length > 100 &&
          article.title.length > 20,
      )
      .slice(0, limit);

    return trending;
  }

  /**
   * Bulk operations for managing articles
   */
  async bulkLoadArticlesByIds(ids: string[]): Promise<NewsArticle[]> {
    const articles = await this.loadArticles();
    return articles.filter((article) => ids.includes(article.id));
  }

  /**
   * Get article statistics
   */
  async getArticleStats(): Promise<{
    total: number;
    categoryCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
    recentCount: number;
  }> {
    const articles = await this.loadArticles();
    const recent = articles.filter((article) => {
      const publishedDate = new Date(article.published_date);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return publishedDate > dayAgo;
    });

    const categoryCounts = articles.reduce(
      (acc, article) => {
        acc[article.category] = (acc[article.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sourceCounts = articles.reduce(
      (acc, article) => {
        acc[article.source] = (acc[article.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: articles.length,
      categoryCounts,
      sourceCounts,
      recentCount: recent.length,
    };
  }

  /**
   * Delete all articles from the data lake
   */
  async deleteAllArticles(): Promise<void> {
    try {
      this.logger.info(
        'Starting deletion of all news articles',
        NewsInfrastructureService.name,
      );

      // Delete all objects with 'articles/' prefix from the bucket
      await this.dataLakeService.deleteObjectsWithPrefix(
        this.bucketName,
        'articles/',
      );

      this.logger.info(
        'Successfully deleted all news articles from data lake',
        NewsInfrastructureService.name,
      );
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error deleting all articles:',
        e.stack,
        NewsInfrastructureService.name,
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
      this.logger.info(`Starting ScienceDaily ingestion with limit: ${limit}`);

      const parser = new Parser({
        customFields: {
          item: ['dc:creator', 'content:encoded'],
        },
      });

      // ScienceDaily RSS feeds
      const rssFeeds = [
        {
          name: 'sciencedaily_top_science',
          url: 'https://www.sciencedaily.com/rss/top/science.xml',
          category: 'science',
        },
        {
          name: 'sciencedaily_health_medicine',
          url: 'https://www.sciencedaily.com/rss/health_medicine.xml',
          category: 'health',
        },
        {
          name: 'sciencedaily_technology',
          url: 'https://www.sciencedaily.com/rss/top/technology.xml',
          category: 'technology',
        },
        {
          name: 'sciencedaily_environment',
          url: 'https://www.sciencedaily.com/rss/top/environment.xml',
          category: 'environment',
        },
        {
          name: 'sciencedaily_artificial_intelligence',
          url: 'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml',
          category: 'artificial_intelligence',
        },
      ];

      let allArticles: NewsArticle[] = [];
      const articlesPerFeed = Math.ceil(limit / rssFeeds.length);

      for (const feed of rssFeeds) {
        try {
          this.logger.info(`Fetching articles from ${feed.name}`);
          const feedData = await parser.parseURL(feed.url);

          const articles = feedData.items
            .slice(0, articlesPerFeed)
            .map((item: any) => {
              const article: NewsArticle = {
                id: this.generateArticleId(
                  item.link || item.guid || '',
                  item.title || '',
                ),
                title: item.title || 'Untitled',
                description: this.cleanHtml(
                  item.contentSnippet || item.description || '',
                ),
                content: this.cleanHtml(
                  item['content:encoded'] ||
                    item.content ||
                    item.contentSnippet ||
                    item.description ||
                    '',
                ),
                url: item.link || '',
                published_date: item.pubDate
                  ? new Date(item.pubDate).toISOString()
                  : new Date().toISOString(),
                author: item['dc:creator'] || 'ScienceDaily',
                source: feed.name,
                category: feed.category,
                tags: this.extractTags(
                  item.title || '',
                  item.contentSnippet || '',
                ),
                ingestion_timestamp: new Date().toISOString(),
                source_type: 'rss' as const,
              };
              return article;
            });

          allArticles = allArticles.concat(articles);
          this.logger.info(
            `Fetched ${articles.length} articles from ${feed.name}`,
          );
        } catch (error: unknown) {
          const e = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `Error fetching from ${feed.name}:`,
            e.stack,
            NewsInfrastructureService.name,
          );
          // Continue with other feeds even if one fails
        }
      }

      // Limit total articles
      allArticles = allArticles.slice(0, limit);

      if (allArticles.length === 0) {
        this.logger.warn('No articles were fetched from any ScienceDaily feed');
        return { articlesIngested: 0 };
      }

      this.logger.info(
        `Fetched ${allArticles.length} total articles from RSS feeds`,
      );

      // First, deduplicate articles within the fetched batch (in case of URL overlaps between feeds)
      const deduplicatedFetchedArticles =
        this.dataLakeService.deduplicateRecords(allArticles);
      this.logger.info(
        `After intra-batch deduplication: ${deduplicatedFetchedArticles.length} articles`,
      );

      // Load existing articles to check for duplicates
      this.logger.info(
        'Checking for duplicate articles against existing database...',
      );
      const existingArticles = await this.loadArticles();

      // Filter out duplicate articles using the data lake service
      const newArticles = this.dataLakeService.filterNewRecords(
        deduplicatedFetchedArticles,
        existingArticles,
      );

      if (newArticles.length === 0) {
        this.logger.info(
          'No new articles to ingest - all articles already exist',
        );
        return { articlesIngested: 0 };
      }

      // Store only new articles in the data lake
      await this.storeArticles(newArticles);

      this.logger.info(
        `Successfully ingested ${newArticles.length} new ScienceDaily articles (${allArticles.length - newArticles.length} duplicates filtered out)`,
      );
      return { articlesIngested: newArticles.length };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting ScienceDaily articles:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest articles from Science News RSS feed
   */
  async ingestScienceNewsArticles(
    limit: number = 20,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(`Starting Science News ingestion with limit: ${limit}`);

      const parser = new Parser({
        customFields: {
          item: ['dc:creator', 'content:encoded', 'media:thumbnail'],
        },
      });

      // Science News RSS feed
      const feedUrl = 'https://www.sciencenews.org/feed/';
      const feedName = 'sciencenews';

      let allArticles: NewsArticle[] = [];

      try {
        this.logger.info(`Fetching articles from Science News`);
        const feedData = await parser.parseURL(feedUrl);

        const articles = feedData.items.slice(0, limit).map((item: any) => {
          // Extract category from the item's categories
          let category = 'science'; // default category
          if (item.categories && item.categories.length > 0) {
            const categoryName = item.categories[0].toLowerCase();
            // Map Science News categories to our categories
            if (
              categoryName.includes('health') ||
              categoryName.includes('medicine')
            ) {
              category = 'health';
            } else if (
              categoryName.includes('artificial intelligence') ||
              categoryName.includes('ai')
            ) {
              category = 'artificial_intelligence';
            } else if (
              categoryName.includes('technology') ||
              categoryName.includes('computer')
            ) {
              category = 'technology';
            } else if (
              categoryName.includes('environment') ||
              categoryName.includes('climate') ||
              categoryName.includes('earth')
            ) {
              category = 'environment';
            } else if (
              categoryName.includes('astronomy') ||
              categoryName.includes('space')
            ) {
              category = 'astronomy';
            } else if (
              categoryName.includes('physics') ||
              categoryName.includes('quantum')
            ) {
              category = 'physics';
            } else if (
              categoryName.includes('animals') ||
              categoryName.includes('biology') ||
              categoryName.includes('life')
            ) {
              category = 'biology';
            }
          }

          // Extract image URL from media:thumbnail or enclosure
          let imageUrl: string | undefined;
          if (
            item.enclosure &&
            item.enclosure.url &&
            item.enclosure.type &&
            item.enclosure.type.startsWith('image/')
          ) {
            imageUrl = item.enclosure.url;
          }

          const article: NewsArticle = {
            id: this.generateArticleId(
              item.link || item.guid || '',
              item.title || '',
            ),
            title: item.title || 'Untitled',
            description: this.cleanHtml(
              item.contentSnippet || item.description || '',
            ),
            content: this.cleanHtml(
              item['content:encoded'] ||
                item.content ||
                item.contentSnippet ||
                item.description ||
                '',
            ),
            url: item.link || '',
            published_date: item.pubDate
              ? new Date(item.pubDate).toISOString()
              : new Date().toISOString(),
            author: item['dc:creator'] || item.creator || 'Science News',
            source: feedName,
            category: category,
            tags: this.extractTags(
              item.title || '',
              item.contentSnippet || '',
              item.categories || [],
            ),
            ingestion_timestamp: new Date().toISOString(),
            source_type: 'rss' as const,
            image_url: imageUrl,
          };
          return article;
        });

        allArticles = allArticles.concat(articles);
        this.logger.info(
          `Fetched ${articles.length} articles from Science News`,
        );
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Error fetching from Science News:`,
          e.stack,
          NewsInfrastructureService.name,
        );
        throw e;
      }

      if (allArticles.length === 0) {
        this.logger.warn('No articles were fetched from Science News feed');
        return { articlesIngested: 0 };
      }

      this.logger.info(
        `Fetched ${allArticles.length} total articles from Science News RSS feed`,
      );

      // First, deduplicate articles within the fetched batch
      const deduplicatedFetchedArticles =
        this.dataLakeService.deduplicateRecords(allArticles);
      this.logger.info(
        `After intra-batch deduplication: ${deduplicatedFetchedArticles.length} articles`,
      );

      // Load existing articles to check for duplicates
      this.logger.info(
        'Checking for duplicate articles against existing database...',
      );
      const existingArticles = await this.loadArticles();

      // Filter out duplicate articles using the data lake service
      const newArticles = this.dataLakeService.filterNewRecords(
        deduplicatedFetchedArticles,
        existingArticles,
      );

      if (newArticles.length === 0) {
        this.logger.info(
          'No new articles to ingest - all articles already exist',
        );
        return { articlesIngested: 0 };
      }

      // Store only new articles in the data lake
      await this.storeArticles(newArticles);

      this.logger.info(
        `Successfully ingested ${newArticles.length} new Science News articles (${allArticles.length - newArticles.length} duplicates filtered out)`,
      );
      return { articlesIngested: newArticles.length };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting Science News articles:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest articles from Science.org RSS feed
   */
  async ingestScienceOrgArticles(
    limit: number = 20,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(`Starting Science.org ingestion with limit: ${limit}`);

      const parser = new Parser({
        customFields: {
          item: ['dc:creator', 'content:encoded', 'dc:date', 'prism:doi'],
        },
      });

      // Science.org RSS feed
      const feedUrl = 'https://www.science.org/rss/news_current.xml';
      const feedName = 'science_org';

      let allArticles: NewsArticle[] = [];

      try {
        this.logger.info(`Fetching articles from Science.org`);
        const feedData = await parser.parseURL(feedUrl);

        const articles = feedData.items.slice(0, limit).map((item: any) => {
          // Extract category from the item's categories or description
          let category = 'science'; // default category
          const description = item.description || '';
          const title = item.title || '';

          // Map Science.org content to our categories based on keywords
          const content = (title + ' ' + description).toLowerCase();
          if (
            content.includes('health') ||
            content.includes('medicine') ||
            content.includes('medical')
          ) {
            category = 'health';
          } else if (
            content.includes('artificial intelligence') ||
            content.includes('ai') ||
            content.includes('machine learning')
          ) {
            category = 'artificial_intelligence';
          } else if (
            content.includes('technology') ||
            content.includes('computer') ||
            content.includes('engineering')
          ) {
            category = 'technology';
          } else if (
            content.includes('environment') ||
            content.includes('climate') ||
            content.includes('earth') ||
            content.includes('ecology')
          ) {
            category = 'environment';
          } else if (
            content.includes('astronomy') ||
            content.includes('space') ||
            content.includes('planet') ||
            content.includes('galaxy')
          ) {
            category = 'astronomy';
          } else if (
            content.includes('physics') ||
            content.includes('quantum') ||
            content.includes('particle')
          ) {
            category = 'physics';
          } else if (
            content.includes('biology') ||
            content.includes('genetics') ||
            content.includes('evolution') ||
            content.includes('animal') ||
            content.includes('plant')
          ) {
            category = 'biology';
          } else if (
            content.includes('chemistry') ||
            content.includes('chemical') ||
            content.includes('molecular')
          ) {
            category = 'chemistry';
          }

          // Extract image URL from enclosure
          let imageUrl: string | undefined;
          if (
            item.enclosure &&
            item.enclosure.url &&
            item.enclosure.type &&
            item.enclosure.type.startsWith('image/')
          ) {
            imageUrl = item.enclosure.url;
          }

          const article: NewsArticle = {
            id: this.generateArticleId(
              item.link || item.guid || '',
              item.title || '',
            ),
            title: item.title || 'Untitled',
            description: this.cleanHtml(item.description || ''),
            content: this.cleanHtml(
              item['content:encoded'] || item.content || item.description || '',
            ),
            url: item.link || '',
            published_date:
              item['dc:date'] || item.pubDate
                ? new Date(item['dc:date'] || item.pubDate).toISOString()
                : new Date().toISOString(),
            author: item['dc:creator'] || item.creator || 'Science Magazine',
            source: feedName,
            category: category,
            tags: this.extractTags(item.title || '', item.description || ''),
            ingestion_timestamp: new Date().toISOString(),
            source_type: 'rss' as const,
            image_url: imageUrl,
          };
          return article;
        });

        allArticles = allArticles.concat(articles);
        this.logger.info(
          `Fetched ${articles.length} articles from Science.org`,
        );
      } catch (error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Error fetching from Science.org:`,
          e.stack,
          NewsInfrastructureService.name,
        );
        throw e;
      }

      if (allArticles.length === 0) {
        this.logger.warn('No articles were fetched from Science.org feed');
        return { articlesIngested: 0 };
      }

      this.logger.info(
        `Fetched ${allArticles.length} total articles from Science.org RSS feed`,
      );

      // First, deduplicate articles within the fetched batch
      const deduplicatedFetchedArticles =
        this.dataLakeService.deduplicateRecords(allArticles);
      this.logger.info(
        `After intra-batch deduplication: ${deduplicatedFetchedArticles.length} articles`,
      );

      // Load existing articles to check for duplicates
      this.logger.info(
        'Checking for duplicate articles against existing database...',
      );
      const existingArticles = await this.loadArticles();

      // Filter out duplicate articles using the data lake service
      const newArticles = this.dataLakeService.filterNewRecords(
        deduplicatedFetchedArticles,
        existingArticles,
      );

      if (newArticles.length === 0) {
        this.logger.info(
          'No new articles to ingest - all articles already exist',
        );
        return { articlesIngested: 0 };
      }

      // Store only new articles in the data lake
      await this.storeArticles(newArticles);

      this.logger.info(
        `Successfully ingested ${newArticles.length} new Science.org articles (${allArticles.length - newArticles.length} duplicates filtered out)`,
      );
      return { articlesIngested: newArticles.length };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting Science.org articles:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Ingest articles from all RSS feeds (ScienceDaily, Science News, and Science.org)
   */
  async ingestAllNewsArticles(
    limit: number = 60,
  ): Promise<{ articlesIngested: number }> {
    try {
      this.logger.info(
        `Starting comprehensive news ingestion with total limit: ${limit}`,
      );

      // Split limit between the three sources
      const limitPerSource = Math.ceil(limit / 3);

      const [scienceDailyResult, scienceNewsResult, scienceOrgResult] =
        await Promise.all([
          this.ingestScienceDailyArticles(limitPerSource),
          this.ingestScienceNewsArticles(limitPerSource),
          this.ingestScienceOrgArticles(limitPerSource),
        ]);

      const totalArticlesIngested =
        scienceDailyResult.articlesIngested +
        scienceNewsResult.articlesIngested +
        scienceOrgResult.articlesIngested;

      this.logger.info(
        `Successfully ingested ${totalArticlesIngested} total articles (ScienceDaily: ${scienceDailyResult.articlesIngested}, Science News: ${scienceNewsResult.articlesIngested}, Science.org: ${scienceOrgResult.articlesIngested})`,
      );

      return { articlesIngested: totalArticlesIngested };
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error ingesting news articles from all sources:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Store articles in the data lake
   */
  private async storeArticles(articles: NewsArticle[]): Promise<void> {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const timestamp =
        today.toISOString().replace(/[:.]/g, '-').split('T')[0] +
        '_' +
        today.toTimeString().split(' ')[0].replace(/:/g, '');

      // Determine the source type from the articles
      const sources = [...new Set(articles.map((article) => article.source))];
      const sourcePrefix = sources.length === 1 ? sources[0] : 'mixed_sources';

      const fileKey = `articles/${year}/${month}/${day}/${sourcePrefix}_${timestamp}.jsonl`;

      // Convert to JSONL format
      const jsonlContent = articles
        .map((article) => JSON.stringify(article))
        .join('\n');

      // Store in the data lake
      await this.dataLakeService.storeRecord(
        this.bucketName,
        fileKey,
        jsonlContent,
        'application/jsonl',
      );

      this.logger.info(`Stored ${articles.length} articles to ${fileKey}`);
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Error storing articles:',
        e.stack,
        NewsInfrastructureService.name,
      );
      throw e;
    }
  }

  /**
   * Generate a unique article ID based on URL and title (deterministic)
   */
  private generateArticleId(url: string, title?: string): string {
    // Normalize URL to handle slight variations (remove trailing slash, convert to lowercase, etc.)
    const normalizedUrl = url
      .toLowerCase()
      .replace(/\/$/, '') // Remove trailing slash
      .replace(/^https?:\/\//, '') // Remove protocol
      .replace(/\/+/g, '/') // Normalize multiple slashes
      .trim();

    // Normalize title
    const normalizedTitle = (title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();

    // Use normalized URL and title for deterministic ID generation
    const content = (normalizedUrl + normalizedTitle).trim();
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Clean HTML content and extract plain text
   */
  private cleanHtml(html: string): string {
    if (!html) return '';

    // Remove HTML tags
    const cleanText = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return cleanText;
  }

  /**
   * Extract relevant tags from title and content
   */
  private extractTags(
    title: string,
    content: string,
    categories: string[] = [],
  ): string[] {
    const text = (title + ' ' + content).toLowerCase();
    const commonTags = [
      'artificial intelligence',
      'machine learning',
      'quantum',
      'climate',
      'health',
      'medicine',
      'space',
      'technology',
      'research',
      'science',
      'environment',
      'biology',
      'physics',
      'chemistry',
      'engineering',
      'innovation',
    ];

    // Add categories as tags if they exist
    const categoryTags = categories
      .map((cat) =>
        cat
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim(),
      )
      .filter(Boolean);

    const foundTags = commonTags.filter((tag) => text.includes(tag));

    // Combine found tags with category tags, removing duplicates
    return [...new Set([...foundTags, ...categoryTags])];
  }
}
