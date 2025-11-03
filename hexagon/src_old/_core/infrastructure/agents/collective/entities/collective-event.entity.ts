import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveEventDocument = CollectiveEvent & Document;

export enum EventType {
  TASK_CREATED = 'task_created',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  AGENT_IDLE = 'agent_idle',
  AGENT_WORKING = 'agent_working',
  DEADLOCK_DETECTED = 'deadlock_detected',
  DEADLOCK_RESOLVED = 'deadlock_resolved',
  ARTIFACT_CREATED = 'artifact_created',
  ARTIFACT_LOCKED = 'artifact_locked',
  ARTIFACT_UNLOCKED = 'artifact_unlocked',
  ARTIFACT_VERSIONED = 'artifact_versioned',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_FAILED = 'message_failed',
  USER_INTERVENTION = 'user_intervention',
  PM_DIRECTIVE = 'pm_directive',
  COLLECTIVE_STARTED = 'collective_started',
  COLLECTIVE_PAUSED = 'collective_paused',
  COLLECTIVE_RESUMED = 'collective_resumed',
  COLLECTIVE_COMPLETED = 'collective_completed',
}

export enum ActorType {
  PM = 'pm',
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

export enum TargetType {
  TASK = 'task',
  AGENT = 'agent',
  ARTIFACT = 'artifact',
  MESSAGE = 'message',
  COLLECTIVE = 'collective',
}

@Schema({ timestamps: true })
export class CollectiveEvent {
  @Prop({ type: Types.ObjectId, ref: 'Collective', required: true, index: true })
  collectiveId!: Types.ObjectId;

  @Prop({ required: true, enum: EventType, index: true })
  type!: EventType;

  @Prop({ required: true })
  actorId!: string; // 'pm', 'user', or agent ID

  @Prop({ required: true, enum: ActorType })
  actorType!: ActorType;

  @Prop({ type: String })
  targetId?: string;

  @Prop({ type: String, enum: TargetType })
  targetType?: TargetType;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: true, default: Date.now, index: true })
  timestamp!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveEventSchema = SchemaFactory.createForClass(CollectiveEvent);

// Indexes
CollectiveEventSchema.index({ collectiveId: 1, timestamp: -1 });
CollectiveEventSchema.index({ collectiveId: 1, type: 1 });
CollectiveEventSchema.index({ collectiveId: 1, actorId: 1 });
