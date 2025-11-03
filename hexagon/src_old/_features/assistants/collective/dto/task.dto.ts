import { IsString, IsArray, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { TaskLevel, TaskCategory } from '@core/infrastructure/agents/collective/entities/collective-task.entity';

export class CreateTaskDto {
  @IsString()
  collectiveId!: string;

  @IsEnum(TaskLevel)
  @IsNumber()
  @Min(0)
  @Max(7)
  level!: TaskLevel;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(TaskCategory)
  category!: TaskCategory;

  @IsArray()
  @IsString({ each: true })
  allowedAgentIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];
}

export class UpdateTaskDto {
  @IsString()
  taskId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAgentIds?: string[];
}

export class AssignTaskDto {
  @IsString()
  taskId!: string;

  @IsString()
  agentId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReassignTaskDto {
  @IsString()
  taskId!: string;

  @IsString()
  fromAgentId!: string;

  @IsString()
  toAgentId!: string;

  @IsString()
  reason!: string;
}

export class CancelTaskDto {
  @IsString()
  taskId!: string;

  @IsString()
  reason!: string;
}

export class TaskResponseDto {
  id!: string;
  collectiveId!: string;
  level!: number;
  parentTaskId?: string;
  childTaskIds!: string[];
  title!: string;
  description!: string;
  category!: string;
  state!: string;
  assignedAgentId?: string;
  allowedAgentIds!: string[];
  dependencies!: string[];
  blockedBy!: string[];
  conversationId?: string;
  output?: string;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
