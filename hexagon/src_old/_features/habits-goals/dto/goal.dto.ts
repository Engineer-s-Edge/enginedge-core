import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Priority } from './habit.dto';

export enum GoalStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
  CANCELLED = 'cancelled',
}

export class CreateGoalDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(GoalStatus)
  status!: GoalStatus;

  @IsEnum(Priority)
  priority!: Priority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsNumber()
  estimatedDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyTimeCommitment?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurringPattern?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsNumber()
  estimatedDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyTimeCommitment?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurringPattern?: string;
}

export class UpdateGoalProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progress!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
