import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveConversationDocument = CollectiveConversation & Document;

export enum ConversationStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ _id: false })
export class ConversationMessage {
  @Prop({ required: true })
  role!: string; // 'user', 'assistant', 'system'

  @Prop({ required: true })
  content!: string;

  @Prop({ required: true })
  timestamp!: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ConversationMessageSchema = SchemaFactory.createForClass(ConversationMessage);

@Schema({ timestamps: true })
export class CollectiveConversation {
  @Prop({ type: Types.ObjectId, ref: 'Collective', required: true, index: true })
  collectiveId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CollectiveTask', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  agentId!: string;

  @Prop({ type: [ConversationMessageSchema], default: [] })
  messages!: ConversationMessage[];

  @Prop({ type: String })
  summary?: string;

  @Prop({ type: Date })
  lastSummarizedAt?: Date;

  @Prop({ required: true, enum: ConversationStatus, default: ConversationStatus.ACTIVE })
  status!: ConversationStatus;

  @Prop({ type: Date })
  pausedAt?: Date;

  @Prop({ type: Date })
  resumedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveConversationSchema = SchemaFactory.createForClass(CollectiveConversation);

// Indexes
CollectiveConversationSchema.index({ collectiveId: 1, agentId: 1 });
CollectiveConversationSchema.index({ collectiveId: 1, taskId: 1 });
CollectiveConversationSchema.index({ agentId: 1, status: 1 });
