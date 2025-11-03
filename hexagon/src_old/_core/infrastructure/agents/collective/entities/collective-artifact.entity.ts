import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectiveArtifactDocument = CollectiveArtifact & Document;

@Schema({ timestamps: true })
export class CollectiveArtifact {
  @Prop({ type: Types.ObjectId, ref: 'Collective', required: true, index: true })
  collectiveId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CollectiveTask', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  type!: string; // Custom types allowed: 'code', 'doc', 'data', 'design', etc.

  @Prop({ type: String })
  description?: string;

  @Prop({ required: true })
  content!: string; // Or reference to external storage

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ type: Types.ObjectId, ref: 'CollectiveArtifact' })
  previousVersionId?: Types.ObjectId;

  @Prop({ type: String })
  lockedBy?: string; // Agent ID currently editing

  @Prop({ type: Date })
  lockedAt?: Date;

  @Prop({ required: true })
  createdBy!: string; // Agent ID

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ required: true })
  searchableContent!: string; // Indexed for full-text search

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectiveArtifactSchema = SchemaFactory.createForClass(CollectiveArtifact);

// Indexes
CollectiveArtifactSchema.index({ collectiveId: 1, type: 1 });
CollectiveArtifactSchema.index({ collectiveId: 1, tags: 1 });
CollectiveArtifactSchema.index({ searchableContent: 'text' });
CollectiveArtifactSchema.index({ lockedBy: 1 });
