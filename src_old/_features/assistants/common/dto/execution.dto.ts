import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

export class ExecuteAssistantDto {
  @IsOptional()
  input?: any;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsObject()
  options?: {
    traceExecution?: boolean;
    requireToolApproval?: boolean;
    specificToolsRequiringApproval?: string[];
    llmProvider?: string;
    llmModel?: string;
    temperature?: number;
    streaming?: boolean;
    maxTokens?: number;
    history?: [HumanMessage, ...AIMessage[]] | [];
  };
}

export class ExecutionTraceDto {
  @IsString()
  nodeId!: string;

  @IsString()
  timestamp!: string;

  @IsString()
  resultType!: string;

  @IsOptional()
  @IsString()
  contentPreview?: string;
}

export class ToolCallDto {
  @IsString()
  id!: string;

  @IsString()
  toolName!: string;

  @IsObject()
  args!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

export class HandleToolCallDto {
  @IsString()
  toolCallId!: string;

  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  modifiedArgs?: any;
}

export class ProvideInputDto {
  @IsString()
  nodeId!: string;

  @IsOptional()
  input?: any;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

export class QueryExecutionDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsObject()
  options?: {
    assistantType?: string;
    outputFormat?: string;
  };
}
