import { Injectable } from '@nestjs/common';
import { AssistantsCrudService } from '../../common/services/assistants-crud.service';
import {
  CreateGraphAgentDto,
  GraphConfigDto,
  GraphNodeType,
  GraphEdgeType,
  UserInteractionMode,
} from '../dto/graph-builder.dto';
import { AssistantType, AssistantMode } from '../../common/entities/assistant.entity';
import { MyLogger } from '../../../../core/services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

export interface GraphNodeTemplate {
  id: string;
  name: string;
  type: GraphNodeType;
  description: string;
  category: string;
  defaultConfig: Record<string, any>;
  userInteractionOptions: UserInteractionMode[];
  requiredFields: string[];
  optionalFields: string[];
}

export interface GraphEdgeTemplate {
  type: GraphEdgeType;
  name: string;
  description: string;
  useCases: string[];
  configOptions: Record<string, any>;
}

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface GraphFlowAnalysis {
  executionPaths: Array<{
    path: string[];
    description: string;
    userInteractionPoints: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
  }>;
  userInteractionFlow: Array<{
    nodeId: string;
    nodeName: string;
    interactionType: UserInteractionMode;
    dependencies: string[];
  }>;
  parallelBranches: Array<{
    branchId: string;
    nodes: string[];
    joinPoint?: string;
  }>;
  cyclicPaths: Array<{
    cycle: string[];
    type: 'infinite' | 'bounded';
  }>;
}

