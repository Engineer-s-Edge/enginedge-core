import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsObject,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssistantType,
  AssistantMode,
  AssistantStatus,
  AgentState,
} from '../entities/assistant.entity';

export class NodeConfigDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsBoolean()
  requiresUserInput?: boolean;

  @IsOptional()
  @IsObject()
  next?: string | Record<string, string> | null;
}

export class CustomPromptDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  priority?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ContextBlockDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableTopics?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AssistantToolConfigDto {
  @IsString()
  @IsNotEmpty()
  toolName!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class LLMParametersDto {
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  topP?: number;

  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;
}

// ReAct Agent DTOs
export class CoTConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  topP?: number;

  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @IsOptional()
  @IsArray()
  fewShotExamples?: Array<{
    input: string;
    thought: string;
    action: string;
    observation: string;
    finalAnswer: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[];

  @IsOptional()
  @IsNumber()
  maxSteps?: number;

  @IsOptional()
  @IsObject()
  selfConsistency?: {
    enabled: boolean;
    samples: number;
  };

  @IsOptional()
  @IsBoolean()
  temperatureModifiable?: boolean;

  @IsOptional()
  @IsBoolean()
  maxTokensModifiable?: boolean;
}

export class IntelligenceConfigDto {
  @IsObject()
  llm!: {
    provider: string;
    model: string;
    tokenLimit: number;
  };

  @IsOptional()
  @IsBoolean()
  escalate?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providerEscalationOptions?: string[];

  @IsOptional()
  @IsObject()
  modelEscalationTable?: Record<
    string,
    Array<{
      model: string;
      tokenLimit: number;
    }>
  >;
}

export class ReActAgentConfigDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsOptional()
  @IsEnum(AgentState)
  state?: AgentState;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoTConfigDto)
  cot?: CoTConfigDto;

  @IsOptional()
  @IsArray()
  tools?: any[];

  @IsOptional()
  @IsBoolean()
  canModifyStorage?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntelligenceConfigDto)
  intelligence?: IntelligenceConfigDto;

  @IsOptional()
  @IsObject()
  memory?: any;
}

// Graph Agent DTOs
export class GraphNodeDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsOptional()
  @IsString()
  command?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsObject()
  llm!: {
    provider: string;
    model: string;
    tokenLimit: number;
  };

  @ValidateNested()
  @Type(() => ReActAgentConfigDto)
  ReActConfig!: ReActAgentConfigDto;

  @IsOptional()
  @IsObject()
  userInteraction?: {
    mode: 'continuous_chat' | 'single_react_cycle';
    requireApproval?: boolean;
    confidenceThreshold?: number;
    approvalPrompt?: string;
    // Note: maxCoTSteps is handled by ReActConfig.cot.maxSteps to avoid duplication
    allowUserPrompting?: boolean;
    showEndChatButton?: boolean;
  };
}

export class GraphEdgeDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsObject()
  condition!: {
    type: 'keyword' | 'analysis';
    keyword?: string;
    analysisPrompt?: string;
    analysisProvider: {
      provider: string;
      model: string;
      tokenLimit: number;
    };
  };

  @IsOptional()
  @IsObject()
  memoryOverride?: any;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextFrom?: string[];
}

export class GraphAgentConfigDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsOptional()
  @IsEnum(AgentState)
  state?: AgentState;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphNodeDto)
  nodes?: GraphNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphEdgeDto)
  edges?: GraphEdgeDto[];

  @IsObject()
  memory!: unknown;

  @IsOptional()
  @IsObject()
  checkpoints?: {
    enabled: boolean;
    allowList: 'nodes' | 'tools' | 'all';
  };
}

export class CreateAssistantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(AssistantMode)
  primaryMode?: AssistantMode;

  @IsOptional()
  @IsString()
  agentType?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReActAgentConfigDto)
  reactConfig?: ReActAgentConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GraphAgentConfigDto)
  graphConfig?: GraphAgentConfigDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodeConfigDto)
  blocks?: NodeConfigDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomPromptDto)
  customPrompts?: CustomPromptDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextBlockDto)
  contextBlocks?: ContextBlockDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantToolConfigDto)
  tools?: AssistantToolConfigDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectExpertise?: string[];

  @IsOptional()
  // @ValidateNested()
  // @Type(() => LLMParametersDto)
  // llmParameters?: LLMParametersDto;
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateAssistantDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(AssistantMode)
  primaryMode?: AssistantMode;

  @IsOptional()
  @IsString()
  agentType?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReActAgentConfigDto)
  reactConfig?: ReActAgentConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GraphAgentConfigDto)
  graphConfig?: GraphAgentConfigDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodeConfigDto)
  blocks?: NodeConfigDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomPromptDto)
  customPrompts?: CustomPromptDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextBlockDto)
  contextBlocks?: ContextBlockDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantToolConfigDto)
  tools?: AssistantToolConfigDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectExpertise?: string[];

  @IsOptional()
  // @ValidateNested()
  // @Type(() => LLMParametersDto)
  // llmParameters?: LLMParametersDto;
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class AssistantFiltersDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AssistantType)
  type?: AssistantType;

  @IsOptional()
  @IsString()
  agentType?: string;

  @IsOptional()
  @IsEnum(AssistantStatus)
  status?: AssistantStatus;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;
}
