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
import { HabitsService } from '../../../core/infrastructure/habits-goals/services/habits.service';
import {
  CreateHabitDto,
  UpdateHabitDto,
  HabitEntryToggleDto,
} from '../../../core/infrastructure/habits-goals/dto/habit.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MyLogger } from '../../../core/services/logger/logger.service';
import { getErrorInfo } from '../../../common/error-assertions';

// Temporary controller for habits without JWT auth (for development/demo)
@Controller('habits-api')
export class HabitsApiController {
  constructor(
    private readonly habitsService: HabitsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'HabitsApiController initialized',
      HabitsApiController.name,
    );
  }

  @Post()
  async create(
    @Headers('x-user-id') userId: string,
    @Body() createHabitDto: CreateHabitDto,
  ) {
    this.logger.info(
      `Creating habit via API for user: ${userId}`,
      HabitsApiController.name,
    );
    if (!userId) {
      this.logger.warn(
        'X-User-ID header is required for habit creation',
        HabitsApiController.name,
      );
      throw new Error('X-User-ID header is required');
    }
    try {
      const result = await this.habitsService.create(userId, createHabitDto);
      this.logger.info(
        `Successfully created habit via API for user: ${userId}`,
        HabitsApiController.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create habit via API for user: ${userId} - ${info.message}\n${info.stack || ''}`,
        HabitsApiController.name,
      );
      throw error;
    }
  }

  @Get()
  async findAll(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.findAll(userId);
  }

  @Get('unmet')
  async getUnmetHabits(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.getUnmetHabits(userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.update(id, userId, updateHabitDto);
  }

  @Patch(':id/entry')
  async toggleEntry(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body() entryData: HabitEntryToggleDto,
  ) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.toggleEntry(id, userId, entryData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.remove(id, userId);
  }
}

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(
    private readonly habitsService: HabitsService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('HabitsController initialized', HabitsController.name);
  }

  @Post()
  async create(@Request() req: any, @Body() createHabitDto: CreateHabitDto) {
    this.logger.info(
      `Creating habit for user: ${req.user.userId}`,
      HabitsController.name,
    );
    try {
      const result = await this.habitsService.create(
        req.user.userId,
        createHabitDto,
      );
      this.logger.info(
        `Successfully created habit for user: ${req.user.userId}`,
        HabitsController.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create habit for user: ${req.user.userId} - ${info.message}\n${info.stack || ''}`,
        HabitsController.name,
      );
      throw error;
    }
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.habitsService.findAll(req.user.userId);
  }

  @Get('unmet')
  async getUnmetHabits(@Request() req: any) {
    return this.habitsService.getUnmetHabits(req.user.userId);
  }

  @Get('time-commitment/total')
  async getTotalDailyTimeCommitment(@Request() req: any) {
    const total = await this.habitsService.getTotalDailyTimeCommitment(
      req.user.userId,
    );
    return { totalMinutes: total };
  }

  @Get('time-commitment/range')
  async getHabitsByTimeCommitment(
    @Request() req: any,
    @Query('min') minMinutes?: string,
    @Query('max') maxMinutes?: string,
  ) {
    const min = minMinutes ? parseInt(minMinutes, 10) : undefined;
    const max = maxMinutes ? parseInt(maxMinutes, 10) : undefined;
    return this.habitsService.getHabitsByTimeCommitment(
      req.user.userId,
      min,
      max,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.habitsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    return this.habitsService.update(id, req.user.userId, updateHabitDto);
  }

  @Patch(':id/entry')
  async toggleEntry(
    @Param('id') id: string,
    @Request() req: any,
    @Body() entryData: HabitEntryToggleDto,
  ) {
    return this.habitsService.toggleEntry(id, req.user.userId, entryData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.habitsService.remove(id, req.user.userId);
  }
}
