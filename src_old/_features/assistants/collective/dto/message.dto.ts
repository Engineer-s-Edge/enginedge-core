import { IsString, IsEnum, IsOptional } from 'class-validator';
import { MessagePriority, MessageType } from '@core/infrastructure/agents/collective/entities/collective-message.entity';

export class SendMessageDto {
  @IsString()
  collectiveId!: string;

  @IsString()
  targetAgentId!: string;

  @IsOptional()
  @IsString()
  sourceAgentId?: string;

  @IsEnum(MessagePriority)
  priority!: MessagePriority;

  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  conversationId!: string;

  @IsString()
  taskId!: string;

  @IsString()
  message!: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class MessageResponseDto {
  id!: string;
  collectiveId!: string;
  targetAgentId!: string;
  sourceAgentId?: string;
  priority!: string;
  type!: string;
  conversationId!: string;
  taskId!: string;
  message!: string;
  status!: string;
  createdAt!: Date;
}
