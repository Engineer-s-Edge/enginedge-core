/**
 * Graph validation utilities for GraphAgent
 * Provides cycle detection, validation, and graph structure analysis
 */

import { Node, Edge } from '../types/agent.entity';
import { NodeIdType, EdgeIdType } from '@core/infrastructure/database/utils/custom_types';

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  hasCycles: boolean;
  cycles: NodeIdType[][];
  orphanedNodes: NodeIdType[];
  unreachableNodes: NodeIdType[];
}

export class GraphValidator {
  /**
   * Perform comprehensive graph validation
   */
  static validate(nodes: Node[], edges: Edge[]): GraphValidationResult {
    const result: GraphValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      hasCycles: false,
      cycles: [],
      orphanedNodes: [],
      unreachableNodes: [],
    };

    // Basic validation
    if (!nodes || nodes.length === 0) {
      result.errors.push('Graph must have at least one node');
      result.isValid = false;
      return result;
    }

    // Check for duplicate node IDs
    const nodeIds = new Set<NodeIdType>();
    for (const node of nodes) {
      if (nodeIds.has(node._id)) {
        result.errors.push(`Duplicate node ID: ${node._id}`);
        result.isValid = false;
      }
      nodeIds.add(node._id);
    }

    // Check for duplicate edge IDs
    const edgeIds = new Set<EdgeIdType>();
    for (const edge of edges) {
      if (edgeIds.has(edge._id)) {
        result.errors.push(`Duplicate edge ID: ${edge._id}`);
        result.isValid = false;
      }
      edgeIds.add(edge._id);
    }

    // Validate edge references
    for (const edge of edges) {
      if (!nodeIds.has(edge.from)) {
        result.errors.push(`Edge ${edge._id} references non-existent source node: ${edge.from}`);
        result.isValid = false;
      }
      if (!nodeIds.has(edge.to)) {
        result.errors.push(`Edge ${edge._id} references non-existent target node: ${edge.to}`);
        result.isValid = false;
      }
    }

    // Detect cycles
    const cycleDetectionResult = this.detectCycles(nodes, edges);
    result.hasCycles = cycleDetectionResult.hasCycles;
    result.cycles = cycleDetectionResult.cycles;

    if (result.hasCycles) {
      result.warnings.push(
        `Graph contains ${result.cycles.length} cycle(s). This may cause infinite execution loops.`
      );
      for (let i = 0; i < result.cycles.length; i++) {
        result.warnings.push(
          `Cycle ${i + 1}: ${result.cycles[i].join(' → ')} → ${result.cycles[i][0]}`
        );
      }
    }

    // Find orphaned nodes (no incoming or outgoing edges)
    result.orphanedNodes = this.findOrphanedNodes(nodes, edges);
    if (result.orphanedNodes.length > 0) {
      result.warnings.push(
        `Found ${result.orphanedNodes.length} orphaned node(s) with no edges: ${result.orphanedNodes.join(', ')}`
      );
    }

    // Find unreachable nodes
    result.unreachableNodes = this.findUnreachableNodes(nodes, edges);
    if (result.unreachableNodes.length > 0) {
      result.warnings.push(
        `Found ${result.unreachableNodes.length} unreachable node(s): ${result.unreachableNodes.join(', ')}`
      );
    }

    // Check for start nodes (nodes with commands or no incoming edges)
    const startNodes = this.findStartNodes(nodes, edges);
    if (startNodes.length === 0) {
      result.warnings.push(
        'No start nodes found. Graph may not execute without explicit node selection.'
      );
    }

