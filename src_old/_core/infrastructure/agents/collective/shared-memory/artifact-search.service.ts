import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveArtifact, CollectiveArtifactDocument } from '../entities/collective-artifact.entity';

/**
 * ArtifactSearchService
 * 
 * Full-text search and filtering across collective artifacts.
 * 
 * Features:
 * - Full-text search in content and metadata
 * - Filter by type, tags, creator, date range
 * - Sort by relevance, date, size
 * - Search within specific collective or across all
 * - Fuzzy matching support
 * 
 * Use Cases:
 * - PM searches for "authentication" across all artifacts
 * - Agent looks for code snippets created by specific agent
 * - Find all documents tagged with "urgent"
 * - Search for recent artifacts (last 24 hours)
 */
@Injectable()
export class ArtifactSearchService {
  private readonly logger = new Logger(ArtifactSearchService.name);

  // Search index (in production, use Elasticsearch or similar)
  private readonly searchIndex = new Map<string, SearchIndexEntry>();

  constructor(
    @InjectModel(CollectiveArtifact.name) private artifactModel: Model<CollectiveArtifactDocument>,
  ) {
    // Initialize search index on startup
    this.rebuildSearchIndex();
  }

  /**
   * Full-text search across artifacts.
   */
  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    this.logger.log(`Searching for: "${query}" with options: ${JSON.stringify(options)}`);

    // Build MongoDB query
    const mongoQuery: any = {};

    // Collective filter
    if (options.collectiveId) {
      mongoQuery.collectiveId = options.collectiveId;
    }

    // Type filter
    if (options.type) {
      mongoQuery.type = options.type;
    }

    // Creator filter
    if (options.createdBy) {
      mongoQuery.createdBy = options.createdBy;
    }

    // Date range filter
    if (options.dateFrom || options.dateTo) {
      mongoQuery.createdAt = {};
      if (options.dateFrom) {
        mongoQuery.createdAt.$gte = options.dateFrom;
      }
      if (options.dateTo) {
        mongoQuery.createdAt.$lte = options.dateTo;
      }
    }

    // Full-text search (MongoDB text search or regex)
    if (query && query.trim()) {
      const searchRegex = new RegExp(query, 'i');
      mongoQuery.$or = [
        { name: searchRegex },
        { content: searchRegex },
        { description: searchRegex },
      ];
    }

    // Execute query
    let artifacts = await this.artifactModel.find(mongoQuery).exec();

    // Calculate relevance scores
    const results: SearchResult[] = artifacts.map(artifact => {
      const score = this.calculateRelevanceScore(artifact, query, options);
      return {
        artifact,
        score,
        highlights: this.generateHighlights(artifact, query),
      };
    });

    // Sort by relevance (or other criteria)
    results.sort((a, b) => {
      if (options.sortBy === 'date') {
        return b.artifact.createdAt.getTime() - a.artifact.createdAt.getTime();
      }
      if (options.sortBy === 'size') {
        return b.artifact.content.length - a.artifact.content.length;
      }
      // Default: relevance
      return b.score - a.score;
    });

    // Pagination
    const start = options.skip || 0;
    const end = start + (options.limit || 20);
    const paginatedResults = results.slice(start, end);

    this.logger.log(`Found ${results.length} results, returning ${paginatedResults.length}`);

