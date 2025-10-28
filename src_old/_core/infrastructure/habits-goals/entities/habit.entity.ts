import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HabitDocument = Habit & Document;

@Schema()
export class HabitEntry {
  @Prop({ type: MongooseSchema.Types.ObjectId, auto: true })
  _id?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date!: Date;

  @Prop({ default: false })
  completed!: boolean;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ min: 1, max: 10 })
  mood?: number;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const HabitEntrySchema = SchemaFactory.createForClass(HabitEntry);

@Schema({ timestamps: true })
export class Habit {
  @Prop({ type: MongooseSchema.Types.ObjectId, auto: true })
  _id?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'daily',
  })
  frequency!: string;

  @Prop({ min: 1 })
  customFrequency?: number; // For custom frequency (e.g., every 3 days)

  @Prop({ min: 1 })
  targetDuration?: number; // In minutes

  @Prop({ min: 1 })
  dailyTimeCommitment?: number; // In minutes - time per day this habit requires

  @Prop({
    required: true,
    enum: ['active', 'paused', 'completed', 'archived'],
    default: 'active',
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
  endDate?: Date;

  @Prop({ min: 1 })
  targetDays?: number; // Target number of days to complete

  @Prop({ type: [HabitEntrySchema], default: [] })
  entries!: HabitEntry[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId!: MongooseSchema.Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt!: Date;

  @Prop({ default: Date.now })
  updatedAt!: Date;
}

export const HabitSchema = SchemaFactory.createForClass(Habit);
