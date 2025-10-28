import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type FileDocument = File & Document;

export enum FileType {
  RESUME = 'resume',
  COVER_LETTER = 'cover_letter',
  TRANSCRIPT = 'transcript',
  CERTIFICATE = 'certificate',
  LETTER_OF_RECOMMENDATION = 'letter_of_recommendation',
  OTHER = 'other',
}

@Schema()
export class File {
  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ required: true, enum: FileType, type: String })
  fileType!: FileType;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  fileSize!: number;

  @Prop({ required: true })
  fileData!: Buffer;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  ownerId!: string;

  @Prop({ default: Date.now })
  uploadDate!: Date;

  @Prop({ default: Date.now })
  updatedAt!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: {
    description?: string;
    tags?: string[];
    version?: number;
    additionalInfo?: Record<string, unknown>;
  };
}

export const FileSchema = SchemaFactory.createForClass(File);
