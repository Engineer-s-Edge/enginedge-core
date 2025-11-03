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
import { HabitsService } from '../services/habits.service';
import {
  CreateHabitDto,
  UpdateHabitDto,
  HabitEntryToggleDto,
} from '../dto/habit.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// Temporary controller for habits without JWT auth (for development/demo)
@Controller('habits-api')
export class HabitsApiController {
  constructor(private readonly habitsService: HabitsService) {}

  @Post()
  async create(
    @Headers('x-user-id') userId: string,
    @Body() createHabitDto: CreateHabitDto,
  ) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.habitsService.create(userId, createHabitDto);
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
}

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Post()
  async create(@Request() req: any, @Body() createHabitDto: CreateHabitDto) {
    return this.habitsService.create(req.user.userId, createHabitDto);
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
