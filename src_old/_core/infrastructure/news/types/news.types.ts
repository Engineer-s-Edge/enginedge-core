export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  url: string;
  published_date: string;
  author: string;
  source: string;
  category: string;
  tags: string[];
  ingestion_timestamp: string;
  source_type: 'rss' | 'api';
  image_url?: string;
}

export interface NewsFilter {
  category?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  tags?: string[];
}

export interface NewsFeedResponse {
  articles: NewsArticle[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filters: {
    availableCategories: string[];
    availableSources: string[];
    availableTags: string[];
  };
}

export interface NewsMetadata {
  availableCategories: string[];
  availableSources: string[];
  availableTags: string[];
}
