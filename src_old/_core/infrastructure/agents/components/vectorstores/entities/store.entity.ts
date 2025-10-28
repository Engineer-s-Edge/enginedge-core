import { Schema, model, Document, Types } from 'mongoose';
import {
  ConversationIdType,
  UserIdType,
  VectorStoreId,
  VectorStoreIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MIMEType } from 'util';

export const EmbedSize = 1536;
export type Embed = {
  embedding: number[];
  size: number;
  embeddingModelId: string;
};

export interface LineCharPos {
  line: number;
  character: number;
}

export const lineCharPosSchema = new Schema<LineCharPos>(
  {
    line: { type: Number, required: true },
    character: { type: Number, required: true },
  },
  { _id: false },
);

export interface VectorStore extends Document<VectorStoreIdType> {
  _id: VectorStoreIdType;
  conversationId: ConversationIdType;
  global: boolean;
  embed: Embed;
  documentId: string;
  documentName: string;
  lines: { start: number; end: number };
  data: Buffer;
  mimeType: MIMEType;
  metadata?: Record<string, any>;
  ownerId?: UserIdType;
  allowedUserIds?: UserIdType[];
  createdAt: Date;
  updatedAt: Date;
}

export const EmbedSchema = new Schema<Embed>(
  {
    embedding: { type: [Number], size: EmbedSize, required: true },
    size: { type: Number, required: true },
    embeddingModelId: { type: String, required: true },
  },
  { _id: false },
);

const vectorStoreSchema = new Schema<VectorStore>(
  {
    _id: {
      type: String,
      default: () => VectorStoreId.create(new Types.ObjectId()),
    },
    conversationId: { type: String, index: true, required: true },
    global: { type: Boolean, index: true, required: true },
    embed: {
      type: EmbedSchema,
      required: true,
      index: true,
    },
    documentId: { type: String, index: true, required: true },
    documentName: { type: String, index: true, required: true },
    lines: {
      start: { type: lineCharPosSchema, index: true },
      end: { type: lineCharPosSchema, index: true },
    },
    data: { type: Buffer, required: true },
    ownerId: { type: String, index: true, required: true },
    allowedUserIds: { type: [String], index: true, default: [] },
    mimeType: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

const VectorStoreModel = model<VectorStore>('vector_store', vectorStoreSchema);
export default VectorStoreModel;
