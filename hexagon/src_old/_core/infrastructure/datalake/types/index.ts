export interface DataLakeConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  forcePathStyle?: boolean;
}

export interface StorageObject {
  key: string;
  lastModified?: Date;
  size?: number;
  etag?: string;
}

export interface FilterCriteria {
  prefix?: string;
  dateFrom?: string;
  dateTo?: string;
  extensions?: string[];
  maxResults?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface DataLakeMetadata {
  availableCategories: string[];
  availableSources: string[];
  availableTags: string[];
}