    return result;
  }

  /**
   * Detect cycles in the graph using DFS
   * Returns all cycles found in the graph
   */
  static detectCycles(nodes: Node[], edges: Edge[]): { hasCycles: boolean; cycles: NodeIdType[][] } {
    const adjacencyList = this.buildAdjacencyList(nodes, edges);
    const visited = new Set<NodeIdType>();
    const recursionStack = new Set<NodeIdType>();
    const cycles: NodeIdType[][] = [];
    const currentPath: NodeIdType[] = [];

    const dfs = (nodeId: NodeIdType): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      currentPath.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle - extract the cycle from currentPath
          const cycleStartIndex = currentPath.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            const cycle = currentPath.slice(cycleStartIndex);
            cycles.push(cycle);
          }
        }
      }

      currentPath.pop();
      recursionStack.delete(nodeId);
    };

    // Run DFS from each unvisited node
    for (const node of nodes) {
      if (!visited.has(node._id)) {
        dfs(node._id);
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycles,
    };
  }

  /**
   * Build adjacency list representation of the graph
   */
  private static buildAdjacencyList(nodes: Node[], edges: Edge[]): Map<NodeIdType, NodeIdType[]> {
    const adjacencyList = new Map<NodeIdType, NodeIdType[]>();

    // Initialize with empty arrays for all nodes
    for (const node of nodes) {
      adjacencyList.set(node._id, []);
    }

    // Add edges
    for (const edge of edges) {
      const neighbors = adjacencyList.get(edge.from) || [];
      neighbors.push(edge.to);
      adjacencyList.set(edge.from, neighbors);
    }

    return adjacencyList;
  }

  /**
   * Find nodes with no incoming or outgoing edges
   */
  static findOrphanedNodes(nodes: Node[], edges: Edge[]): NodeIdType[] {
    const nodesWithEdges = new Set<NodeIdType>();

    for (const edge of edges) {
      nodesWithEdges.add(edge.from);
      nodesWithEdges.add(edge.to);
    }

    return nodes
      .filter((node) => !nodesWithEdges.has(node._id))
      .map((node) => node._id);
  }

  /**
   * Find nodes that are not reachable from any start node
   */
  static findUnreachableNodes(nodes: Node[], edges: Edge[]): NodeIdType[] {
    const startNodes = this.findStartNodes(nodes, edges);
    if (startNodes.length === 0) {
      // If no start nodes, consider all nodes as potentially unreachable
      return [];
    }

    const reachable = new Set<NodeIdType>();
    const adjacencyList = this.buildAdjacencyList(nodes, edges);

    const dfs = (nodeId: NodeIdType): void => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }
    };

    // Run DFS from all start nodes
    for (const startNode of startNodes) {
      dfs(startNode._id);
    }

    return nodes
      .filter((node) => !reachable.has(node._id))
      .map((node) => node._id);
  }

  /**
   * Find start nodes (nodes with commands or no incoming edges)
   */
  static findStartNodes(nodes: Node[], edges: Edge[]): Node[] {
    const nodesWithIncomingEdges = new Set<NodeIdType>();

    for (const edge of edges) {
      nodesWithIncomingEdges.add(edge.to);
    }

    return nodes.filter((node) => {
      // Node is a start node if it has a command OR has no incoming edges
      return node.command || !nodesWithIncomingEdges.has(node._id);
    });
  }

  /**
   * Suggest a safe execution order (topological sort)
   * Returns null if graph has cycles
   */
  static suggestExecutionOrder(nodes: Node[], edges: Edge[]): NodeIdType[] | null {
    const cycleDetection = this.detectCycles(nodes, edges);
    if (cycleDetection.hasCycles) {
      return null; // Cannot create topological sort with cycles
    }

    const adjacencyList = this.buildAdjacencyList(nodes, edges);
    const inDegree = new Map<NodeIdType, number>();

    // Initialize in-degrees
    for (const node of nodes) {
      inDegree.set(node._id, 0);
    }

    // Calculate in-degrees
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    // Queue of nodes with no incoming edges
    const queue: NodeIdType[] = [];
    for (const node of nodes) {
      if (inDegree.get(node._id) === 0) {
        queue.push(node._id);
      }
    }

    const result: NodeIdType[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result.length === nodes.length ? result : null;
  }

  /**
   * Check if adding an edge would create a cycle
   */
  static wouldCreateCycle(
    nodes: Node[],
    edges: Edge[],
    fromNodeId: NodeIdType,
    toNodeId: NodeIdType
  ): boolean {
    if (fromNodeId === toNodeId) {
      return true;
    }

    const adjacencyList = this.buildAdjacencyList(nodes, edges);
    const visited = new Set<NodeIdType>();
    const stack: NodeIdType[] = [toNodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromNodeId) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    return false;
  }
}
