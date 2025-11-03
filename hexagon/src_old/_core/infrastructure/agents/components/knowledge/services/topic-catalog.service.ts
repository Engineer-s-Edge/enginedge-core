import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';
import { TopicCatalogRepository } from '../repositories/topic-catalog.repository';
import { CategoryService } from './category.service';
import {
  TopicCatalogEntry,
  TopicStatus,
} from '../entities/topic-catalog.entity';
import { ICSLayer } from '../entities/knowledge-node.entity';
import {
  TopicIdType,
  KnowledgeNodeIdType,
  ExpertAgentIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * Wikipedia API response types
 */
interface WikipediaArticle {
  pageid: number;
  title: string;
  categories?: Array<{ title: string }>;
}

/**
 * Topic Catalog Service
 * 
 * Manages the topic catalog including:
 * - Wikipedia API scraping for bulk topic import
 * - Manual seeding with curated topics
 * - Organic discovery by Expert Agents
 * - Priority calculation
 * - Category management
 */
@Injectable()
export class TopicCatalogService {
  private readonly WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

  constructor(
    @Inject(TopicCatalogRepository)
    private readonly repository: TopicCatalogRepository,
    @Inject(CategoryService)
    private readonly categoryService: CategoryService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {}

  // ========================================
  // Initialization & Seeding
  // ========================================

  /**
   * Seed topics from Wikipedia categories
   * 
   * @param categories - Wikipedia category names (e.g., ['Category:Physics', 'Category:Computer_science'])
   * @param maxTopics - Maximum number of topics to import per category
   */
  async seedFromWikipedia(
    categories: string[],
    maxTopics: number = 100,
  ): Promise<number> {
    this.logger.info(
      `Seeding topics from Wikipedia categories: ${categories.join(', ')}`,
      TopicCatalogService.name,
    );

    let totalImported = 0;

    for (const category of categories) {
      try {
        const articles = await this.fetchWikipediaCategory(
          category,
          maxTopics,
        );
        const imported = await this.importWikipediaArticles(
          articles,
          category,
        );
        totalImported += imported;

        this.logger.info(
          `Imported ${imported} topics from ${category}`,
          TopicCatalogService.name,
        );
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Error seeding from ${category}: ${info.message}`,
          TopicCatalogService.name,
          info.stack,
        );
      }
    }

    this.logger.info(
      `Total topics imported from Wikipedia: ${totalImported}`,
      TopicCatalogService.name,
    );
    return totalImported;
  }

  /**
   * Fetch articles from a Wikipedia category
   */
  private async fetchWikipediaCategory(
    category: string,
    limit: number,
  ): Promise<WikipediaArticle[]> {
    const articles: WikipediaArticle[] = [];
    let continueToken: string | undefined;

    // Remove 'Category:' prefix if present
    const categoryName = category.replace(/^Category:/i, '');

    while (articles.length < limit) {
      const params = {
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${categoryName}`,
        cmlimit: Math.min(500, limit - articles.length),
        format: 'json',
        ...(continueToken ? { cmcontinue: continueToken } : {}),
      };

      const response = await axios.get(this.WIKIPEDIA_API, { params });
      const data = response.data;

      if (!data.query?.categorymembers) {
        break;
      }

      const members = data.query.categorymembers;
      articles.push(...members);

      // Check if there are more results
      if (data.continue?.cmcontinue) {
        continueToken = data.continue.cmcontinue;
      } else {
        break;
      }
    }

    return articles.slice(0, limit);
  }

  /**
   * Import Wikipedia articles as topics
   */
  private async importWikipediaArticles(
    articles: WikipediaArticle[],
    category: string,
  ): Promise<number> {
    let imported = 0;

    for (const article of articles) {
      try {
        // Skip if already exists
        const exists = await this.repository.exists(article.title);
        if (exists) {
          continue;
        }

        // Extract clean category name
        const cleanCategory = category
          .replace(/^Category:/i, '')
          .replace(/_/g, ' ');

        // Create topic entry
        await this.repository.create({
          name: article.title,
          category: cleanCategory,
          subcategories: [],
          estimatedComplexity: ICSLayer.L3_TOPIC,
          prerequisiteTopics: [],
          status: TopicStatus.NOT_STARTED,
          sourceType: 'wikipedia',
          externalIds: {
            wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
            wikipediaPageId: article.pageid,
          },
          relatedCategories: [],
          researchPriority: 50, // Default medium priority
        });

        imported++;
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.warn(
          `Failed to import ${article.title}: ${info.message}`,
          TopicCatalogService.name,
        );
      }
    }

    return imported;
  }

  /**
   * Manually seed topics from a curated list
   */
  async seedManual(
    topics: Array<{
      name: string;
      category: string;
      complexity?: ICSLayer;
      description?: string;
    }>,
  ): Promise<number> {
    this.logger.info(
      `Manually seeding ${topics.length} topics`,
      TopicCatalogService.name,
    );

    const created = await this.repository.bulkCreate(
      topics.map(topic => ({
        name: topic.name,
        category: topic.category,
        subcategories: [],
        estimatedComplexity: topic.complexity || ICSLayer.L3_TOPIC,
        prerequisiteTopics: [],
        status: TopicStatus.NOT_STARTED,
        sourceType: 'curated' as const,
        relatedCategories: [],
        researchPriority: 50,
        metadata: {
          description: topic.description,
        },
      })),
    );

    return created.length;
  }

  // ========================================
  // Organic Discovery (Expert Agents)
  // ========================================

  /**
   * Discover a new topic organically (Expert Agent found it during research)
   * 
   * This is a KEY method - Expert Agents call this when they encounter concepts
   * that aren't in the catalog yet. This is how the knowledge graph grows organically!
   */
  async discoverNewTopic(
    name: string,
    category: string,
    discoveredBy: ExpertAgentIdType,
    options?: {
      complexity?: ICSLayer;
      relatedTopics?: string[];
      description?: string;
    },
  ): Promise<TopicIdType> {
    this.logger.info(
      `New topic discovered: "${name}" in ${category} by ${discoveredBy}`,
      TopicCatalogService.name,
    );

    // Check if already exists
    const existing = await this.repository.findByName(name);
    if (existing) {
      this.logger.info(
        `Topic "${name}" already exists, skipping`,
        TopicCatalogService.name,
      );
      return existing._id;
    }

    // Create new topic
    const topic = await this.repository.create({
      name,
      category,
      subcategories: [],
      estimatedComplexity: options?.complexity || ICSLayer.L3_TOPIC,
      prerequisiteTopics: [],
      status: TopicStatus.NOT_STARTED,
      sourceType: 'organic',
      discoveredBy,
      discoveredAt: new Date(),
      relatedCategories: [],
      researchPriority: 60, // Slightly higher priority for organic discoveries
      metadata: {
        description: options?.description,
      },
    });

    this.logger.info(
      `Created new organic topic: ${topic._id} (${topic.name})`,
      TopicCatalogService.name,
    );

    return topic._id;
  }

  // ========================================
  // Topic Management
  // ========================================

  /**
   * Get a topic by ID
   */
  async getTopic(id: TopicIdType): Promise<TopicCatalogEntry | null> {
    return await this.repository.findById(id);
  }

  /**
   * Update topic status
   */
  async updateTopicStatus(
    id: TopicIdType,
    status: TopicStatus,
  ): Promise<void> {
    await this.repository.updateStatus(id, status);
  }

  /**
   * Link topic to knowledge graph node
   */
  async linkToKnowledgeNode(
    topicId: TopicIdType,
    nodeId: KnowledgeNodeIdType,
  ): Promise<void> {
    await this.repository.update(topicId, {
      knowledgeNodeId: nodeId,
      status: TopicStatus.COMPLETED,
      lastUpdated: new Date(),
    });
  }

  // ========================================
  // Discovery & Prioritization
  // ========================================

  /**
   * Find missing/unresearched topics
   */
  async findMissingTopics(category?: string): Promise<TopicCatalogEntry[]> {
    if (category) {
      return await this.repository.findByCategoryAndStatus(
        category,
        TopicStatus.NOT_STARTED,
      );
    }
    return await this.repository.findByStatus(TopicStatus.NOT_STARTED);
  }

  /**
   * Find weak topics (low confidence or needs refresh)
   */
  async findWeakTopics(
    _confidenceThreshold: number,
  ): Promise<TopicCatalogEntry[]> {
    // For now, just return topics that need refresh
    // In the future, we could query the knowledge graph for low-confidence nodes
    return await this.repository.findByStatus(TopicStatus.NEEDS_REFRESH);
  }

  /**
   * Find bridge topics that could connect disjoint graph components
   */
  async findBridgeTopics(
    componentIds: string[],
  ): Promise<TopicCatalogEntry[]> {
    // This is a placeholder - will be enhanced with actual component analysis
    // For now, return high-priority unresearched topics
    this.logger.info(
      `Finding bridge topics for components: ${componentIds.join(', ')}`,
      TopicCatalogService.name,
    );
    return await this.repository.findHighPriorityUnresearched(10);
  }

  /**
   * Calculate research priority for a topic
   * 
   * Factors:
   * - Gap importance (how many other topics reference this)
   * - Prerequisite coverage (are prerequisites already researched?)
   * - Category balance (underrepresented categories get higher priority)
   * - Recency (older requests get higher priority)
   */
  async calculateResearchPriority(
    topic: TopicCatalogEntry,
  ): Promise<number> {
    let priority = 50; // Base priority

    // Organic discoveries get bonus
    if (topic.sourceType === 'organic') {
      priority += 10;
    }

    // User-requested topics get bonus
    if (topic.sourceType === 'user') {
      priority += 15;
    }

    // Topics that need refresh get lower priority
    if (topic.status === TopicStatus.NEEDS_REFRESH) {
      priority -= 10;
    }

    // Category balance - check if category is underrepresented
    const categoryCount = await this.repository.countByCategory(
      topic.category,
    );
    if (categoryCount < 10) {
      priority += 15; // Boost underrepresented categories
    }

    // Age factor - older unresearched topics get slightly higher priority
    const ageInDays = topic.createdAt
      ? (Date.now() - topic.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    priority += Math.min(10, ageInDays / 7); // +1 per week, max +10

    // Clamp between 0-100
    return Math.max(0, Math.min(100, Math.round(priority)));
  }

  // ========================================
  // Category Management
  // ========================================

  /**
   * Get all active categories (categories with topics)
   */
  async getActiveCategories(): Promise<string[]> {
    return await this.repository.getCategories();
  }

  /**
   * Check if two categories are related
   */
  async areCategoriesRelated(cat1: string, cat2: string): Promise<boolean> {
    return await this.categoryService.areRelated(cat1, cat2);
  }

  /**
   * Get distance between two categories
   */
  async getCategoryDistance(cat1: string, cat2: string): Promise<number> {
    return await this.categoryService.calculateDistance(cat1, cat2);
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get topic statistics
   */
  async getStatistics(): Promise<{
    total: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    needsRefresh: number;
    bySource: Record<string, number>;
  }> {
    const [total, notStarted, inProgress, completed, needsRefresh, allTopics] =
      await Promise.all([
        this.repository.findAll().then(t => t.length),
        this.repository.countByStatus(TopicStatus.NOT_STARTED),
        this.repository.countByStatus(TopicStatus.IN_PROGRESS),
        this.repository.countByStatus(TopicStatus.COMPLETED),
        this.repository.countByStatus(TopicStatus.NEEDS_REFRESH),
        this.repository.findAll(),
      ]);

    const bySource = allTopics.reduce(
      (acc, topic) => {
        acc[topic.sourceType] = (acc[topic.sourceType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      notStarted,
      inProgress,
      completed,
      needsRefresh,
      bySource,
    };
  }

  /**
   * Get topic by ID
   */
  async getById(id: TopicIdType): Promise<TopicCatalogEntry | null> {
    return this.repository.findById(id);
  }

  /**
   * Find topics by status
   */
  async findByStatus(status: TopicStatus): Promise<TopicCatalogEntry[]> {
    return this.repository.findByStatus(status);
  }

  /**
   * Update topic status
   */
  async updateStatus(id: TopicIdType, status: TopicStatus): Promise<void> {
    await this.repository.updateStatus(id, status);
  }

  /**
   * Record that research was completed on a topic
   */
  async recordResearch(id: TopicIdType): Promise<void> {
    const topic = await this.repository.findById(id);
    if (topic) {
      topic.lastUpdated = new Date();
      await this.repository.update(id, topic);
    }
  }
}
