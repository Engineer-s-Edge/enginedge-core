import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveDocument = Collective & Document;

export enum CollectiveStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AgentType {
  REACT = 'react',
  GRAPH = 'graph',
}

export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  BLOCKED = 'blocked',
  ERROR = 'error',
}

@Schema({ _id: false })
export class CollectiveAgentConfig {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: AgentType })
  type!: AgentType;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: [String], default: [] })
  capabilities!: string[];

  @Prop({ type: Object })
  reActConfig?: Record<string, any>;

  @Prop({ type: Object })
  graphConfig?: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  tools!: Record<string, any>[];

  @Prop({ required: true, enum: AgentStatus, default: AgentStatus.IDLE })
  status!: AgentStatus;

  @Prop({ type: String })
  currentTaskId?: string;
}

export const CollectiveAgentConfigSchema = SchemaFactory.createForClass(CollectiveAgentConfig);

@Schema({ _id: false })
export class PMAgentConfig {
  @Prop({ required: true })
  id!: string;

  @Prop({ type: Object, required: true })
  reActConfig!: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  specialTools!: Record<string, any>[];
}

export const PMAgentConfigSchema = SchemaFactory.createForClass(PMAgentConfig);

@Schema({ timestamps: true })
export class Collective {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  vision!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: [CollectiveAgentConfigSchema], default: [] })
  agents!: CollectiveAgentConfig[];

  @Prop({ type: PMAgentConfigSchema, required: true })
  pmAgent!: PMAgentConfig;

  @Prop({ required: true, enum: CollectiveStatus, default: CollectiveStatus.INITIALIZING })
  status!: CollectiveStatus;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveSchema = SchemaFactory.createForClass(Collective);

// Indexes
CollectiveSchema.index({ userId: 1, createdAt: -1 });
CollectiveSchema.index({ status: 1 });
