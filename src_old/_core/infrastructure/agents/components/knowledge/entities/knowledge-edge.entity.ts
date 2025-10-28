import { Schema, model, Document } from 'mongoose';
import {
  KnowledgeEdgeIdType,
  KnowledgeNodeIdType,
} from '@core/infrastructure/database/utils/custom_types';

/**
 * Edge/Relationship types for ICS knowledge graph
 */
export enum EdgeType {
  IS_A = 'is-a', // Classification
  PART_OF = 'part-of', // Composition
  PREREQUISITE_FOR = 'prerequisite-for', // Learning order
  RELATES_TO = 'relates-to', // General association
  CONTRASTS_WITH = 'contrasts-with', // Comparative understanding
  EXAMPLE_OF = 'example-of', // Concrete examples
  DERIVES_FROM = 'derives-from', // Mathematical/logical derivation
  APPLIED_IN = 'applied-in', // Practical application
  DEPENDS_ON = 'depends-on', // Dependency
}

/**
 * Source citation for edge/relationship
 */
export interface EdgeSourceCitation {
  url?: string;
  title?: string;
  retrievedAt: Date;
}

const edgeSourceCitationSchema = new Schema<EdgeSourceCitation>(
  {
    url: { type: String, required: false },
    title: { type: String, required: false },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Knowledge Edge Document (MongoDB)
 */
export interface KnowledgeEdge extends Document<KnowledgeEdgeIdType> {
  _id: KnowledgeEdgeIdType;

  /** The source node ID (where the edge starts) */
  sourceId: KnowledgeNodeIdType;

  /** The target node ID (where the edge ends) */
  targetId: KnowledgeNodeIdType;

  /** The type of relationship */
  type: string;

  /** Additional properties/attributes for this relationship */
  properties: Record<string, any>;

  /** Weight/strength of the relationship (0-1) */
  weight: number;

  /** Optional confidence score for the relationship (0-1) */
  confidence?: number;

  // === ICS-Specific Fields ===

  /** Equation or formula that describes this relationship (if applicable) */
  equation?: string;

  /** Explanation of why this relationship exists */
  rationale?: string;

  /** Sources/citations for this relationship */
  sources?: EdgeSourceCitation[];

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MongoDB Schema for Knowledge Edge
 */
export const KnowledgeEdgeSchema = new Schema<KnowledgeEdge>(
  {
    sourceId: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    properties: { type: Schema.Types.Mixed, required: true, default: {} },
    weight: { type: Number, required: true, default: 1.0, min: 0, max: 1 },
    confidence: { type: Number, required: false, min: 0, max: 1 },

    // ICS-specific fields
    equation: { type: String, required: false },
    rationale: { type: String, required: false },
    sources: { type: [edgeSourceCitationSchema], required: false, default: [] },
  },
  {
    timestamps: true,
    collection: 'knowledge_edges',
  },
);

// Compound indexes for efficient graph traversal
KnowledgeEdgeSchema.index({ sourceId: 1, type: 1 }); // Outgoing edges by type
KnowledgeEdgeSchema.index({ targetId: 1, type: 1 }); // Incoming edges by type
KnowledgeEdgeSchema.index({ sourceId: 1, targetId: 1 }); // Check edge existence

const KnowledgeEdgeModel = model<KnowledgeEdge>(
  'knowledge_edges',
  KnowledgeEdgeSchema,
);

export default KnowledgeEdgeModel;
