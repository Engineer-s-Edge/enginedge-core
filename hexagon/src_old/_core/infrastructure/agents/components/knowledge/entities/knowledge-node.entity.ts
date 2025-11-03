import { Schema, model, Document } from 'mongoose';
import { Embed } from '../../vectorstores/entities/store.entity';
import {
  KnowledgeNodeIdType,
  ExpertAgentIdType,
  GeniusAgentIdType,
} from '@core/infrastructure/database/utils/custom_types';

/**
 * ICS Layer levels for knowledge graph organization
 * L1 = Domain-level (broadest)
 * L2 = Category/Sub-domain
 * L3 = Specific topics
 * L4+ = Details, examples, edge cases
 */
export enum ICSLayer {
  L1_DOMAIN = 1,
  L2_CATEGORY = 2,
  L3_TOPIC = 3,
  L4_DETAIL = 4,
  L5_IMPLEMENTATION = 5,
  L6_EDGE_CASE = 6,
}

/**
 * Research status for knowledge graph nodes
 */
export enum ResearchStatus {
  UNRESEARCHED = 'unresearched', // Node created but not researched
  IN_PROGRESS = 'in_progress', // Currently being researched
  RESEARCHED = 'researched', // Deep research completed
  NEEDS_UPDATE = 'needs_update', // Marked for re-research
  DUBIOUS = 'dubious', // Marked as potentially incorrect
}

/**
 * Source citation for node information
 */
export interface SourceCitation {
  url?: string;
  title?: string;
  author?: string;
  retrievedAt: Date;
  sourceType: 'web' | 'academic' | 'document' | 'user' | 'llm';
}

const sourceCitationSchema = new Schema<SourceCitation>(
  {
    url: { type: String, required: false },
    title: { type: String, required: false },
    author: { type: String, required: false },
    retrievedAt: { type: Date, required: true },
    sourceType: {
      type: String,
      enum: ['web', 'academic', 'document', 'user', 'llm'],
      required: true,
    },
  },
  { _id: false },
);

/**
 * Research data gathered during SHOOT phase
 */
export interface ResearchData {
  summary?: string;
  keyPoints?: string[];
  examples?: string[];
  relatedConcepts?: string[]; // IDs of related nodes
  equations?: string[]; // LaTeX or plain text equations
}

const researchDataSchema = new Schema<ResearchData>(
  {
    summary: { type: String, required: false },
    keyPoints: { type: [String], required: false },
    examples: { type: [String], required: false },
    relatedConcepts: { type: [String], required: false },
    equations: { type: [String], required: false },
  },
  { _id: false },
);

/**
 * Node lock for concurrent access control
 */
export interface NodeLock {
  lockedBy: string; // Agent/user ID
  lockedAt: Date;
  reason: string;
}

const nodeLockSchema = new Schema<NodeLock>(
  {
    lockedBy: { type: String, required: true },
    lockedAt: { type: Date, required: true },
    reason: { type: String, required: true },
  },
  { _id: false },
);

/**
 * Modification record for audit trail
 * Tracks all changes made to a node by agents
 */
export interface ModificationRecord {
  timestamp: Date;
  agentId: ExpertAgentIdType | GeniusAgentIdType | string; // Can also be user ID
  agentType: 'expert' | 'genius' | 'user' | 'system';
  operationType: 'create' | 'update' | 'add-research' | 'skin' | 'validation';
  fieldsChanged: string[];
  previousValues?: Record<string, any>;
  description?: string;
}

const modificationRecordSchema = new Schema<ModificationRecord>(
  {
    timestamp: { type: Date, required: true },
    agentId: { type: String, required: true },
    agentType: {
      type: String,
      enum: ['expert', 'genius', 'user', 'system'],
      required: true,
    },
    operationType: {
      type: String,
      enum: ['create', 'update', 'add-research', 'skin', 'validation'],
      required: true,
    },
    fieldsChanged: { type: [String], required: true },
    previousValues: { type: Schema.Types.Mixed, required: false },
    description: { type: String, required: false },
  },
  { _id: false },
);

/**
 * Knowledge Node Document (MongoDB)
 */
export interface KnowledgeNode extends Document<KnowledgeNodeIdType> {
  _id: KnowledgeNodeIdType;

