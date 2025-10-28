import { Injectable } from '@nestjs/common';
import TopicCatalogModel, {
  TopicCatalogEntry,
  TopicStatus,
} from '../entities/topic-catalog.entity';
import { TopicIdType } from '@core/infrastructure/database/utils/custom_types';

/**
 * Topic Catalog Repository
 * 
 * Data access layer for the topic catalog
 */
@Injectable()
export class TopicCatalogRepository {
  /**
   * Create a new topic
   */
  async create(
    topicData: Partial<TopicCatalogEntry>,
  ): Promise<TopicCatalogEntry> {
    const topic = new TopicCatalogModel(topicData);
    return await topic.save();
  }

  /**
   * Find topic by ID
   */
  async findById(id: TopicIdType): Promise<TopicCatalogEntry | null> {
    return await TopicCatalogModel.findById(id);
  }

  /**
   * Find topic by name
   */
  async findByName(name: string): Promise<TopicCatalogEntry | null> {
    return await TopicCatalogModel.findOne({ name });
  }

  /**
   * Find topics by category
   */
  async findByCategory(category: string): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find({ category });
  }

  /**
   * Find topics by status
   */
  async findByStatus(status: TopicStatus): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find({ status }).sort({
      researchPriority: -1,
    });
  }

  /**
   * Find topics by category and status
   */
  async findByCategoryAndStatus(
    category: string,
    status: TopicStatus,
  ): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find({ category, status }).sort({
      researchPriority: -1,
    });
  }

  /**
   * Find topics by Wikidata ID
   */
  async findByWikidataId(wikidataId: string): Promise<TopicCatalogEntry | null> {
    return await TopicCatalogModel.findOne({
      'externalIds.wikidataId': wikidataId,
    });
  }

  /**
   * Update topic
   */
  async update(
    id: TopicIdType,
    updates: Partial<TopicCatalogEntry>,
  ): Promise<TopicCatalogEntry | null> {
    return await TopicCatalogModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }

  /**
   * Update topic status
   */
  async updateStatus(
    id: TopicIdType,
    status: TopicStatus,
  ): Promise<TopicCatalogEntry | null> {
    return await TopicCatalogModel.findByIdAndUpdate(
      id,
      { status, lastUpdated: new Date() },
      { new: true },
    );
  }

  /**
   * Delete topic
   */
  async delete(id: TopicIdType): Promise<void> {
    await TopicCatalogModel.findByIdAndDelete(id);
  }

  /**
   * Get all topics
   */
  async findAll(): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find();
  }

  /**
   * Count topics by status
   */
  async countByStatus(status: TopicStatus): Promise<number> {
    return await TopicCatalogModel.countDocuments({ status });
  }

  /**
   * Count topics by category
   */
  async countByCategory(category: string): Promise<number> {
    return await TopicCatalogModel.countDocuments({ category });
  }

  /**
   * Find topics with high priority that haven't been started
   */
  async findHighPriorityUnresearched(
    limit: number = 10,
  ): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find({
      status: TopicStatus.NOT_STARTED,
    })
      .sort({ researchPriority: -1 })
      .limit(limit);
  }

  /**
   * Text search for topics
   */
  async search(query: string, limit: number = 20): Promise<TopicCatalogEntry[]> {
    return await TopicCatalogModel.find({
      $text: { $search: query },
    }).limit(limit);
  }

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<string[]> {
    return await TopicCatalogModel.distinct('category');
  }

  /**
   * Bulk create topics
   */
  async bulkCreate(
    topics: Partial<TopicCatalogEntry>[],
  ): Promise<TopicCatalogEntry[]> {
    const result = await TopicCatalogModel.insertMany(topics);
    return result as unknown as TopicCatalogEntry[];
  }

  /**
   * Check if topic exists by name
   */
  async exists(name: string): Promise<boolean> {
    const count = await TopicCatalogModel.countDocuments({ name });
    return count > 0;
  }
}
