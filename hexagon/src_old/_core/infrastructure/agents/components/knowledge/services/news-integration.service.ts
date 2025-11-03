import { Injectable, Inject } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { KnowledgeGraphService } from './knowledge-graph.service';
import {
  NewsArticle,
  NewsQueryParams,
  NewsQueryResult,
  CreateNewsNodeRequest,
  NewsIntegrationStats,
  NewsRelevanceScore,
} from '../types/news-integration.types';
import { KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';
import { ICSLayer } from '../entities/knowledge-node.entity';
import { EdgeType } from '../entities/knowledge-edge.entity';

/**
 * News Integration Service
 * 
 * Integrates news articles from the datalake into the knowledge graph.
 * Provides:
 * - News article querying by topic/category/keywords
 * - Relevance scoring for articles
 * - News-based node creation
 * - Article-to-KG node linking
 * - Integration statistics
 * 
 * Note: This is a placeholder implementation. In production, this would
 * connect to the actual MinIO datalake and query Trino/Spark for news data.
 */
@Injectable()
export class NewsIntegrationService {
  private stats: NewsIntegrationStats = {
    totalArticlesQueried: 0,
    articlesIntegrated: 0,
    newsNodesCreated: 0,
    articlesByCategory: {},
    integrationRate: 0,
    averageRelevance: 0,
  };

  constructor(
    @Inject(KnowledgeGraphService)
    private readonly knowledgeGraph: KnowledgeGraphService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info('NewsIntegrationService initialized', NewsIntegrationService.name);
  }

  // ========================================
  // News Article Querying
  // ========================================

  /**
   * Query news articles from datalake
   * 
   * PLACEHOLDER: In production, this would query MinIO/Trino/Spark
   * for actual news articles stored in the datalake.
   */
  async queryNewsArticles(params: NewsQueryParams): Promise<NewsQueryResult> {
    const startTime = Date.now();

    this.logger.info(
      `Querying news articles: topic="${params.topic}", category="${params.category}", limit=${params.limit || 10}`,
      NewsIntegrationService.name,
    );

    try {
      // PLACEHOLDER: This would be replaced with actual datalake queries
      // Example: Query Trino for articles in MinIO buckets
      // SELECT * FROM news_articles WHERE category = ? AND date BETWEEN ? AND ?
      
      const articles = await this.mockQueryDatalake(params);

      this.stats.totalArticlesQueried += articles.length;
      this.stats.lastQueryTime = new Date();

      // Update category stats
      for (const article of articles) {
        if (article.category) {
          this.stats.articlesByCategory[article.category] =
            (this.stats.articlesByCategory[article.category] || 0) + 1;
        }
      }

      const result: NewsQueryResult = {
        articles,
        totalCount: articles.length,
        queriedAt: new Date(),
        queryDurationMs: Date.now() - startTime,
      };

      this.logger.info(
        `Found ${articles.length} articles in ${result.queryDurationMs}ms`,
        NewsIntegrationService.name,
      );

      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `News query failed: ${info.message}`,
        NewsIntegrationService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Get relevant news articles for a topic
   * Includes relevance scoring
   */
  async getRelevantArticles(
    topic: string,
    limit = 10,
  ): Promise<Array<{ article: NewsArticle; relevance: NewsRelevanceScore }>> {
    const queryResult = await this.queryNewsArticles({
      topic,
      limit: limit * 2, // Query more, then filter
      sortBy: 'relevance',
      sortOrder: 'desc',
    });

    // Score each article for relevance
    const scoredArticles = await Promise.all(
      queryResult.articles.map(async (article) => ({
        article,
        relevance: await this.scoreArticleRelevance(article, topic),
      })),
    );

    // Sort by overall score and take top N
    scoredArticles.sort((a, b) => b.relevance.overallScore - a.relevance.overallScore);

    return scoredArticles.slice(0, limit);
  }

  // ========================================
  // Knowledge Graph Integration
  // ========================================

  /**
   * Create a knowledge node from a news article
   */
  async createNewsNode(request: CreateNewsNodeRequest): Promise<KnowledgeNodeIdType> {
    this.logger.info(
      `Creating news node: "${request.label}" from article "${request.article.title}"`,
      NewsIntegrationService.name,
    );

    try {
      // Create the node with article metadata
      const node = await this.knowledgeGraph.createNode({
        type: request.type,
        label: request.label,
        layer: request.layer as ICSLayer,
        properties: {
          ...request.properties,
          category: request.category,
          newsArticleId: request.article.articleId,
          newsSource: request.article.source,
          newsUrl: request.article.url,
          newsPublishedAt: request.article.publishedAt,
          newsTitle: request.article.title,
        },
      });

      const nodeId = node._id;

      // Add article to node's newsArticleIds array
      // Note: This would require updating the node in the database
      // For now, we'll just note that the article is linked via properties

      // Create relationships to related nodes
      if (request.relatedNodeIds && request.relatedNodeIds.length > 0) {
        await Promise.all(
          request.relatedNodeIds.map((relatedId) =>
            this.knowledgeGraph.createEdge({
              sourceId: nodeId,
              targetId: relatedId,
              type: EdgeType.RELATES_TO,
              confidence: 0.7,
              rationale: `Linked via news article: ${request.article.title}`,
            }),
          ),
        );
      }

      this.stats.newsNodesCreated++;
      this.stats.articlesIntegrated++;
      this.updateIntegrationRate();

      this.logger.info(`News node created: ${nodeId}`, NewsIntegrationService.name);

      return nodeId;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create news node: ${info.message}`,
        NewsIntegrationService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Link an existing node to a news article
   */
  async linkNodeToArticle(nodeId: KnowledgeNodeIdType, article: NewsArticle): Promise<void> {
    this.logger.info(
      `Linking node ${nodeId} to article "${article.title}"`,
      NewsIntegrationService.name,
    );

    try {
      const node = await this.knowledgeGraph.getNode(nodeId);
      if (!node) {
        throw new Error(`Node ${nodeId} not found`);
      }

      // Add article ID to node's newsArticleIds
      if (!node.newsArticleIds) {
        node.newsArticleIds = [];
      }
      
      if (!node.newsArticleIds.includes(article.articleId)) {
        node.newsArticleIds.push(article.articleId);
      }

      // Add research data with article info
      await this.knowledgeGraph.addResearchData({
        nodeId,
        summary: article.content,
        keyPoints: article.keywords || [],
        sources: [
          {
            url: article.url,
            title: article.title,
            retrievedAt: new Date(),
            sourceType: 'web',
          },
        ],
        confidence: 0.75,
      });

      this.stats.articlesIntegrated++;
      this.updateIntegrationRate();

      this.logger.info(`Node ${nodeId} linked to article`, NewsIntegrationService.name);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to link node to article: ${info.message}`,
        NewsIntegrationService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Batch link multiple articles to a node
   */
  async batchLinkArticles(
    nodeId: KnowledgeNodeIdType,
    articles: NewsArticle[],
  ): Promise<void> {
    this.logger.info(
      `Batch linking ${articles.length} articles to node ${nodeId}`,
      NewsIntegrationService.name,
    );

    for (const article of articles) {
      try {
        await this.linkNodeToArticle(nodeId, article);
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.warn(
          `Failed to link article "${article.title}": ${info.message}`,
          NewsIntegrationService.name,
        );
      }
    }
  }

  // ========================================
  // Relevance Scoring
  // ========================================

  /**
   * Score an article's relevance to a topic
   */
  async scoreArticleRelevance(article: NewsArticle, topic: string): Promise<NewsRelevanceScore> {
    // Relevance: How well does the article match the topic?
    const relevance = this.calculateTopicRelevance(article, topic);

    // Recency: How recent is the article?
    const recency = this.calculateRecencyScore(article.publishedAt);

    // Credibility: How credible is the source?
    const credibility = this.calculateSourceCredibility(article.source);

    // Weighted overall score
    const overallScore = relevance * 0.5 + recency * 0.3 + credibility * 0.2;

    return {
      articleId: article.articleId,
      relevance,
      recency,
      credibility,
      overallScore,
      reasoning: `Topic match: ${(relevance * 100).toFixed(0)}%, Recency: ${(recency * 100).toFixed(0)}%, Credibility: ${(credibility * 100).toFixed(0)}%`,
    };
  }

  /**
   * Calculate topic relevance
   */
  private calculateTopicRelevance(article: NewsArticle, topic: string): number {
    const topicLower = topic.toLowerCase();
    let score = 0;

    // Check title
    if (article.title.toLowerCase().includes(topicLower)) {
      score += 0.5;
    }

    // Check content
    if (article.content.toLowerCase().includes(topicLower)) {
      score += 0.3;
    }

    // Check keywords
    if (article.keywords) {
      for (const keyword of article.keywords) {
        if (keyword.toLowerCase().includes(topicLower)) {
          score += 0.1;
          break;
        }
      }
    }

    // Check category
    if (article.category?.toLowerCase().includes(topicLower)) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate recency score (newer = higher)
   */
  private calculateRecencyScore(publishedAt: Date): number {
    const now = Date.now();
    const articleTime = publishedAt.getTime();
    const ageMs = now - articleTime;

    // Score based on age
    // 0-7 days: 1.0
    // 7-30 days: 0.7
    // 30-90 days: 0.5
    // 90-365 days: 0.3
    // >365 days: 0.1

    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 7) return 1.0;
    if (ageDays <= 30) return 0.7;
    if (ageDays <= 90) return 0.5;
    if (ageDays <= 365) return 0.3;
    return 0.1;
  }

  /**
   * Calculate source credibility
   */
  private calculateSourceCredibility(source: string): number {
    const sourceLower = source.toLowerCase();

    // High credibility sources
    const highCredibility = ['reuters', 'ap', 'bbc', 'npr', 'pbs', 'nature', 'science'];
    for (const trusted of highCredibility) {
      if (sourceLower.includes(trusted)) return 0.9;
    }

    // Medium credibility
    const mediumCredibility = ['cnn', 'nyt', 'washington post', 'guardian', 'times'];
    for (const medium of mediumCredibility) {
      if (sourceLower.includes(medium)) return 0.7;
    }

    // Default credibility
    return 0.5;
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get integration statistics
   */
  getStatistics(): NewsIntegrationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalArticlesQueried: 0,
      articlesIntegrated: 0,
      newsNodesCreated: 0,
      articlesByCategory: {},
      integrationRate: 0,
      averageRelevance: 0,
    };
    this.logger.info('News integration statistics reset', NewsIntegrationService.name);
  }

  /**
   * Update integration rate
   */
  private updateIntegrationRate(): void {
    if (this.stats.totalArticlesQueried > 0) {
      this.stats.integrationRate = this.stats.articlesIntegrated / this.stats.totalArticlesQueried;
    }
  }

  // ========================================
  // Mock Datalake (Placeholder)
  // ========================================

  /**
   * Mock datalake query for testing
   * 
   * In production, this would be replaced with actual Trino/Spark queries:
   * - Query MinIO buckets for news data
   * - Use Trino SQL to filter and aggregate
   * - Return structured NewsArticle objects
   */
  private async mockQueryDatalake(_params: NewsQueryParams): Promise<NewsArticle[]> {
    // This is a placeholder that returns empty results
    // In production, implement actual datalake integration:
    // 
    // Example Trino query:
    // SELECT article_id, title, content, published_at, source, url, category, keywords
    // FROM news.articles
    // WHERE category = '${params.category}'
    //   AND published_at BETWEEN '${params.dateFrom}' AND '${params.dateTo}'
    //   AND (title LIKE '%${params.topic}%' OR content LIKE '%${params.topic}%')
    // ORDER BY published_at DESC
    // LIMIT ${params.limit}

    this.logger.warn(
      'Using mock datalake - implement actual integration for production',
      NewsIntegrationService.name,
    );

    // Return empty array for now
    return [];
  }
}
