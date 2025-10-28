import { KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';

/**
 * News Integration Types
 * 
 * Type definitions for integrating news articles from the datalake
 * into the Genius Agent's research workflow.
 */

/**
 * News article from datalake
 */
export interface NewsArticle {
  /** Article ID from datalake */
  articleId: string;
  
  /** Article title */
  title: string;
  
  /** Article content/summary */
  content: string;
  
  /** Publication date */
  publishedAt: Date;
  
  /** Source/publisher */
  source: string;
  
  /** Article URL */
  url: string;
  
  /** Article category/topic */
  category?: string;
  
  /** Keywords/tags */
  keywords?: string[];
  
  /** Author */
  author?: string;
  
  /** Language */
  language?: string;
  
  /** Sentiment score (-1 to 1) */
  sentiment?: number;
}

/**
 * News query parameters
 */
export interface NewsQueryParams {
  /** Search by topic */
  topic?: string;
  
  /** Search by category */
  category?: string;
  
  /** Search by keywords */
  keywords?: string[];
  
  /** Date range start */
  dateFrom?: Date;
  
  /** Date range end */
  dateTo?: Date;
  
  /** Source filter */
  sources?: string[];
  
  /** Language filter */
  language?: string;
  
  /** Maximum results */
  limit?: number;
  
  /** Sort by (date, relevance) */
  sortBy?: 'date' | 'relevance';
  
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * News query result
 */
export interface NewsQueryResult {
  /** Matching articles */
  articles: NewsArticle[];
  
  /** Total count (may be more than returned) */
  totalCount: number;
  
  /** Query timestamp */
  queriedAt: Date;
  
  /** Query duration (ms) */
  queryDurationMs: number;
}

/**
 * News-based knowledge node creation request
 */
export interface CreateNewsNodeRequest {
  /** Source article */
  article: NewsArticle;
  
  /** Node label */
  label: string;
  
  /** Node type */
  type: string;
  
  /** Category */
  category: string;
  
  /** ICS layer */
  layer: number;
  
  /** Additional properties */
  properties?: Record<string, unknown>;
  
  /** Link to existing nodes (optional) */
  relatedNodeIds?: KnowledgeNodeIdType[];
}

/**
 * News integration statistics
 */
export interface NewsIntegrationStats {
  /** Total news articles queried */
  totalArticlesQueried: number;
  
  /** Articles integrated into KG */
  articlesIntegrated: number;
  
  /** News-based nodes created */
  newsNodesCreated: number;
  
  /** Articles by category */
  articlesByCategory: Record<string, number>;
  
  /** Integration rate (articles integrated / queried) */
  integrationRate: number;
  
  /** Average relevance score */
  averageRelevance: number;
  
  /** Last query time */
  lastQueryTime?: Date;
}

/**
 * News relevance scoring
 */
export interface NewsRelevanceScore {
  /** Article ID */
  articleId: string;
  
  /** Relevance to topic (0-1) */
  relevance: number;
  
  /** Recency score (0-1) */
  recency: number;
  
  /** Source credibility (0-1) */
  credibility: number;
  
  /** Overall score (weighted) */
  overallScore: number;
  
  /** Reason for score */
  reasoning?: string;
}