  /** The type of entity this node represents */
  type: string;

  /** The name or primary label for this node */
  label: string;

  /** Additional properties/attributes */
  properties: Record<string, any>;

  /** Optional embedding vector for semantic search */
  embedding?: Embed;

  /** Optional relevance/importance score (0-1) */
  relevance?: number;

  // === ICS-Specific Fields ===

  /** ICS layer level (L1-L6) for hierarchical organization */
  layer?: ICSLayer;

  /** Research status of this node */
  researchStatus?: ResearchStatus;

  /** Confidence score (0-1) based on source quality and user validation */
  confidence?: number;

  /** Number of users who have validated this information */
  validationCount?: number;

  /** Users who validated this node */
  validatedBy?: string[];

  /** Dubious reports */
  dubiousReports?: Array<{
    reportedBy: string;
    reportedAt: Date;
  }>;

  /** Citations/sources for this node's information */
  sources?: SourceCitation[];

  /** Research content (detailed information gathered during SHOOT phase) */
  researchData?: ResearchData;

  /** Lock information for concurrent access control */
  lock?: NodeLock;

  // === Genius Agent Fields ===

  /** Graph component ID for disjoint graph detection (union-find) */
  graphComponentId?: string;

  /** Last time this node was updated (separate from updatedAt for manual tracking) */
  lastUpdated?: Date;

  /** Source type of this node's information */
  sourceType?: 'expert' | 'news' | 'user' | 'import' | 'system';

  /** Links to news articles that contributed to this node */
  newsArticleIds?: string[];

  /** Audit trail of all modifications */
  modificationHistory?: ModificationRecord[];

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MongoDB Schema for Knowledge Node
 */
export const KnowledgeNodeSchema = new Schema<KnowledgeNode>(
  {
    type: { type: String, required: true, index: true },
    label: { type: String, required: true, index: true },
    properties: { type: Schema.Types.Mixed, required: true, default: {} },
    embedding: { type: Schema.Types.Mixed, required: false },
    relevance: { type: Number, required: false, min: 0, max: 1 },

    // ICS-specific fields
    layer: {
      type: Number,
      enum: Object.values(ICSLayer),
      required: false,
      index: true,
    },
    researchStatus: {
      type: String,
      enum: Object.values(ResearchStatus),
      required: false,
      index: true,
      default: ResearchStatus.UNRESEARCHED,
    },
    confidence: { type: Number, required: false, min: 0, max: 1, default: 0.5 },
    validationCount: { type: Number, required: false, default: 0 },
    validatedBy: { type: [String], required: false, default: [] },
    dubiousReports: {
      type: [
        {
          reportedBy: { type: String, required: true },
          reportedAt: { type: Date, required: true },
        },
      ],
      required: false,
      default: [],
    },
    sources: { type: [sourceCitationSchema], required: false, default: [] },
    researchData: { type: researchDataSchema, required: false },
    lock: { type: nodeLockSchema, required: false },

    // Genius Agent fields
    graphComponentId: { type: String, required: false },
    lastUpdated: { type: Date, required: false },
    sourceType: {
      type: String,
      enum: ['expert', 'news', 'user', 'import', 'system'],
      required: false,
    },
    newsArticleIds: { type: [String], required: false, default: [] },
    modificationHistory: {
      type: [modificationRecordSchema],
      required: false,
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'knowledge_nodes',
  },
);

// Indexes for efficient querying
KnowledgeNodeSchema.index({ label: 'text' }); // Text search on labels
KnowledgeNodeSchema.index({ type: 1, layer: 1 }); // Query by type and layer
KnowledgeNodeSchema.index({ researchStatus: 1, layer: 1 }); // Find unresearched nodes
KnowledgeNodeSchema.index({ confidence: -1 }); // Sort by confidence
KnowledgeNodeSchema.index({ graphComponentId: 1 }); // Find nodes in same component
KnowledgeNodeSchema.index({ sourceType: 1 }); // Filter by source type

const KnowledgeNodeModel = model<KnowledgeNode>(
  'knowledge_nodes',
  KnowledgeNodeSchema,
);

export default KnowledgeNodeModel;
