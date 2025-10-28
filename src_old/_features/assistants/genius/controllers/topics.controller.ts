/**
 * Topics Controller
 * 
 * REST API endpoints for managing the topic catalog.
 * 
 * Routes:
 * - POST   /topics              - Add single topic manually
 * - POST   /topics/seed         - Seed topics from Wikipedia
 * - GET    /topics              - Query topics with filters
 * - GET    /topics/:topicId     - Get specific topic details
 * - PATCH  /topics/:topicId     - Update topic (priority, status)
 * - DELETE /topics/:topicId     - Delete topic
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TopicsService } from '../services/topics.service';
import { AddTopicDto, SeedTopicsDto, QueryTopicsDto } from '../dto/genius.dto';

@Controller('topics')
export class TopicsController {
  constructor(private topicsService: TopicsService) {}

  /**
   * Add single topic manually
   */
  @Post()
  async addTopic(@Body() dto: AddTopicDto): Promise<{ message: string; count: number }> {
    const count = await this.topicsService.addTopic(dto);
    return {
      message: `Topic "${dto.name}" added to catalog`,
      count,
    };
  }

  /**
   * Seed topics from Wikipedia
   */
  @Post('seed')
  async seedTopics(
    @Body() dto: SeedTopicsDto,
  ): Promise<{ message: string; count: number }> {
    const count = await this.topicsService.seedFromWikipedia(dto);
    return {
      message: `Seeded ${count} topics from Wikipedia`,
      count,
    };
  }

  /**
   * Query topics with filters
   */
  @Get()
  async queryTopics(@Query() query: QueryTopicsDto): Promise<any[]> {
    return this.topicsService.queryTopics(query);
  }

  /**
   * Get specific topic details
   */
  @Get(':topicId')
  async getTopic(@Param('topicId') topicId: string): Promise<any> {
    return this.topicsService.getTopic(topicId);
  }

  /**
   * Update topic
   */
  @Patch(':topicId')
  async updateTopic(
    @Param('topicId') topicId: string,
    @Body() updates: any,
  ): Promise<{ message: string }> {
    await this.topicsService.updateTopic(topicId, updates);
    return { message: `Topic ${topicId} updated` };
  }

  /**
   * Delete topic
   */
  @Delete(':topicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopic(@Param('topicId') topicId: string): Promise<void> {
    await this.topicsService.deleteTopic(topicId);
  }
}
