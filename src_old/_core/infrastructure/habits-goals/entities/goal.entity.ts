import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type GoalDocument = Goal & Document;

@Schema({ timestamps: true })
export class Goal {
  @Prop({ type: MongooseSchema.Types.ObjectId, auto: true })
  _id?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({
    required: true,
    enum: ['not_started', 'in_progress', 'completed', 'on_hold', 'cancelled'],
    default: 'not_started',
  })
  status!: string;

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  priority!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop()
  targetDate?: Date;

  @Prop({ min: 0, max: 100, default: 0 })
  progress!: number;

  @Prop({ min: 1 })
  estimatedDuration?: number; // In minutes

  @Prop({ min: 1 })
  dailyTimeCommitment?: number; // In minutes - time per day this goal requires

  @Prop({ default: false })
  isRecurring!: boolean;

  @Prop({ default: '' })
  recurringPattern?: string; // Cron-like pattern or description

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId!: MongooseSchema.Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt!: Date;

  @Prop({ default: Date.now })
  updatedAt!: Date;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
