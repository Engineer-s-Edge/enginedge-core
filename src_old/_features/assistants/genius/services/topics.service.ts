/**
 * Topics Service
 * 
 * Service for managing topics in the catalog.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { TopicCatalogService } from '@core/infrastructure/agents/components/knowledge/services/topic-catalog.service';
import { AddTopicDto, SeedTopicsDto, QueryTopicsDto } from '../dto/genius.dto';

@Injectable()
export class TopicsService {
  constructor(
    private topicCatalog: TopicCatalogService,
    private logger: MyLogger,
  ) {}

  async addTopic(dto: AddTopicDto): Promise<number> {
    this.logger.info(`Adding topic: ${dto.name}`, TopicsService.name);

    return this.topicCatalog.seedManual([
      {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        complexity: dto.complexity,
      },
    ]);
  }

  async seedFromWikipedia(dto: SeedTopicsDto): Promise<number> {
    this.logger.info(
      `Seeding topics from Wikipedia: ${dto.categories.join(', ')}`,
      TopicsService.name,
    );

    return this.topicCatalog.seedFromWikipedia(dto.categories, dto.limit || 100);
  }

  async queryTopics(query: QueryTopicsDto): Promise<any[]> {
    const filters: any = {};

    if (query.status) {
      filters.status = query.status;
    }

    if (query.category) {
      filters.category = query.category;
    }

    if (query.minPriority !== undefined) {
      filters.minPriority = query.minPriority;
    }

    const topics = await this.topicCatalog.findByStatus(filters.status);
    
    // Apply limit if specified
    const limit = query.limit || 100;
    return topics.slice(0, limit);
  }

  async getTopic(topicId: string): Promise<any> {
    const topic = await this.topicCatalog.getById(topicId as any);

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    return topic;
  }

  async updateTopic(topicId: string, updates: any): Promise<void> {
    this.logger.info(`Updating topic: ${topicId}`, TopicsService.name);

    if (updates.status) {
      await this.topicCatalog.updateStatus(topicId as any, updates.status);
    }

    // Add more update operations as needed
  }

  async deleteTopic(topicId: string): Promise<void> {
    this.logger.info(`Deleting topic: ${topicId}`, TopicsService.name);
    // TODO: Implement delete in TopicCatalogService
  }
}
