import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveTaskDocument = CollectiveTask & Document;

export enum TaskLevel {
  VISION = 0,
  PORTFOLIO = 1,
  PROGRAM = 2,
  EPIC = 3,
  FEATURE = 4,
  STORY = 5,
  TASK = 6,
  SUBTASK = 7,
}

export enum TaskCategory {
  VISION = 'vision',
  PORTFOLIO = 'portfolio',
  PROGRAM = 'program',
  EPIC = 'epic',
  FEATURE = 'feature',
  STORY = 'story',
  TASK = 'task',
  SUBTASK = 'subtask',
}

export enum TaskState {
  UNASSIGNED = 'unassigned',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DELEGATED = 'delegated',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVIEW = 'review',
}

@Schema({ _id: false })
export class ErrorInfo {
  @Prop({ required: true })
  message!: string;

  @Prop({ type: String })
  code?: string;

  @Prop({ type: Object })
  details?: Record<string, any>;

  @Prop({ required: true })
  timestamp!: Date;
}

export const ErrorInfoSchema = SchemaFactory.createForClass(ErrorInfo);

@Schema({ timestamps: true })
export class CollectiveTask {
  @Prop({ type: Types.ObjectId, ref: 'Collective', required: true, index: true })
  collectiveId!: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 7 })
  level!: TaskLevel;

  @Prop({ type: Types.ObjectId, ref: 'CollectiveTask', index: true })
  parentTaskId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'CollectiveTask', default: [] })
  childTaskIds!: Types.ObjectId[];

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: TaskCategory })
  category!: TaskCategory;

  @Prop({ required: true, enum: TaskState, default: TaskState.UNASSIGNED, index: true })
  state!: TaskState;

  @Prop({ type: String, index: true })
  assignedAgentId?: string;

  @Prop({ type: [String], default: [] })
  allowedAgentIds!: string[];

  @Prop({ type: [Types.ObjectId], ref: 'CollectiveTask', default: [] })
  dependencies!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'CollectiveTask', default: [] })
  blockedBy!: Types.ObjectId[];

  @Prop({ type: String })
  conversationId?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  @Prop({ type: [Types.ObjectId], ref: 'CollectiveArtifact', default: [] })
  artifacts!: Types.ObjectId[];

  @Prop({ type: String })
  output?: string;

  @Prop({ type: ErrorInfoSchema })
  errorInfo?: ErrorInfo;

  @Prop({ required: true, default: 'pm' })
  createdBy!: string; // 'pm', 'user', or agent ID

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveTaskSchema = SchemaFactory.createForClass(CollectiveTask);

// Indexes for efficient queries
CollectiveTaskSchema.index({ collectiveId: 1, state: 1 });
CollectiveTaskSchema.index({ collectiveId: 1, level: 1 });
CollectiveTaskSchema.index({ collectiveId: 1, assignedAgentId: 1 });
CollectiveTaskSchema.index({ collectiveId: 1, parentTaskId: 1 });
CollectiveTaskSchema.index({ state: 1, allowedAgentIds: 1 });
