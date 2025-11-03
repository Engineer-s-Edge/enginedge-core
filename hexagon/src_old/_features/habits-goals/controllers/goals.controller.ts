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
import { GoalsService } from '../services/goals.service';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from '../dto/goal.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// Temporary controller for goals without JWT auth (for development/demo)
@Controller('goals-api')
export class GoalsApiController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  async create(
    @Headers('x-user-id') userId: string,
    @Body() createGoalDto: CreateGoalDto,
  ) {
    if (!userId) {
      throw new Error('X-User-ID header is required');
    }
    return this.goalsService.create(userId, createGoalDto);
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
}

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  async create(@Request() req: any, @Body() createGoalDto: CreateGoalDto) {
    return this.goalsService.create(req.user.userId, createGoalDto);
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
