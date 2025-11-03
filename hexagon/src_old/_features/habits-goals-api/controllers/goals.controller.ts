import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  Headers,
} from '@nestjs/common';
import { GoalsService } from '../../../core/infrastructure/habits-goals/services/goals.service';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from '../../../core/infrastructure/habits-goals/dto/goal.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MyLogger } from '../../../core/services/logger/logger.service';
import { getErrorInfo } from '../../../common/error-assertions';

// Temporary controller for goals without JWT auth (for development/demo)
@Controller('goals-api')
export class GoalsApiController {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('GoalsApiController initialized', GoalsApiController.name);
  }

  @Post()
  async create(
    @Headers('x-user-id') userId: string,
    @Body() createGoalDto: CreateGoalDto,
  ) {
    this.logger.info(
      `Creating goal via API for user: ${userId}`,
      GoalsApiController.name,
    );
    if (!userId) {
      this.logger.warn(
        'X-User-ID header is required for goal creation',
        GoalsApiController.name,
      );
      throw new Error('X-User-ID header is required');
    }
    try {
      const result = await this.goalsService.create(userId, createGoalDto);
      this.logger.info(
        `Successfully created goal via API for user: ${userId}`,
        GoalsApiController.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create goal via API for user: ${userId} - ${info.message}\n${info.stack || ''}`,
        GoalsApiController.name,
      );
      throw error;
    }
  }

  @Get()
  async findAll(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.goalsService.findAll(userId);
  }

  @Get('unmet')
  async getUnmetGoals(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.goalsService.getUnmetGoals(userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.goalsService.update(id, userId, updateGoalDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.goalsService.remove(id, userId);
  }
}

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('GoalsController initialized', GoalsController.name);
  }

  @Post()
  async create(@Request() req: any, @Body() createGoalDto: CreateGoalDto) {
    this.logger.info(
      `Creating goal for user: ${req.user.userId}`,
      GoalsController.name,
    );
    try {
      const result = await this.goalsService.create(
        req.user.userId,
        createGoalDto,
      );
      this.logger.info(
        `Successfully created goal for user: ${req.user.userId}`,
        GoalsController.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create goal for user: ${req.user.userId} - ${info.message}\n${info.stack || ''}`,
        GoalsController.name,
      );
      throw error;
    }
  }

  @Get()
  async findAll(@Request() req: any, @Query('status') status?: string) {
    if (status) {
      const statuses = status.split(',');
      return this.goalsService.getGoalsByStatus(req.user.userId, statuses);
    }
    return this.goalsService.findAll(req.user.userId);
  }

  @Get('unmet')
  async getUnmetGoals(@Request() req: any) {
    return this.goalsService.getUnmetGoals(req.user.userId);
  }

  @Get('overdue')
  async getOverdueGoals(@Request() req: any) {
    return this.goalsService.getOverdueGoals(req.user.userId);
  }

  @Get('time-commitment/total')
  async getTotalDailyTimeCommitment(@Request() req: any) {
    const total = await this.goalsService.getTotalDailyTimeCommitment(
      req.user.userId,
    );
    return { totalMinutes: total };
  }

  @Get('time-commitment/range')
  async getGoalsByTimeCommitment(
    @Request() req: any,
    @Query('min') minMinutes?: string,
    @Query('max') maxMinutes?: string,
  ) {
    const min = minMinutes ? parseInt(minMinutes, 10) : undefined;
    const max = maxMinutes ? parseInt(maxMinutes, 10) : undefined;
    return this.goalsService.getGoalsByTimeCommitment(
      req.user.userId,
      min,
      max,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.goalsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateGoalDto: UpdateGoalDto,
  ) {
    return this.goalsService.update(id, req.user.userId, updateGoalDto);
  }

  @Patch(':id/progress')
  async updateProgress(
    @Param('id') id: string,
    @Request() req: any,
    @Body() progressDto: UpdateGoalProgressDto,
  ) {
    return this.goalsService.updateProgress(id, req.user.userId, progressDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.goalsService.remove(id, req.user.userId);
  }
}
