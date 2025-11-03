import { IsString, IsArray, IsEnum, IsOptional, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentType } from '@core/infrastructure/agents/collective/entities/collective.entity';

export class CreateAgentConfigDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AgentType)
  type!: AgentType;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];

  @IsOptional()
  reActConfig?: Record<string, any>;

  @IsOptional()
  graphConfig?: Record<string, any>;

  @IsArray()
  tools!: Record<string, any>[];
}

export class CreatePMConfigDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsNotEmpty()
  reActConfig!: Record<string, any>;

  @IsOptional()
  @IsArray()
  specialTools?: Record<string, any>[];
}

export class CreateCollectiveDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  vision!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAgentConfigDto)
  agents!: CreateAgentConfigDto[];

  @ValidateNested()
  @Type(() => CreatePMConfigDto)
  pmAgent!: CreatePMConfigDto;
}

export class CollectiveResponseDto {
  id!: string;

  name!: string;

  description!: string;

  vision!: string;

  userId!: string;

  status!: string;

  agents!: any[];

  pmAgent: any;

  createdAt!: Date;

  updatedAt!: Date;

  startedAt?: Date;

  completedAt?: Date;
}

export class StartCollectiveDto {
  @IsString()
  @IsNotEmpty()
  collectiveId!: string;
}

export class PauseCollectiveDto {
  @IsString()
  @IsNotEmpty()
  collectiveId!: string;
}

export class ResumeCollectiveDto {
  @IsString()
  @IsNotEmpty()
  collectiveId!: string;
}
