import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';

export enum HabitFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export enum HabitStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class HabitEntryDto {
  @IsString()
  id!: string;

  @IsDateString()
  date!: string;

  @IsBoolean()
  completed!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  mood?: number;
}

export class CreateHabitDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(HabitFrequency)
  frequency!: HabitFrequency;

  @IsOptional()
  @IsNumber()
  customFrequency?: number;

  @IsOptional()
  @IsNumber()
  targetDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyTimeCommitment?: number;

  @IsEnum(HabitStatus)
  status!: HabitStatus;

  @IsEnum(Priority)
  priority!: Priority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  targetDays?: number;
}

export class UpdateHabitDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(HabitFrequency)
  frequency?: HabitFrequency;

  @IsOptional()
  @IsEnum(HabitStatus)
  status?: HabitStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyTimeCommitment?: number;

  @IsOptional()
  @IsNumber()
  targetDays?: number;
}

export class HabitEntryToggleDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  mood?: number;
}
