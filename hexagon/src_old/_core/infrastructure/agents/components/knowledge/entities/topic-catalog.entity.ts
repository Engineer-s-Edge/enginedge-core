import { Schema, model, Document } from 'mongoose';
import {
  TopicIdType,
  KnowledgeNodeIdType,
  ExpertAgentIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { ICSLayer } from './knowledge-node.entity';

/**
 * Topic Status enum
 * Tracks the current state of a topic in the catalog
 */
export enum TopicStatus {
  NOT_STARTED = 'not-started',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  NEEDS_REFRESH = 'needs-refresh',
  BLOCKED = 'blocked', // Prerequisites not met
  USER_ESCALATED = 'user-escalated', // Waiting for user input
}

/**
 * Topic Catalog Entry
 * 
 * Represents a topic that can be researched by the Genius Agent.
 * Topics can come from Wikipedia, Wikidata, or organic discovery by Expert Agents.
 */
export interface TopicCatalogEntry extends Document {
  _id: TopicIdType;

  /** The name/title of the topic */
  name: string;

  /** Primary category (e.g., "Physics", "Computer Science", "Biology") */
  category: string;

  /** Subcategories for more specific classification */
  subcategories: string[];

  /** Estimated ICS layer complexity (1-6) */
  estimatedComplexity: ICSLayer;

  /** Prerequisite topics that should be researched first */
  prerequisiteTopics: TopicIdType[];

  /** Current research status */
  status: TopicStatus;

  /** Link to knowledge graph node if researched */
  knowledgeNodeId?: KnowledgeNodeIdType;

  /** When this topic was last updated */
  lastUpdated?: Date;

  /** Where this topic came from */
  sourceType: 'wikipedia' | 'wikidata' | 'organic' | 'user' | 'curated';

  /** External identifiers for linking to source */
  externalIds?: {
    wikipediaUrl?: string;
    wikipediaPageId?: number;
    wikidataId?: string; // e.g., "Q652"
  };

  /** Categories this topic bridges/connects to */
  relatedCategories: string[];

  /** Calculated research priority (0-100) */
  researchPriority: number;

  /** Agent that discovered this topic (for organic discovery) */
  discoveredBy?: ExpertAgentIdType;

  /** When this topic was discovered */
  discoveredAt?: Date;

  /** Metadata about the topic */
  metadata?: {
    description?: string;
    keywords?: string[];
    estimatedResearchTime?: number; // Minutes
    difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MongoDB Schema for Topic Catalog Entry
 */
export const TopicCatalogEntrySchema = new Schema<TopicCatalogEntry>(
  {
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    subcategories: { type: [String], required: true, default: [] },
    estimatedComplexity: {
      type: Number,
      enum: Object.values(ICSLayer),
      required: true,
      default: ICSLayer.L3_TOPIC,
    },
    prerequisiteTopics: { type: [String], required: true, default: [] },
    status: {
      type: String,
      enum: Object.values(TopicStatus),
      required: true,
      default: TopicStatus.NOT_STARTED,
      index: true,
    },
    knowledgeNodeId: { type: String, required: false, index: true },
    lastUpdated: { type: Date, required: false },
    sourceType: {
      type: String,
      enum: ['wikipedia', 'wikidata', 'organic', 'user', 'curated'],
      required: true,
    },
    externalIds: {
      type: {
        wikipediaUrl: { type: String, required: false },
        wikipediaPageId: { type: Number, required: false },
        wikidataId: { type: String, required: false },
      },
      required: false,
    },
    relatedCategories: { type: [String], required: true, default: [] },
    researchPriority: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
      max: 100,
      index: true,
    },
    discoveredBy: { type: String, required: false },
    discoveredAt: { type: Date, required: false },
    metadata: {
      type: {
        description: { type: String, required: false },
        keywords: { type: [String], required: false },
        estimatedResearchTime: { type: Number, required: false },
        difficulty: {
          type: String,
          enum: ['beginner', 'intermediate', 'advanced', 'expert'],
          required: false,
        },
      },
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'topic_catalog',
  },
);

// Indexes for efficient querying
TopicCatalogEntrySchema.index({ name: 'text' }); // Text search
TopicCatalogEntrySchema.index({ status: 1, researchPriority: -1 }); // Find high-priority unresearched
TopicCatalogEntrySchema.index({ category: 1, status: 1 }); // Filter by category and status
TopicCatalogEntrySchema.index({ sourceType: 1 }); // Filter by source
TopicCatalogEntrySchema.index({ 'externalIds.wikidataId': 1 }); // Lookup by Wikidata ID

const TopicCatalogModel = model<TopicCatalogEntry>(
  'topic_catalog',
  TopicCatalogEntrySchema,
);

export default TopicCatalogModel;
