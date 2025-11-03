import { Injectable, Inject } from '@nestjs/common';
import { KnowledgeNodeRepository } from '../repositories/knowledge-node.repository';
import { KnowledgeEdgeRepository } from '../repositories/knowledge-edge.repository';
import { KnowledgeNode } from '../entities/knowledge-node.entity';
import {
  KnowledgeEdge,
  EdgeType,
} from '../entities/knowledge-edge.entity';
import {
  GraphPath,
  ConceptRelationship,
  PrerequisiteChain,
} from '../entities/graph-types.entity';
import { KnowledgeNodeIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class GraphAlgorithmsService {
  constructor(
    @Inject(KnowledgeNodeRepository)
    private readonly nodeRepository: KnowledgeNodeRepository,
    @Inject(KnowledgeEdgeRepository)
    private readonly edgeRepository: KnowledgeEdgeRepository,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'GraphAlgorithmsService initializing',
      GraphAlgorithmsService.name,
    );
  }

  /**
   * Find all paths connecting two concepts (for "how are X and Y related?")
   */
  async findConceptRelationship(
    conceptAId: KnowledgeNodeIdType,
    conceptBId: KnowledgeNodeIdType,
    maxPaths: number = 5,
    maxDepth: number = 6,
  ): Promise<ConceptRelationship | null> {
    try {
      const [nodeA, nodeB] = await Promise.all([
        this.nodeRepository.findById(conceptAId),
        this.nodeRepository.findById(conceptBId),
      ]);

      if (!nodeA || !nodeB) {
        this.logger.warn(
          `One or both concepts not found: ${conceptAId}, ${conceptBId}`,
          GraphAlgorithmsService.name,
        );
        return null;
      }

      this.logger.info(
        `Finding relationship between "${nodeA.label}" and "${nodeB.label}"`,
        GraphAlgorithmsService.name,
      );

      // Check for direct edge
      const directEdge = await this.edgeRepository.findEdgeBetween(
        conceptAId,
        conceptBId,
      );

      // Find all paths using DFS
      const allPaths: GraphPath[] = [];
      const visited = new Set<string>();

      const dfs = async (
        currentId: KnowledgeNodeIdType,
        path: GraphPath,
        depth: number,
      ) => {
        if (depth > maxDepth || allPaths.length >= maxPaths) return;
        if (visited.has(currentId)) return;

        if (currentId === conceptBId && path.nodes.length > 1) {
          allPaths.push({ ...path });
          return;
        }

        visited.add(currentId);

        const outEdges = await this.edgeRepository.findBySource(currentId);
        for (const edge of outEdges) {
          const targetNode = await this.nodeRepository.findById(edge.targetId);
          if (!targetNode) continue;

          await dfs(
            edge.targetId,
            {
              nodes: [...path.nodes, targetNode],
              edges: [...path.edges, edge],
              pathCost: path.pathCost + (1 - edge.weight),
            },
            depth + 1,
          );
        }

        visited.delete(currentId);
      };

      await dfs(
        conceptAId,
        {
          nodes: [nodeA],
          edges: [],
          pathCost: 0,
        },
        0,
      );

      // Find common ancestors
      const [ancestorsA, ancestorsB] = await Promise.all([
        this.findAncestors(conceptAId, [EdgeType.IS_A, EdgeType.PART_OF]),
        this.findAncestors(conceptBId, [EdgeType.IS_A, EdgeType.PART_OF]),
      ]);

      const commonAncestors = ancestorsA.filter((a) =>
        ancestorsB.some((b) => b._id === a._id),
      );

      // Find shortest path
      const shortestPath =
        allPaths.length > 0
          ? allPaths.reduce((shortest, current) =>
              current.pathCost < shortest.pathCost ? current : shortest,
            )
          : undefined;

      return {
        conceptA: conceptAId,
        conceptB: conceptBId,
        paths: allPaths,
        commonAncestors,
        directEdge: directEdge || undefined,
        shortestPath,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding concept relationship: ${info.message}`,
        GraphAlgorithmsService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find all ancestor nodes (following is-a and part-of edges upward)
   */
  async findAncestors(
    nodeId: KnowledgeNodeIdType,
    edgeTypes: EdgeType[] = [EdgeType.IS_A, EdgeType.PART_OF],
  ): Promise<KnowledgeNode[]> {
    const ancestors: KnowledgeNode[] = [];
    const visited = new Set<string>();
    const queue: KnowledgeNodeIdType[] = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const outEdges = await this.edgeRepository.findBySource(currentId);
      for (const edge of outEdges) {
        if (edgeTypes.includes(edge.type as EdgeType)) {
          const ancestor = await this.nodeRepository.findById(edge.targetId);
          if (ancestor && !visited.has(ancestor._id)) {
            ancestors.push(ancestor);
            queue.push(ancestor._id);
          }
        }
      }
    }

    return ancestors;
  }

  /**
   * Build prerequisite chain for learning a concept (in order)
   */
  async buildPrerequisiteChain(
    conceptId: KnowledgeNodeIdType,
  ): Promise<PrerequisiteChain | null> {
    try {
      const target = await this.nodeRepository.findById(conceptId);
      if (!target) {
        this.logger.warn(
          `Concept not found: ${conceptId}`,
          GraphAlgorithmsService.name,
        );
        return null;
      }

      this.logger.info(
        `Building prerequisite chain for "${target.label}"`,
        GraphAlgorithmsService.name,
      );

      const prerequisites: KnowledgeNode[] = [];
      const edges: KnowledgeEdge[] = [];
      const visited = new Set<string>();

      // DFS to collect all prerequisites
      const collectPrereqs = async (nodeId: KnowledgeNodeIdType) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const inEdges = await this.edgeRepository.findByTarget(nodeId);
        for (const edge of inEdges) {
          if (
            edge.type === EdgeType.PREREQUISITE_FOR ||
            edge.type === EdgeType.DEPENDS_ON
          ) {
            const prereqNode = await this.nodeRepository.findById(
              edge.sourceId,
            );
            if (prereqNode) {
              await collectPrereqs(edge.sourceId);
              if (!prerequisites.find((p) => p._id === prereqNode._id)) {
                prerequisites.push(prereqNode);
                edges.push(edge);
              }
            }
          }
        }
      };

      await collectPrereqs(conceptId);

      // Topological sort to get learning order
      const sorted = await this.topologicalSort(
        prerequisites.map((p) => p._id),
      );

      const sortedPrereqs = sorted
        .map((id) => prerequisites.find((p) => p._id === id))
        .filter((p): p is KnowledgeNode => p !== undefined);

      return {
        targetConcept: target,
        prerequisites: sortedPrereqs,
        edges,
        complexity: prerequisites.length,
      };
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error building prerequisite chain: ${info.message}`,
        GraphAlgorithmsService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Topological sort of nodes (for ordering prerequisites)
   */
  private async topologicalSort(
    nodeIds: KnowledgeNodeIdType[],
  ): Promise<KnowledgeNodeIdType[]> {
    const sorted: KnowledgeNodeIdType[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = async (id: KnowledgeNodeIdType) => {
      if (temp.has(id)) {
        // Cycle detected
        this.logger.warn(
          `Cycle detected in prerequisite chain at node: ${id}`,
          GraphAlgorithmsService.name,
        );
        return;
      }
      if (visited.has(id)) return;

      temp.add(id);

      const outEdges = await this.edgeRepository.findBySource(id);
      for (const edge of outEdges) {
        if (
          (edge.type === EdgeType.PREREQUISITE_FOR ||
            edge.type === EdgeType.DEPENDS_ON) &&
          nodeIds.includes(edge.targetId)
        ) {
          await visit(edge.targetId);
        }
      }

      temp.delete(id);
      visited.add(id);
      sorted.unshift(id); // Add to front for reverse topological order
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        await visit(id);
      }
    }

    return sorted;
  }

  /**
   * Find related concepts (concepts connected by relates-to, example-of, etc.)
   */
  async findRelatedConcepts(
    conceptId: KnowledgeNodeIdType,
    maxResults: number = 10,
  ): Promise<
    Array<{
      node: KnowledgeNode;
      edge: KnowledgeEdge;
      relationshipType: string;
    }>
  > {
    try {
      const related: Array<{
        node: KnowledgeNode;
        edge: KnowledgeEdge;
        relationshipType: string;
      }> = [];

      const [outEdges, inEdges] = await Promise.all([
        this.edgeRepository.findBySource(conceptId),
        this.edgeRepository.findByTarget(conceptId),
      ]);

      const relevantTypes = [
        EdgeType.RELATES_TO,
        EdgeType.EXAMPLE_OF,
        EdgeType.CONTRASTS_WITH,
        EdgeType.APPLIED_IN,
      ];

      for (const edge of [...outEdges, ...inEdges]) {
        if (relevantTypes.includes(edge.type as EdgeType)) {
          const targetId =
            edge.sourceId === conceptId ? edge.targetId : edge.sourceId;
          const node = await this.nodeRepository.findById(targetId);
          if (node) {
            related.push({
              node,
              edge,
              relationshipType: edge.type,
            });
          }
        }
      }

      // Sort by edge weight/confidence
      related.sort((a, b) => (b.edge.confidence || 0) - (a.edge.confidence || 0));

      return related.slice(0, maxResults);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding related concepts: ${info.message}`,
        GraphAlgorithmsService.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Find all descendant nodes (following edges downward)
   */
  async findDescendants(
    nodeId: KnowledgeNodeIdType,
    edgeTypes: EdgeType[] = [EdgeType.IS_A, EdgeType.PART_OF],
  ): Promise<KnowledgeNode[]> {
    const descendants: KnowledgeNode[] = [];
    const visited = new Set<string>();
    const queue: KnowledgeNodeIdType[] = [nodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const inEdges = await this.edgeRepository.findByTarget(currentId);
      for (const edge of inEdges) {
        if (edgeTypes.includes(edge.type as EdgeType)) {
          const descendant = await this.nodeRepository.findById(edge.sourceId);
          if (descendant && !visited.has(descendant._id)) {
            descendants.push(descendant);
            queue.push(descendant._id);
          }
        }
      }
    }

    return descendants;
  }
}
