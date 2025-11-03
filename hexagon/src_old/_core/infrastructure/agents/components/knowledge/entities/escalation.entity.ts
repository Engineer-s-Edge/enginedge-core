/**
 * Escalation Entity (MongoDB)
 * 
 * Stores escalation records for user involvement in the knowledge expansion process.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  EscalationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import {
  EscalationStatus,
  EscalationType,
  EscalationPriority,
  EscalationContext,
  UserResponse,
} from '../types/escalation.types';

@Schema({ collection: 'escalations', timestamps: true })
export class EscalationEntity extends Document {
  @Prop({ required: true, unique: true, index: true })
  escalationId!: EscalationIdType;

  @Prop({ required: true, enum: Object.values(EscalationStatus), index: true })
  status!: EscalationStatus;

  @Prop({ required: true, enum: Object.values(EscalationType), index: true })
  type!: EscalationType;

  @Prop({ required: true, enum: Object.values(EscalationPriority), index: true })
  priority!: EscalationPriority;

  @Prop({ required: true, index: true })
  userId!: UserIdType;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Object, required: true })
  context!: EscalationContext;

  @Prop({ type: Object, required: false })
  userResponse?: UserResponse;

  @Prop({
    type: [
      {
        status: { type: String, enum: Object.values(EscalationStatus) },
        timestamp: { type: Date },
        note: { type: String, required: false },
      },
    ],
    default: [],
  })
  statusHistory!: Array<{
    status: EscalationStatus;
    timestamp: Date;
    note?: string;
  }>;

  @Prop({ required: true, index: true })
  createdAt!: Date;

  @Prop({ required: false })
  notifiedAt?: Date;

  @Prop({ required: false })
  resolvedAt?: Date;

  @Prop({ required: false })
  expiresAt?: Date;

  @Prop({ default: false })
  externalNotificationSent?: boolean;
}

export const EscalationSchema = SchemaFactory.createForClass(EscalationEntity);

// Indexes
EscalationSchema.index({ userId: 1, status: 1 });
EscalationSchema.index({ userId: 1, createdAt: -1 });
EscalationSchema.index({ status: 1, priority: -1, createdAt: -1 });
EscalationSchema.index({ 'context.topicId': 1 });
EscalationSchema.index({ 'context.geniusAgentId': 1 });
EscalationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $exists: true } } });
