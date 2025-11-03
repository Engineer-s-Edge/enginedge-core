import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveArtifact, CollectiveArtifactDocument } from '../entities/collective-artifact.entity';
import { CollectiveTask, CollectiveTaskDocument } from '../entities/collective-task.entity';
import { CollectiveConversation, CollectiveConversationDocument } from '../entities/collective-conversation.entity';
import { ArtifactSearchService } from './artifact-search.service';
import { ArtifactVersioningService } from './artifact-versioning.service';

/**
 * SharedMemoryService
 * 
 * Organizes collective knowledge and provides context retrieval for agents.
 * 
 * Features:
 * - Knowledge base organization (hierarchical structure)
 * - Context retrieval for specific tasks
 * - Related artifact discovery
 * - Memory consolidation (merge related artifacts)
 * - Knowledge graph building
 * 
 * Use Cases:
 * - Agent working on task needs related context
 * - PM reviewing collective knowledge base
 * - Finding gaps in collective knowledge
 * - Consolidating duplicate information
 * - Building agent memory for task execution
 */
@Injectable()
export class SharedMemoryService {
  private readonly logger = new Logger(SharedMemoryService.name);

  // Knowledge graph (in production, use graph database)
  private readonly knowledgeGraph = new Map<string, KnowledgeNode>();
  private readonly artifactRelations = new Map<string, ArtifactRelation[]>();

  constructor(
    @InjectModel(CollectiveArtifact.name) private artifactModel: Model<CollectiveArtifactDocument>,
    @InjectModel(CollectiveTask.name) private taskModel: Model<CollectiveTaskDocument>,
    @InjectModel(CollectiveConversation.name) private conversationModel: Model<CollectiveConversationDocument>,
    private readonly searchService: ArtifactSearchService,
    private readonly versioningService: ArtifactVersioningService,
  ) {
    // Build initial knowledge graph
    this.buildKnowledgeGraph();
  }

  /**
   * Get context for a specific task.
   * Returns relevant artifacts, related tasks, and conversation history.
   */
  async getTaskContext(
    collectiveId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
  ): Promise<TaskContext> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    this.logger.log(`Retrieving context for task ${taskId}`);

    // Get related artifacts
    const relatedArtifacts = await this.findRelatedArtifacts(task);

    // Get parent and child tasks
    const parentTask = task.parentTaskId 
      ? await this.taskModel.findById(task.parentTaskId) 
      : null;
    const childTasks = await this.taskModel.find({ parentTaskId: taskId }).exec();

    // Get conversation history
    const conversation = task.conversationId
      ? await this.conversationModel.findById(task.conversationId)
      : null;

    // Get dependency tasks
    const dependencyTasks = await this.taskModel
      .find({ _id: { $in: task.dependencies } })
      .exec();