@Injectable()
export class GraphBuilderService {
  constructor(
    private readonly assistantsService: AssistantsCrudService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'GraphBuilderService initialized',
      GraphBuilderService.name,
    );
  }

  /**
   * Get available graph node templates
   */
  async getGraphNodeTemplates(category?: string): Promise<GraphNodeTemplate[]> {
    this.logger.info(
      `Retrieving graph node templates${category ? ` for category: ${category}` : ''}`,
      GraphBuilderService.name,
    );
    const templates: GraphNodeTemplate[] = [
      {
        id: 'llm-node',
        name: 'LLM Processing Node',
        type: GraphNodeType.LLM,
        description: 'Processes input using a Large Language Model',
        category: 'processing',
        defaultConfig: {
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: 'You are a helpful assistant.',
        },
        userInteractionOptions: [
          UserInteractionMode.NONE,
          UserInteractionMode.APPROVAL_REQUIRED,
          UserInteractionMode.CONTINUOUS_CHAT,
        ],
        requiredFields: ['model', 'systemPrompt'],
        optionalFields: [
          'temperature',
          'maxTokens',
          'topP',
          'presencePenalty',
          'frequencyPenalty',
        ],
      },
      {
        id: 'tool-node',
        name: 'Tool Execution Node',
        type: GraphNodeType.TOOL,
        description: 'Executes a specific tool or function',
        category: 'processing',
        defaultConfig: {
          toolName: '',
          parameters: {},
          retryAttempts: 3,
          timeoutSeconds: 30,
        },
        userInteractionOptions: [
          UserInteractionMode.NONE,
          UserInteractionMode.APPROVAL_REQUIRED,
        ],
        requiredFields: ['toolName'],
        optionalFields: ['parameters', 'retryAttempts', 'timeoutSeconds'],
      },
      {
        id: 'user-input-node',
        name: 'User Input Node',
        type: GraphNodeType.USER_INPUT,
        description: 'Collects input from the user before proceeding',
        category: 'user_interaction',
        defaultConfig: {
          inputPrompt: 'Please provide your input:',
          inputType: 'text',
          validation: {},
          timeoutSeconds: 300,
        },
        userInteractionOptions: [UserInteractionMode.INPUT_REQUIRED],
        requiredFields: ['inputPrompt'],
        optionalFields: ['inputType', 'validation', 'timeoutSeconds'],
      },
      {
        id: 'user-approval-node',
        name: 'User Approval Node',
        type: GraphNodeType.USER_APPROVAL,
        description: 'Requires user approval before proceeding',
        category: 'user_interaction',
        defaultConfig: {
          approvalPrompt: 'Do you approve the previous action?',
          confidenceThreshold: 0.8,
          showContext: true,
          timeoutSeconds: 300,
        },
        userInteractionOptions: [UserInteractionMode.APPROVAL_REQUIRED],
        requiredFields: ['approvalPrompt'],
        optionalFields: [
          'confidenceThreshold',
          'showContext',
          'timeoutSeconds',
        ],
      },
      {
        id: 'continuous-chat-node',
        name: 'Continuous Chat Node',
        type: GraphNodeType.CONTINUOUS_CHAT,
        description: 'Enables back-and-forth conversation with the user',
        category: 'user_interaction',
        defaultConfig: {
          chatInstructions:
            'You can chat with the user. Say "continue" to proceed to the next step.',
          maxRounds: 10,
          endConditions: ['user_says_continue', 'max_rounds_reached'],
          timeoutSeconds: 1800,
        },
        userInteractionOptions: [UserInteractionMode.CONTINUOUS_CHAT],
        requiredFields: ['chatInstructions'],
        optionalFields: ['maxRounds', 'endConditions', 'timeoutSeconds'],
      },
      {
        id: 'condition-node',
        name: 'Condition Node',
        type: GraphNodeType.CONDITION,
        description: 'Routes execution based on conditions',
        category: 'control_flow',
        defaultConfig: {
          conditionType: 'javascript',
          condition: '',
          outputs: {},
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: ['conditionType', 'condition'],
        optionalFields: ['outputs'],
      },
      {
        id: 'decision-node',
        name: 'Decision Node',
        type: GraphNodeType.DECISION,
        description: 'Makes routing decisions based on previous outputs',
        category: 'control_flow',
        defaultConfig: {
          decisionLogic: '',
          alternatives: [],
          fallbackPath: null,
        },
        userInteractionOptions: [
          UserInteractionMode.NONE,
          UserInteractionMode.OPTIONAL_INPUT,
        ],
        requiredFields: ['decisionLogic'],
        optionalFields: ['alternatives', 'fallbackPath'],
      },
      {
        id: 'checkpoint-node',
        name: 'Checkpoint Node',
        type: GraphNodeType.CHECKPOINT,
        description: 'Creates a save point in the execution flow',
        category: 'control_flow',
        defaultConfig: {
          checkpointName: '',
          saveState: true,
          description: '',
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: ['checkpointName'],
        optionalFields: ['saveState', 'description'],
      },
      {
        id: 'memory-node',
        name: 'Memory Node',
        type: GraphNodeType.MEMORY,
        description: 'Stores or retrieves information from memory',
        category: 'data',
        defaultConfig: {
          operation: 'store',
          memoryKey: '',
          value: '',
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: ['operation', 'memoryKey'],
        optionalFields: ['value'],
      },
      {
        id: 'parallel-node',
        name: 'Parallel Execution Node',
        type: GraphNodeType.PARALLEL,
        description: 'Executes multiple branches in parallel',
        category: 'control_flow',
        defaultConfig: {
          branches: [],
          joinStrategy: 'wait_all',
          timeoutSeconds: 600,
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: ['branches'],
        optionalFields: ['joinStrategy', 'timeoutSeconds'],
      },
      {
        id: 'start-node',
        name: 'Start Node',
        type: GraphNodeType.START,
        description: 'Entry point of the graph execution',
        category: 'control_flow',
        defaultConfig: {
          initialInput: '',
          preprocessors: [],
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: [],
        optionalFields: ['initialInput', 'preprocessors'],
      },
      {
        id: 'end-node',
        name: 'End Node',
        type: GraphNodeType.END,
        description: 'Exit point of the graph execution',
        category: 'control_flow',
        defaultConfig: {
          outputFormat: 'text',
          finalProcessors: [],
        },
        userInteractionOptions: [UserInteractionMode.NONE],
        requiredFields: [],
        optionalFields: ['outputFormat', 'finalProcessors'],
      },
    ];

    const filteredTemplates = category
      ? templates.filter((t) => t.category === category)
      : templates;
    this.logger.info(
      `Retrieved ${filteredTemplates.length} graph node templates`,
      GraphBuilderService.name,
    );
    return filteredTemplates;
  }

  /**
   * Get available edge types
   */
  async getGraphEdgeTypes(): Promise<GraphEdgeTemplate[]> {
    this.logger.info('Retrieving graph edge types', GraphBuilderService.name);
    const edgeTypes = [
      {
        type: GraphEdgeType.DIRECT,
        name: 'Direct Connection',
        description: 'Simple direct connection to next node',
        useCases: ['Sequential processing', 'Default flow'],
        configOptions: {},
      },
      {
        type: GraphEdgeType.CONDITIONAL,
        name: 'Conditional Connection',
        description: 'Connection based on condition evaluation',
        useCases: ['Branching logic', 'Error handling', 'Data validation'],
        configOptions: {
          condition: 'JavaScript expression or JSON path',
          operator: 'Comparison operator',
          expectedValue: 'Value to compare against',
        },
      },
      {
        type: GraphEdgeType.APPROVAL_BASED,
        name: 'Approval-Based Connection',
        description: 'Connection based on user approval',
        useCases: ['Human oversight', 'Safety checks', 'Quality control'],
        configOptions: {
          approvalPrompt: 'Message shown to user',
          timeoutSeconds: 'How long to wait for approval',
        },
      },
      {
        type: GraphEdgeType.CONFIDENCE_BASED,
        name: 'Confidence-Based Connection',
        description: 'Connection based on confidence score',
        useCases: ['Quality assurance', 'Escalation flows', 'Fallback paths'],
        configOptions: {
          confidenceThreshold: 'Minimum confidence score (0-1)',
          fallbackPath: 'Alternative path if confidence too low',
        },
      },
      {
        type: GraphEdgeType.USER_CHOICE,
        name: 'User Choice Connection',
        description: 'Connection chosen by user interaction',
        useCases: ['Interactive menus', 'User preferences', 'Dynamic routing'],
        configOptions: {
          choicePrompt: 'Prompt shown to user',
          options: 'Available choices',
        },
      },
      {
        type: GraphEdgeType.PARALLEL_BRANCH,
        name: 'Parallel Branch',
        description: 'Creates parallel execution branch',
        useCases: [
          'Concurrent processing',
          'Multi-modal analysis',
          'Performance optimization',
        ],
        configOptions: {
          branchId: 'Unique identifier for the branch',
          joinPoint: 'Node where branches merge',
        },
      },
      {
        type: GraphEdgeType.PARALLEL_JOIN,
        name: 'Parallel Join',
        description: 'Merges parallel execution branches',
        useCases: [
          'Synchronization',
          'Result aggregation',
          'Error consolidation',
        ],
        configOptions: {
          joinStrategy: 'How to combine results (wait_all, wait_any, timeout)',
          timeoutSeconds: 'Maximum wait time',
        },
      },
    ];
    this.logger.info(
      `Retrieved ${edgeTypes.length} graph edge types`,
      GraphBuilderService.name,
    );
    return edgeTypes;
  }

  /**
   * Get user interaction types
   */
  async getUserInteractionTypes(): Promise<
    Array<{
      type: UserInteractionMode;
      name: string;
      description: string;
      configOptions: Record<string, any>;
    }>
  > {
    return [
      {
        type: UserInteractionMode.NONE,
        name: 'No User Interaction',
        description: 'Node executes without any user interaction',
        configOptions: {},
      },
      {
        type: UserInteractionMode.INPUT_REQUIRED,
        name: 'User Input Required',
        description: 'Node waits for user input before proceeding',
        configOptions: {
          inputPrompt: 'Message shown to user',
          inputType: 'Type of input expected (text, number, choice)',
          validation: 'Input validation rules',
          timeoutSeconds: 'How long to wait for input',
        },
      },
      {
        type: UserInteractionMode.APPROVAL_REQUIRED,
        name: 'User Approval Required',
        description: 'Node waits for user approval before proceeding',
        configOptions: {
          approvalPrompt: 'Message shown to user',
          confidenceThreshold: 'Automatic approval threshold',
          showContext: 'Whether to show execution context',
          timeoutSeconds: 'How long to wait for approval',
        },
      },
      {
        type: UserInteractionMode.CONTINUOUS_CHAT,
        name: 'Continuous Chat',
        description: 'Node enables back-and-forth conversation with user',
        configOptions: {
          chatInstructions: 'Instructions for the chat interaction',
          maxRounds: 'Maximum number of chat rounds',
          endConditions: 'Conditions to end the chat',
          timeoutSeconds: 'Total chat timeout',
        },
      },
      {
        type: UserInteractionMode.OPTIONAL_INPUT,
        name: 'Optional User Input',
        description: 'Node can accept user input but will proceed without it',
        configOptions: {
          inputPrompt: 'Message shown to user',
          waitTimeSeconds: 'How long to wait for input',
          defaultValue: 'Value to use if no input provided',
        },
      },
    ];
  }

  /**
   * Validate graph configuration
   */
  async validateGraphConfig(
    graphConfig: GraphConfigDto,
  ): Promise<GraphValidationResult> {
    this.logger.info(
      `Validating graph configuration: ${graphConfig.name}`,
      GraphBuilderService.name,
    );
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic structure validation
    if (!graphConfig.nodes || graphConfig.nodes.length === 0) {
      errors.push('Graph must contain at least one node');
    }

    if (!graphConfig.edges) {
      warnings.push('Graph has no edges - ensure this is intentional');
    }

    // Node validation
    const nodeIds = new Set<string>();
    let hasStartNode = false;
    let hasEndNode = false;

    for (const node of graphConfig.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);

      if (node.type === GraphNodeType.START) {
        if (hasStartNode) {
          errors.push('Graph can only have one start node');
        }
        hasStartNode = true;
      }

      if (node.type === GraphNodeType.END) {
        hasEndNode = true;
      }

      // Validate user interaction configuration
      if (
        node.userInteractionMode &&
        node.userInteractionMode !== UserInteractionMode.NONE
      ) {
        if (!node.userInteractionConfig) {
          warnings.push(
            `Node ${node.id} has user interaction mode but no interaction config`,
          );
        }
      }
    }

    if (!hasStartNode) {
      errors.push('Graph must have a start node');
    }

    if (!hasEndNode) {
      suggestions.push('Consider adding an end node for clear termination');
    }

    // Edge validation
    for (const edge of graphConfig.edges || []) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push(
          `Edge ${edge.id} references non-existent source node: ${edge.sourceNodeId}`,
        );
      }

      if (!nodeIds.has(edge.targetNodeId)) {
        errors.push(
          `Edge ${edge.id} references non-existent target node: ${edge.targetNodeId}`,
        );
      }

      if (edge.sourceNodeId === edge.targetNodeId) {
        warnings.push(`Edge ${edge.id} creates a self-loop`);
      }
    }

    // Check for unreachable nodes
    const reachableNodes = this.findReachableNodes(graphConfig);
    for (const nodeId of nodeIds) {
      if (!reachableNodes.has(nodeId)) {
        warnings.push(`Node ${nodeId} is unreachable from start node`);
      }
    }

    // Check for user interaction flow
    const userInteractionNodes = graphConfig.nodes.filter(
      (node) =>
        node.userInteractionMode &&
        node.userInteractionMode !== UserInteractionMode.NONE,
    );

    if (userInteractionNodes.length > 0) {
      suggestions.push(
        'Graph contains user interaction nodes - ensure proper routing between them',
      );
    }

    const result = {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };

    this.logger.info(
      `Graph validation completed for '${graphConfig.name}': ${result.isValid ? 'valid' : 'invalid'} (${errors.length} errors, ${warnings.length} warnings)`,
      GraphBuilderService.name,
    );
    return result;
  }

  /**
   * Create a graph agent from configuration
   */
  async createGraphAgent(createDto: CreateGraphAgentDto) {
    this.logger.info(
      `Creating graph agent: ${createDto.name}`,
      GraphBuilderService.name,
    );

    try {
      // Validate the graph configuration first
      const validation = await this.validateGraphConfig(createDto.graphConfig);
      if (!validation.isValid) {
        this.logger.error(
          `Invalid graph configuration for '${createDto.name}': ${validation.errors.join(', ')}`,
          undefined,
          GraphBuilderService.name,
        );
        throw new Error(
          `Invalid graph configuration: ${validation.errors.join(', ')}`,
        );
      }

      // Convert graph config to assistant blocks (adapted for graph structure)
      const blocks = this.convertGraphConfigToBlocks(createDto.graphConfig);
      this.logger.debug(
        `Converted graph config to ${blocks.length} blocks`,
        GraphBuilderService.name,
      );

      // Create assistant with GRAPH_AGENT type
      const assistantData = {
        name: createDto.name,
        description: createDto.description,
        type: AssistantType.GRAPH_AGENT,
        primaryMode: AssistantMode.BALANCED,
        blocks,
        subjectExpertise: createDto.subjectExpertise,
        isPublic: createDto.isPublic,
        userId: createDto.userId,
        options: {
          ...createDto.options,
          isGraphAgent: true, // Flag to identify as graph agent
          graphConfig: createDto.graphConfig, // Store original graph config
        },
      };

      const result = await this.assistantsService.create(assistantData as any);
      this.logger.info(
        `Successfully created graph agent: ${createDto.name}`,
        GraphBuilderService.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to create graph agent '${createDto.name}': ${info.message}\n${info.stack || ''}`,
        GraphBuilderService.name,
      );
      throw error;
    }
  }

  /**
   * Analyze graph execution flow
   */
  async analyzeGraphFlow(
    graphConfig: GraphConfigDto,
  ): Promise<GraphFlowAnalysis> {
    const executionPaths = this.findExecutionPaths(graphConfig);
    const userInteractionFlow = this.analyzeUserInteractionFlow(graphConfig);
    const parallelBranches = this.findParallelBranches(graphConfig);
    const cyclicPaths = this.findCyclicPaths(graphConfig);

    return {
      executionPaths,
      userInteractionFlow,
      parallelBranches,
      cyclicPaths,
    };
  }

  /**
   * Get common graph patterns
   */
  async getGraphPatterns(category?: string) {
    const patterns = [
      {
        id: 'sequential-processing',
        name: 'Sequential Processing',
        description: 'Simple linear workflow',
        category: 'basic',
        graphConfig: {
          name: 'Sequential Processing Pattern',
          nodes: [
            {
              id: 'start',
              type: GraphNodeType.START,
              name: 'Start',
              config: {},
            },
            {
              id: 'process1',
              type: GraphNodeType.LLM,
              name: 'Process 1',
              config: { systemPrompt: 'Process the input' },
            },
            {
              id: 'process2',
              type: GraphNodeType.LLM,
              name: 'Process 2',
              config: { systemPrompt: 'Refine the output' },
            },
            { id: 'end', type: GraphNodeType.END, name: 'End', config: {} },
          ],
          edges: [
            {
              id: 'e1',
              sourceNodeId: 'start',
              targetNodeId: 'process1',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e2',
              sourceNodeId: 'process1',
              targetNodeId: 'process2',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e3',
              sourceNodeId: 'process2',
              targetNodeId: 'end',
              type: GraphEdgeType.DIRECT,
            },
          ],
        },
      },
      {
        id: 'user-approval-workflow',
        name: 'User Approval Workflow',
        description: 'Workflow with user approval checkpoints',
        category: 'user_interaction',
        graphConfig: {
          name: 'User Approval Workflow',
          nodes: [
            {
              id: 'start',
              type: GraphNodeType.START,
              name: 'Start',
              config: {},
            },
            {
              id: 'analyze',
              type: GraphNodeType.LLM,
              name: 'Analyze Input',
              config: { systemPrompt: 'Analyze the input' },
            },
            {
              id: 'approval',
              type: GraphNodeType.USER_APPROVAL,
              name: 'User Approval',
              config: { approvalPrompt: 'Approve analysis?' },
              userInteractionMode: UserInteractionMode.APPROVAL_REQUIRED,
            },
            {
              id: 'execute',
              type: GraphNodeType.TOOL,
              name: 'Execute Action',
              config: { toolName: 'execute_action' },
            },
            { id: 'end', type: GraphNodeType.END, name: 'End', config: {} },
          ],
          edges: [
            {
              id: 'e1',
              sourceNodeId: 'start',
              targetNodeId: 'analyze',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e2',
              sourceNodeId: 'analyze',
              targetNodeId: 'approval',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e3',
              sourceNodeId: 'approval',
              targetNodeId: 'execute',
              type: GraphEdgeType.APPROVAL_BASED,
              condition: {
                type: 'user_approval',
                expression: 'approved === true',
              },
            },
            {
              id: 'e4',
              sourceNodeId: 'execute',
              targetNodeId: 'end',
              type: GraphEdgeType.DIRECT,
            },
          ],
        },
      },
      {
        id: 'conditional-branching',
        name: 'Conditional Branching',
        description: 'Workflow with conditional logic',
        category: 'control_flow',
        graphConfig: {
          name: 'Conditional Branching Pattern',
          nodes: [
            {
              id: 'start',
              type: GraphNodeType.START,
              name: 'Start',
              config: {},
            },
            {
              id: 'classify',
              type: GraphNodeType.LLM,
              name: 'Classify Input',
              config: { systemPrompt: 'Classify the input type' },
            },
            {
              id: 'condition',
              type: GraphNodeType.CONDITION,
              name: 'Route Decision',
              config: {
                conditionType: 'javascript',
                condition: 'output.category',
              },
            },
            {
              id: 'path_a',
              type: GraphNodeType.LLM,
              name: 'Process Type A',
              config: { systemPrompt: 'Handle type A' },
            },
            {
              id: 'path_b',
              type: GraphNodeType.LLM,
              name: 'Process Type B',
              config: { systemPrompt: 'Handle type B' },
            },
            { id: 'end', type: GraphNodeType.END, name: 'End', config: {} },
          ],
          edges: [
            {
              id: 'e1',
              sourceNodeId: 'start',
              targetNodeId: 'classify',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e2',
              sourceNodeId: 'classify',
              targetNodeId: 'condition',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e3',
              sourceNodeId: 'condition',
              targetNodeId: 'path_a',
              type: GraphEdgeType.CONDITIONAL,
              condition: {
                type: 'javascript',
                expression: 'output.category === "A"',
              },
            },
            {
              id: 'e4',
              sourceNodeId: 'condition',
              targetNodeId: 'path_b',
              type: GraphEdgeType.CONDITIONAL,
              condition: {
                type: 'javascript',
                expression: 'output.category === "B"',
              },
            },
            {
              id: 'e5',
              sourceNodeId: 'path_a',
              targetNodeId: 'end',
              type: GraphEdgeType.DIRECT,
            },
            {
              id: 'e6',
              sourceNodeId: 'path_b',
              targetNodeId: 'end',
              type: GraphEdgeType.DIRECT,
            },
          ],
        },
      },
    ];

    return category
      ? patterns.filter((p) => p.category === category)
      : patterns;
  }

  // Private helper methods

  private findReachableNodes(graphConfig: GraphConfigDto): Set<string> {
    const reachable = new Set<string>();
    const startNode = graphConfig.nodes.find(
      (n) => n.type === GraphNodeType.START,
    );

    if (!startNode) return reachable;

    const stack = [startNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (reachable.has(currentId)) continue;

      reachable.add(currentId);

      const outgoingEdges =
        graphConfig.edges?.filter((e) => e.sourceNodeId === currentId) || [];
      for (const edge of outgoingEdges) {
        if (!reachable.has(edge.targetNodeId)) {
          stack.push(edge.targetNodeId);
        }
      }
    }

    return reachable;
  }

  private convertGraphConfigToBlocks(graphConfig: GraphConfigDto): any[] {
    // Convert graph structure to blocks for assistant compatibility
    // This is a bridge until we fully separate graph agents
    return graphConfig.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: {
        ...node.config,
        userInteractionMode: node.userInteractionMode,
        userInteractionConfig: node.userInteractionConfig,
      },
      prompt: node.prompt,
      requiresUserInput: node.userInteractionMode !== UserInteractionMode.NONE,
      next: this.calculateNodeNext(node.id, graphConfig.edges || []),
      metadata: {
        ...node.metadata,
        graphNode: true,
        position: node.position,
      },
    }));
  }

  private calculateNodeNext(
    nodeId: string,
    edges: any[],
  ): string | Record<string, string> | null {
    const outgoingEdges = edges.filter((e) => e.sourceNodeId === nodeId);

    if (outgoingEdges.length === 0) return null;
    if (
      outgoingEdges.length === 1 &&
      outgoingEdges[0].type === GraphEdgeType.DIRECT
    ) {
      return outgoingEdges[0].targetNodeId;
    }

    // Multiple edges or conditional edges
    const nextMap: Record<string, string> = {};
    for (const edge of outgoingEdges) {
      if (edge.condition) {
        nextMap[edge.condition.expression] = edge.targetNodeId;
      } else {
        nextMap['default'] = edge.targetNodeId;
      }
    }

    return nextMap;
  }

  private findExecutionPaths(_graphConfig: GraphConfigDto): any[] {
    // Implementation for finding all possible execution paths
    // This would analyze the graph structure and return potential execution flows
    return [];
  }

  private analyzeUserInteractionFlow(graphConfig: GraphConfigDto): any[] {
    return graphConfig.nodes
      .filter(
        (node) =>
          node.userInteractionMode &&
          node.userInteractionMode !== UserInteractionMode.NONE,
      )
      .map((node) => ({
        nodeId: node.id,
        nodeName: node.name,
        interactionType: node.userInteractionMode!,
        dependencies: this.findNodeDependencies(
          node.id,
          graphConfig.edges || [],
        ),
      }));
  }

  private findNodeDependencies(nodeId: string, edges: any[]): string[] {
    return edges
      .filter((e) => e.targetNodeId === nodeId)
      .map((e) => e.sourceNodeId);
  }

  private findParallelBranches(_graphConfig: GraphConfigDto): any[] {
    // Implementation for finding parallel execution branches
    return [];
  }

  private findCyclicPaths(_graphConfig: GraphConfigDto): any[] {
    // Implementation for finding cyclic paths in the graph
    return [];
  }
}
