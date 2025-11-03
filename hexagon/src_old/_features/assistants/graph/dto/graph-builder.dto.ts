import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsObject,
  IsNumber,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum GraphNodeType {
  LLM = 'llm',
  TOOL = 'tool',
  CONDITION = 'condition',
  USER_INPUT = 'user_input',
  USER_APPROVAL = 'user_approval',
  CONTINUOUS_CHAT = 'continuous_chat',
  CHECKPOINT = 'checkpoint',
  MEMORY = 'memory',
  DECISION = 'decision',
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  START = 'start',
  END = 'end',
}

export enum GraphEdgeType {
  DIRECT = 'direct',
  CONDITIONAL = 'conditional',
  APPROVAL_BASED = 'approval_based',
  CONFIDENCE_BASED = 'confidence_based',
  USER_CHOICE = 'user_choice',
  PARALLEL_BRANCH = 'parallel_branch',
  PARALLEL_JOIN = 'parallel_join',
}

export enum UserInteractionMode {
  NONE = 'none',
  INPUT_REQUIRED = 'input_required',
  APPROVAL_REQUIRED = 'approval_required',
  CONTINUOUS_CHAT = 'continuous_chat',
  OPTIONAL_INPUT = 'optional_input',
}

export class GraphNodeConfigDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsEnum(GraphNodeType)
  type!: GraphNodeType;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsEnum(UserInteractionMode)
  userInteractionMode?: UserInteractionMode;

  @IsOptional()
  @IsObject()
  userInteractionConfig?: {
    approvalRequired?: boolean;
    confidenceThreshold?: number;
    allowContinuousChat?: boolean;
    inputPrompt?: string;
    approvalPrompt?: string;
    chatInstructions?: string;
    timeoutSeconds?: number;
  };

  @IsOptional()
  @IsObject()
  position?: {
    x: number;
    y: number;
  };

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class GraphEdgeConfigDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  sourceNodeId!: string;

  @IsString()
  @IsNotEmpty()
  targetNodeId!: string;

  @IsEnum(GraphEdgeType)
  type!: GraphEdgeType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsObject()
  condition?: {
    type: 'javascript' | 'json_path' | 'confidence' | 'user_approval';
    expression: string;
    expectedValue?: any;
    operator?: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  };

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class GraphConfigDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphNodeConfigDto)
  nodes!: GraphNodeConfigDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphEdgeConfigDto)
  edges!: GraphEdgeConfigDto[];

  @IsOptional()
  @IsString()
  startNodeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  endNodeIds?: string[];

  @IsOptional()
  @IsObject()
  globalConfig?: {
    enableCheckpoints?: boolean;
    maxExecutionTime?: number;
    enableUserInteractionQueue?: boolean;
    confidenceThresholdDefault?: number;
    parallelismLimit?: number;
  };

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateGraphAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateNested()
  @Type(() => GraphConfigDto)
  graphConfig!: GraphConfigDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectExpertise?: string[];

  // @IsOptional()
  // @IsObject()
  // llmParameters?: {
  //   temperature?: number;
  //   topP?: number;
  //   presencePenalty?: number;
  //   frequencyPenalty?: number;
  //   maxTokens?: number;
  // };

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  options?: {
    enableAdvancedUserInteractions?: boolean;
    enableParallelExecution?: boolean;
    enableCheckpointing?: boolean;
    metadata?: Record<string, any>;
  };
}

export class ValidateGraphConfigDto {
  @ValidateNested()
  @Type(() => GraphConfigDto)
  graphConfig!: GraphConfigDto;

  @IsOptional()
  @IsBoolean()
  strictValidation?: boolean;
}
