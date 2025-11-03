import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveMessageDocument = CollectiveMessage & Document;

export enum MessagePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
  BACKGROUND = 'background',
}

export enum MessageType {
  DELEGATION = 'delegation',
  HELP_REQUEST = 'help_request',
  INFO_REQUEST = 'info_request',
  PM_DIRECTIVE = 'pm_directive',
  STATUS_UPDATE = 'status_update',
  RESULT = 'result',
  HUMAN_MESSAGE = 'human_message',
}

export enum MessageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class CollectiveMessage {
  @Prop({ type: Types.ObjectId, ref: 'Collective', required: true, index: true })
  collectiveId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  targetAgentId!: string;

  @Prop({ type: String })
  sourceAgentId?: string; // 'pm', 'user', or agent ID

  @Prop({ required: true, enum: MessagePriority, index: true })
  priority!: MessagePriority;

  @Prop({ required: true, enum: MessageType })
  type!: MessageType;

  @Prop({ required: true })
  conversationId!: string;

  @Prop({ type: Types.ObjectId, ref: 'CollectiveTask', required: true })
  taskId!: Types.ObjectId;

  @Prop({ required: true })
  message!: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: true, enum: MessageStatus, default: MessageStatus.PENDING })
  status!: MessageStatus;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: Number, default: 0 })
  retryCount?: number;

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop({ type: String })
  fromAgentId?: string; // For compatibility with some services

  @Prop({ type: String })
  toAgentId?: string; // For compatibility with some services

  @Prop({ type: String })
  content?: string; // For compatibility with some services

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveMessageSchema = SchemaFactory.createForClass(CollectiveMessage);

// Indexes for message queue queries
CollectiveMessageSchema.index({ collectiveId: 1, targetAgentId: 1, status: 1, priority: -1 });
CollectiveMessageSchema.index({ collectiveId: 1, conversationId: 1 });
CollectiveMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