    return {
      task,
      relatedArtifacts,
      parentTask,
      childTasks,
      conversation,
      dependencyTasks,
      summary: this.buildContextSummary({
        task,
        relatedArtifacts,
        parentTask,
        childTasks,
        conversation,
        dependencyTasks,
      }),
    };
  }

  /**
   * Get collective memory summary.
   */
  async getCollectiveMemory(
    collectiveId: string | Types.ObjectId,
  ): Promise<CollectiveMemory> {
    // Get all artifacts
    const artifacts = await this.artifactModel.find({ collectiveId }).exec();

    // Organize by type
    const byType = new Map<string, CollectiveArtifactDocument[]>();
    for (const artifact of artifacts) {
      const list = byType.get(artifact.type) || [];
      list.push(artifact);
      byType.set(artifact.type, list);
    }

    // Build knowledge areas
    const knowledgeAreas = this.identifyKnowledgeAreas(artifacts);

    // Find knowledge gaps
    const gaps = await this.identifyKnowledgeGaps(collectiveId, artifacts);

    // Get frequently accessed artifacts
    const frequentlyAccessed = await this.searchService.getMostAccessed(collectiveId, 10);

    return {
      totalArtifacts: artifacts.length,
      byType: Object.fromEntries(
        Array.from(byType.entries()).map(([type, list]) => [type, list.length]),
      ),
      knowledgeAreas,
      knowledgeGaps: gaps,
      frequentlyAccessed,
      recentActivity: await this.getRecentMemoryActivity(collectiveId),
    };
  }

  /**
   * Find artifacts related to a task.
   */
  async findRelatedArtifacts(
    task: CollectiveTaskDocument,
  ): Promise<CollectiveArtifactDocument[]> {
    // Search by task description keywords
    const keywords = this.extractTaskKeywords(task);
    const searchResults = await this.searchService.search(
      keywords.join(' '),
      {
        collectiveId: task.collectiveId,
        limit: 10,
      },
    );

    const taskId = task._id as Types.ObjectId;

    // Also check artifacts directly linked to task
    const linkedArtifacts = await this.artifactModel
      .find({
        collectiveId: task.collectiveId,
        linkedTasks: taskId,
      })
      .exec();

    // Combine and deduplicate
    const allArtifacts = [
      ...searchResults.map(r => r.artifact),
      ...linkedArtifacts,
    ];

    const uniqueArtifacts = Array.from(
      new Map(allArtifacts.map(a => [(a._id as Types.ObjectId).toString(), a])).values(),
    );

    return uniqueArtifacts;
  }

  /**
   * Link an artifact to a task.
   */
  async linkArtifactToTask(
    artifactId: string | Types.ObjectId,
    taskId: string | Types.ObjectId,
  ): Promise<void> {
    await this.artifactModel.findByIdAndUpdate(artifactId, {
      $addToSet: { linkedTasks: taskId },
    });

    this.logger.log(`Linked artifact ${artifactId} to task ${taskId}`);

    // Update knowledge graph
    this.addArtifactRelation(artifactId.toString(), taskId.toString(), 'linked_to_task');
  }

  /**
   * Find similar artifacts (for consolidation).
   */
  async findSimilarArtifacts(
    artifactId: string | Types.ObjectId,
    similarityThreshold: number = 0.7,
  ): Promise<Array<{ artifact: CollectiveArtifactDocument; similarity: number }>> {
    const results = await this.searchService.findSimilar(artifactId, 10);
    
    // Calculate similarity scores (simple implementation)
    const scored = results.map(result => ({
      artifact: result.artifact,
      similarity: Math.min(1, result.score / 10), // Normalize to 0-1
    }));

    // Filter by threshold
    return scored.filter(s => s.similarity >= similarityThreshold);
  }

  /**
   * Consolidate similar artifacts into one.
   */
  async consolidateArtifacts(
    targetArtifactId: string | Types.ObjectId,
    sourceArtifactIds: Array<string | Types.ObjectId>,
    agentId: string,
  ): Promise<CollectiveArtifactDocument> {
    const target = await this.artifactModel.findById(targetArtifactId);
    if (!target) {
      throw new Error('Target artifact not found');
    }

    this.logger.log(
      `Consolidating ${sourceArtifactIds.length} artifacts into ${targetArtifactId}`,
    );

    // Merge content from source artifacts
    let mergedContent = target.content + '\n\n';

    for (const sourceId of sourceArtifactIds) {
      const source = await this.artifactModel.findById(sourceId);
      if (source) {
        mergedContent += `\n--- From ${source.name} ---\n`;
        mergedContent += source.content + '\n';
      }
    }

    // Create new version with merged content
    await this.versioningService.createVersion(
      targetArtifactId,
      mergedContent,
      agentId,
      `Consolidated ${sourceArtifactIds.length} related artifacts`,
    );

    // Delete source artifacts (optional - could archive instead)
    // await this.artifactModel.deleteMany({ _id: { $in: sourceArtifactIds } });

    return (await this.artifactModel.findById(targetArtifactId))!;
  }

  /**
   * Get knowledge graph for visualization.
   */
  getKnowledgeGraph(collectiveId: string | Types.ObjectId): {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
  } {
    const nodes: KnowledgeNode[] = [];
    const edges: KnowledgeEdge[] = [];

    // Get nodes for this collective
    for (const [_id, node] of this.knowledgeGraph.entries()) {
      if (node.collectiveId === collectiveId.toString()) {
        nodes.push(node);
      }
    }

    // Get edges (artifact relations)
    for (const [artifactId, relations] of this.artifactRelations.entries()) {
      for (const relation of relations) {
        edges.push({
          from: artifactId,
          to: relation.relatedArtifactId,
          type: relation.type,
          strength: relation.strength,
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Add a node to the knowledge graph.
   */
  addKnowledgeNode(
    id: string,
    type: 'artifact' | 'task' | 'concept',
    collectiveId: string,
    metadata: any,
  ): void {
    this.knowledgeGraph.set(id, {
      id,
      type,
      collectiveId,
      metadata,
      connections: [],
    });
  }

  /**
   * Add a relation between artifacts.
   */
  addArtifactRelation(
    artifactId: string,
    relatedId: string,
    type: string,
    strength: number = 1,
  ): void {
    const relations = this.artifactRelations.get(artifactId) || [];
    relations.push({
      relatedArtifactId: relatedId,
      type,
      strength,
      createdAt: new Date(),
    });
    this.artifactRelations.set(artifactId, relations);
  }

  /**
   * Build context summary from various sources.
   */
  private buildContextSummary(context: {
    task: CollectiveTaskDocument;
    relatedArtifacts: CollectiveArtifactDocument[];
    parentTask: CollectiveTaskDocument | null;
    childTasks: CollectiveTaskDocument[];
    conversation: CollectiveConversationDocument | null;
    dependencyTasks: CollectiveTaskDocument[];
  }): string {
    let summary = `# Context for Task: ${context.task.title}\n\n`;

    // Task hierarchy
    if (context.parentTask) {
      summary += `**Parent Task:** ${context.parentTask.title}\n`;
    }
    if (context.childTasks.length > 0) {
      summary += `**Child Tasks:** ${context.childTasks.length}\n`;
    }

    // Dependencies
    if (context.dependencyTasks.length > 0) {
      summary += `\n## Dependencies (${context.dependencyTasks.length})\n`;
      for (const dep of context.dependencyTasks) {
        summary += `- ${dep.title} (${dep.state})\n`;
      }
    }

    // Related artifacts
    if (context.relatedArtifacts.length > 0) {
      summary += `\n## Related Artifacts (${context.relatedArtifacts.length})\n`;
      for (const artifact of context.relatedArtifacts.slice(0, 5)) {
        summary += `- ${artifact.name} (${artifact.type})\n`;
      }
    }

    // Conversation summary
    if (context.conversation) {
      summary += `\n## Conversation History\n`;
      summary += `${context.conversation.messages.length} messages in conversation\n`;
    }

    return summary;
  }

  /**
   * Extract keywords from task for searching.
   */
  private extractTaskKeywords(task: CollectiveTaskDocument): string[] {
    // Note: acceptanceCriteria property doesn't exist on CollectiveTaskDocument
    const text = `${task.title} ${task.description || ''}`;
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Remove duplicates
    return [...new Set(words)];
  }

  /**
   * Identify knowledge areas (categories/topics).
   */
  private identifyKnowledgeAreas(
    artifacts: CollectiveArtifactDocument[],
  ): Array<{ area: string; count: number }> {
    // Group by tags
    const tagCounts = new Map<string, number>();
    
    for (const artifact of artifacts) {
      for (const tag of artifact.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Identify knowledge gaps.
   */
  private async identifyKnowledgeGaps(
    collectiveId: string | Types.ObjectId,
    _artifacts: CollectiveArtifactDocument[],
  ): Promise<string[]> {
    const gaps: string[] = [];

    // Get all tasks
    const tasks = await this.taskModel.find({ collectiveId }).exec();

    for (const task of tasks) {
      const related = await this.findRelatedArtifacts(task);
      if (related.length === 0) {
        gaps.push(task.title);
      }
    }

    return gaps;
  }

  /**
   * Get recent memory activity.
   */
  private async getRecentMemoryActivity(
    collectiveId: string | Types.ObjectId,
  ): Promise<Array<{ type: string; description: string; timestamp: Date }>> {
    const recentArtifacts = await this.searchService.getRecentlyUpdated(collectiveId, 5);

    return recentArtifacts.map(artifact => ({
      type: 'artifact_updated',
      description: `${artifact.name} updated`,
      timestamp: artifact.updatedAt,
    }));
  }

  /**
   * Build initial knowledge graph from existing data.
   */
  private async buildKnowledgeGraph(): Promise<void> {
    this.logger.log('Building knowledge graph...');

    const artifacts = await this.artifactModel.find().exec();

    for (const artifact of artifacts) {
      const artifactId = artifact._id as Types.ObjectId;
      this.addKnowledgeNode(
        artifactId.toString(),
        'artifact',
        artifact.collectiveId.toString(),
        {
          name: artifact.name,
          type: artifact.type,
          tags: artifact.tags,
        },
      );
    }

    this.logger.log(`Built knowledge graph with ${artifacts.length} nodes`);
  }
}

interface TaskContext {
  task: CollectiveTaskDocument;
  relatedArtifacts: CollectiveArtifactDocument[];
  parentTask: CollectiveTaskDocument | null;
  childTasks: CollectiveTaskDocument[];
  conversation: CollectiveConversationDocument | null;
  dependencyTasks: CollectiveTaskDocument[];
  summary: string;
}

interface CollectiveMemory {
  totalArtifacts: number;
  byType: Record<string, number>;
  knowledgeAreas: Array<{ area: string; count: number }>;
  knowledgeGaps: string[];
  frequentlyAccessed: CollectiveArtifactDocument[];
  recentActivity: Array<{ type: string; description: string; timestamp: Date }>;
}

interface KnowledgeNode {
  id: string;
  type: 'artifact' | 'task' | 'concept';
  collectiveId: string;
  metadata: any;
  connections: string[];
}

interface KnowledgeEdge {
  from: string;
  to: string;
  type: string;
  strength: number;
}

interface ArtifactRelation {
  relatedArtifactId: string;
  type: string;
  strength: number;
  createdAt: Date;
}
