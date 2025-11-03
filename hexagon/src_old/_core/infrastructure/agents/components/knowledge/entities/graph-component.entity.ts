import { Schema, model, Document } from 'mongoose';
import { KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';

/**
 * Graph Component Entity
 * 
 * Tracks disconnected subgraphs in the knowledge graph for the Genius Agent.
 * Uses union-find concept to efficiently detect and merge disjoint components.
 */
export interface GraphComponent extends Document {
  _id: string; // UUID for the component

  /** Number of nodes in this component */
  nodeCount: number;

  /** Number of edges connecting nodes in this component */
  edgeCount: number;

  /** Dominant categories in this component */
  categories: string[];

  /** Representative nodes for quick component identification (5-10 key nodes) */
  representativeNodes: KnowledgeNodeIdType[];

  /** Last time this component was merged with another */
  lastMerged?: Date;

  /** Component ID this was merged into (if merged) */
  mergedInto?: string;

  /** Whether this component is active or has been merged */
  isActive: boolean;

  /** Metadata about the component */
  metadata?: {
    dominantDomain?: string; // Primary subject area
    avgConfidence?: number; // Average confidence of nodes
    researchProgress?: number; // % of nodes researched
  };

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MongoDB Schema for Graph Component
 */
export const GraphComponentSchema = new Schema<GraphComponent>(
  {
    _id: { type: String, required: true }, // UUID
    nodeCount: { type: Number, required: true, default: 0, min: 0 },
    edgeCount: { type: Number, required: true, default: 0, min: 0 },
    categories: { type: [String], required: true, default: [] },
    representativeNodes: { type: [String], required: true, default: [] },
    lastMerged: { type: Date, required: false },
    mergedInto: { type: String, required: false },
    isActive: { type: Boolean, required: true, default: true },
    metadata: {
      type: {
        dominantDomain: { type: String, required: false },
        avgConfidence: { type: Number, required: false, min: 0, max: 1 },
        researchProgress: { type: Number, required: false, min: 0, max: 1 },
      },
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'graph_components',
  },
);

// Indexes for efficient querying
GraphComponentSchema.index({ isActive: 1, nodeCount: -1 }); // Find active components
GraphComponentSchema.index({ categories: 1, isActive: 1 }); // Find by category
GraphComponentSchema.index({ mergedInto: 1 }); // Track merge history

const GraphComponentModel = model<GraphComponent>(
  'graph_components',
  GraphComponentSchema,
);

export default GraphComponentModel;
