/**
 * Genius Agent Controller
 * 
 * REST API endpoints for controlling the Genius Agent system.
 * 
 * Routes:
 * - POST   /genius/start/user-directed    - Start user-directed learning
 * - POST   /genius/start/autonomous       - Start autonomous learning
 * - POST   /genius/stop                   - Stop all learning
 * - GET    /genius/status                 - Get current learning status
 * - GET    /genius/statistics             - Get comprehensive statistics
 * - POST   /genius/schedule               - Create scheduled learning job
 * - GET    /genius/schedule               - List all scheduled jobs
 * - GET    /genius/schedule/:jobId        - Get specific job status
 * - PATCH  /genius/schedule/:jobId        - Update scheduled job
 * - DELETE /genius/schedule/:jobId        - Delete scheduled job
 * - POST   /genius/schedule/:jobId/execute - Execute job immediately
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
  UseGuards,
} from '@nestjs/common';
import { GeniusService } from '../genius.service';
import {
  StartUserDirectedLearningDto,
  StartAutonomousLearningDto,
  CreateScheduleDto,
  UpdateScheduleDto,
  LearningStatusResponse,
  StatisticsResponse,
  JobStatusResponse,
} from '../dto/genius.dto';

@Controller('genius')
export class GeniusController {
  constructor(private geniusService: GeniusService) {}

  // ========================================
  // Learning Control
  // ========================================

  /**
   * Start user-directed learning session
   * User explicitly selects topics to research
   */
  @Post('start/user-directed')
  @HttpCode(HttpStatus.OK)
  async startUserDirectedLearning(
    @Body() dto: StartUserDirectedLearningDto,
  ): Promise<{ message: string; sessionId: string }> {
    const result = await this.geniusService.startUserDirectedLearning(dto);
    return {
      message: `Learning session started: ${result.topicsCompleted}/${result.topicsAttempted} topics completed`,
      sessionId: result.sessionId,
    };
  }

  /**
   * Start autonomous learning session
   * Agent auto-selects high-priority topics
   */
  @Post('start/autonomous')
  @HttpCode(HttpStatus.OK)
  async startAutonomousLearning(
    @Body() dto: StartAutonomousLearningDto,
  ): Promise<{ message: string; sessionId: string }> {
    const result = await this.geniusService.startAutonomousLearning(dto);
    return {
      message: `Autonomous learning complete: ${result.topicsCompleted}/${result.topicsAttempted} topics`,
      sessionId: result.sessionId,
    };
  }

  /**
   * Stop all learning activities
   */
  @Post('stop')
  @HttpCode(HttpStatus.OK)
  async stopLearning(): Promise<{ message: string }> {
    await this.geniusService.stopLearning();
    return { message: 'Learning stopped' };
  }

  /**
   * Get current learning status
   */
  @Get('status')
  async getStatus(): Promise<LearningStatusResponse> {
    return this.geniusService.getStatus();
  }

  /**
   * Get comprehensive statistics
   */
  @Get('statistics')
  async getStatistics(): Promise<StatisticsResponse> {
    return this.geniusService.getStatistics();
  }

  // ========================================
  // Scheduled Learning
  // ========================================

  /**
   * Create scheduled learning job
   */
  @Post('schedule')
  async createSchedule(@Body() dto: CreateScheduleDto): Promise<JobStatusResponse> {
    return this.geniusService.createSchedule(dto);
  }

  /**
   * List all scheduled jobs
   */
  @Get('schedule')
  async listSchedules(): Promise<JobStatusResponse[]> {
    return this.geniusService.listSchedules();
  }

  /**
   * Get specific job status
   */
  @Get('schedule/:jobId')
  async getSchedule(@Param('jobId') jobId: string): Promise<JobStatusResponse> {
    return this.geniusService.getSchedule(jobId);
  }

  /**
   * Update scheduled job
   */
  @Patch('schedule/:jobId')
  async updateSchedule(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<JobStatusResponse> {
    return this.geniusService.updateSchedule(jobId, dto);
  }

  /**
   * Delete scheduled job
   */
  @Delete('schedule/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchedule(@Param('jobId') jobId: string): Promise<void> {
    await this.geniusService.deleteSchedule(jobId);
  }

  /**
   * Execute scheduled job immediately (outside of schedule)
   */
  @Post('schedule/:jobId/execute')
  @HttpCode(HttpStatus.OK)
  async executeSchedule(
    @Param('jobId') jobId: string,
  ): Promise<{ message: string }> {
    await this.geniusService.executeSchedule(jobId);
    return { message: `Job ${jobId} executed` };
  }
}