    return paginatedResults;
  }

  /**
   * Search for artifacts by tags.
   */
  async searchByTags(
    tags: string[],
    options: Omit<SearchOptions, 'tags'> = {},
  ): Promise<SearchResult[]> {
    const mongoQuery: any = {
      tags: { $in: tags },
    };

    if (options.collectiveId) {
      mongoQuery.collectiveId = options.collectiveId;
    }

    const artifacts = await this.artifactModel.find(mongoQuery).exec();

    return artifacts.map(artifact => ({
      artifact,
      score: this.calculateTagRelevance(artifact, tags),
      highlights: [],
    }));
  }

  /**
   * Find similar artifacts (based on content similarity).
   */
  async findSimilar(
    artifactId: string | Types.ObjectId,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    const artifact = await this.artifactModel.findById(artifactId);
    if (!artifact) {
      return [];
    }

    // Extract keywords from artifact content
    const keywords = this.extractKeywords(artifact.content);

    // Search for artifacts with similar keywords
    const results = await this.search(keywords.join(' '), {
      collectiveId: artifact.collectiveId,
      limit: limit + 1, // +1 to exclude self
    });

    // Filter out the original artifact
    return results.filter(r => (r.artifact._id as Types.ObjectId).toString() !== artifactId.toString());
  }

  /**
   * Get recently created artifacts.
   */
  async getRecent(
    collectiveId: string | Types.ObjectId,
    limit: number = 10,
  ): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel
      .find({ collectiveId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Get recently updated artifacts.
   */
  async getRecentlyUpdated(
    collectiveId: string | Types.ObjectId,
    limit: number = 10,
  ): Promise<CollectiveArtifactDocument[]> {
    return this.artifactModel
      .find({ collectiveId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Get most accessed artifacts (based on access count).
   */
  async getMostAccessed(
    collectiveId: string | Types.ObjectId,
    limit: number = 10,
  ): Promise<CollectiveArtifactDocument[]> {
    // In a real implementation, track access count in metadata
    return this.artifactModel
      .find({ collectiveId })
      .sort({ createdAt: -1 }) // Fallback sort
      .limit(limit)
      .exec();
  }

  /**
   * Get search suggestions (autocomplete).
   */
  async getSuggestions(
    prefix: string,
    collectiveId?: string | Types.ObjectId,
    limit: number = 10,
  ): Promise<string[]> {
    const query: any = {
      name: new RegExp(`^${prefix}`, 'i'),
    };

    if (collectiveId) {
      query.collectiveId = collectiveId;
    }

    const artifacts = await this.artifactModel
      .find(query)
      .limit(limit)
      .exec();

    return artifacts.map(a => a.name);
  }

  /**
   * Get search statistics.
   */
  async getSearchStats(collectiveId: string | Types.ObjectId): Promise<{
    totalArtifacts: number;
    byType: Record<string, number>;
    avgSize: number;
    totalSize: number;
    topTags: Array<{ tag: string; count: number }>;
    topCreators: Array<{ creator: string; count: number }>;
  }> {
    const artifacts = await this.artifactModel.find({ collectiveId }).exec();

    const stats = {
      totalArtifacts: artifacts.length,
      byType: {} as Record<string, number>,
      avgSize: 0,
      totalSize: 0,
      topTags: [] as Array<{ tag: string; count: number }>,
      topCreators: [] as Array<{ creator: string; count: number }>,
    };

    // Count by type
    for (const artifact of artifacts) {
      stats.byType[artifact.type] = (stats.byType[artifact.type] || 0) + 1;
      stats.totalSize += artifact.content.length;
    }

    stats.avgSize = artifacts.length > 0 ? stats.totalSize / artifacts.length : 0;

    // Count tags
    const tagCounts = new Map<string, number>();
    for (const artifact of artifacts) {
      for (const tag of artifact.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    stats.topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Count creators
    const creatorCounts = new Map<string, number>();
    for (const artifact of artifacts) {
      const creator = artifact.createdBy || 'unknown';
      creatorCounts.set(creator, (creatorCounts.get(creator) || 0) + 1);
    }
    stats.topCreators = Array.from(creatorCounts.entries())
      .map(([creator, count]) => ({ creator, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Calculate relevance score for search result.
   */
  private calculateRelevanceScore(
    artifact: CollectiveArtifactDocument,
    query: string,
    options: SearchOptions,
  ): number {
    if (!query || !query.trim()) return 1;

    const queryLower = query.toLowerCase();
    let score = 0;

    // Name match (highest weight)
    if (artifact.name.toLowerCase().includes(queryLower)) {
      score += 10;
      if (artifact.name.toLowerCase() === queryLower) {
        score += 10; // Exact match bonus
      }
    }

    // Content match (medium weight)
    const contentLower = artifact.content.toLowerCase();
    const occurrences = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
    score += occurrences * 2;

    // Description match (low weight)
    if (artifact.description?.toLowerCase().includes(queryLower)) {
      score += 5;
    }

    // Tag match (medium weight)
    if (options.tags) {
      const matchingTags = artifact.tags?.filter(t => options.tags?.includes(t)).length || 0;
      score += matchingTags * 3;
    }

    // Recency bonus (newer artifacts score higher)
    const daysSinceCreation = 
      (Date.now() - artifact.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 7) {
      score += (7 - daysSinceCreation) * 0.5;
    }

    return score;
  }

  /**
   * Calculate tag relevance score.
   */
  private calculateTagRelevance(
    artifact: CollectiveArtifactDocument,
    searchTags: string[],
  ): number {
    const artifactTags = artifact.tags || [];
    const matchingTags = artifactTags.filter(t => searchTags.includes(t));
    return matchingTags.length;
  }

  /**
   * Generate highlights (snippets with matching text).
   */
  private generateHighlights(
    artifact: CollectiveArtifactDocument,
    query: string,
  ): string[] {
    if (!query || !query.trim()) return [];

    const highlights: string[] = [];
    const queryLower = query.toLowerCase();
    const content = artifact.content;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(queryLower)) {
        // Add context (line before + matching line + line after)
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length - 1, i + 1);
        const context = lines.slice(contextStart, contextEnd + 1).join('\n');
        highlights.push(context);

        if (highlights.length >= 3) break; // Limit highlights
      }
    }

    return highlights;
  }

  /**
   * Extract keywords from content.
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction (in production, use NLP library)
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3); // Filter short words

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Return top 10 most frequent words
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Rebuild search index (for initialization or after bulk updates).
   */
  private async rebuildSearchIndex(): Promise<void> {
    this.logger.log('Rebuilding search index...');

    const artifacts = await this.artifactModel.find().exec();

    for (const artifact of artifacts) {
      this.indexArtifact(artifact);
    }

    this.logger.log(`Indexed ${artifacts.length} artifacts`);
  }

  /**
   * Index a single artifact.
   */
  private indexArtifact(artifact: CollectiveArtifactDocument): void {
    const keywords = this.extractKeywords(artifact.content);
    
    this.searchIndex.set((artifact._id as Types.ObjectId).toString(), {
      artifactId: (artifact._id as Types.ObjectId).toString(),
      keywords,
      lastIndexed: new Date(),
    });
  }

  /**
   * Remove artifact from index.
   */
  removeFromIndex(artifactId: string | Types.ObjectId): void {
    this.searchIndex.delete(artifactId.toString());
  }

  /**
   * Update artifact in index.
   */
  async updateIndex(artifactId: string | Types.ObjectId): Promise<void> {
    const artifact = await this.artifactModel.findById(artifactId);
    if (artifact) {
      this.indexArtifact(artifact);
    }
  }
}

interface SearchOptions {
  collectiveId?: string | Types.ObjectId;
  type?: string;
  tags?: string[];
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'relevance' | 'date' | 'size';
  limit?: number;
  skip?: number;
}

interface SearchResult {
  artifact: CollectiveArtifactDocument;
  score: number;
  highlights: string[];
}

interface SearchIndexEntry {
  artifactId: string;
  keywords: string[];
  lastIndexed: Date;
}
