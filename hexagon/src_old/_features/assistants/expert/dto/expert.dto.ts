import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, Max, IsBoolean } from 'class-validator';

/**
 * Request DTO for initiating research via Expert Agent
 */
export class ResearchRequestDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsOptional()
  @IsEnum(['basic', 'advanced'])
  researchDepth?: 'basic' | 'advanced';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSources?: number;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(10000)
  maxTokens?: number;

  @IsOptional()
  @IsBoolean()
  useBertScore?: boolean;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

/**
 * Response DTOs
 */
export interface ResearchSourceDto {
  url: string;
  title: string;
  retrievedAt: Date;
  sourceType: 'web' | 'academic' | 'document' | 'user' | 'llm';
}

export interface ResearchQuestionDto {
  question: string;
  layer: number;
  priority: number;
  nodeId: string;
}

export interface ResearchResultDto {
  question: string;
  answer: string;
  sources: ResearchSourceDto[];
  confidence: number;
  relatedConcepts: string[];
}

export interface ResearchPhaseDto {
  phase: 'AIM' | 'SHOOT' | 'SKIN';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  output: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ResearchResponseDto {
  query: string;
  domain: string;
  concepts: string[];
  questions: ResearchQuestionDto[];
  results: ResearchResultDto[];
  finalAnswer: string;
  totalSources: number;
  overallConfidence: number;
  phases: ResearchPhaseDto[];
  startedAt: Date;
  completedAt: Date;
  executionTimeMs: number;
}

export interface KnowledgeNodeDto {
  _id: string;
  name: string;
  type: 'concept' | 'entity' | 'process' | 'theory';
  layer: number;
  researchStatus: 'unresearched' | 'in-progress' | 'researched' | 'dubious';
  confidence: number;
  summary?: string;
  keyPoints?: string[];
  relatedNodes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeGraphResponseDto {
  nodes: KnowledgeNodeDto[];
  totalNodes: number;
  nodesByLayer: Record<number, number>;
  nodesByStatus: Record<string, number>;
  averageConfidence: number;
}

export interface ResearchHistoryItemDto {
  sessionId: string;
  query: string;
  domain: string;
  sourcesCount: number;
  confidence: number;
  conductedAt: Date;
  executionTimeMs: number;
}

export interface ResearchHistoryResponseDto {
  history: ResearchHistoryItemDto[];
  totalSessions: number;
  totalSources: number;
  averageConfidence: number;
}

/**
 * Create Expert Agent DTO
 */
export class CreateExpertAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  researchEnabled?: boolean;

  @IsOptional()
  @IsEnum(['basic', 'advanced'])
  researchDepth?: 'basic' | 'advanced';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxSources?: number;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(10000)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsEnum(['inline', 'footnote', 'endnote'])
  citationStyle?: 'inline' | 'footnote' | 'endnote';

  @IsOptional()
  @IsString()
  llmProvider?: string;

  @IsOptional()
  @IsString()
  llmModel?: string;
}

export interface ExpertAgentResponseDto {
  _id: string;
  name: string;
  description?: string;
  purpose?: string;
  state: string;
  research: {
    enabled: boolean;
    maxSources: number;
    researchDepth: 'basic' | 'advanced';
    maxTokens: number;
    temperature: number;
    citationStyle: 'inline' | 'footnote' | 'endnote';
  };
  intelligence: {
    provider: string;
    model: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
