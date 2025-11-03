import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentType } from '../../../../core/infrastructure/agents/core/agents/services/factory.service';
import {
  ReActAgentConfig,
  GraphAgent as GraphAgentConfig,
  CheckPointTypes,
} from '../../../../core/infrastructure/agents/core/agents/types/agent.entity';
import {
  UserId,
  ConversationId,
  UserIdType,
  ConversationIdType,
} from '../../../../core/infrastructure/database/utils/custom_types';
import { Types } from 'mongoose';
import { ExecuteAssistantDto } from '../dto/execution.dto';
import {
  Assistant,
  AssistantType,
  AssistantMode,
} from '../entities/assistant.entity';
import { MyLogger } from '../../../../core/services/logger/logger.service';
import { DEFAULT_REACT_SETTINGS } from '../../../../core/infrastructure/agents/core/agents/types/defaults';

@Injectable()
export class AgentConfigFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('AgentConfigFactory initialized', AgentConfigFactory.name);
  }
  convertAssistantToAgentOptions(
    assistant: Assistant,
    executeDto: ExecuteAssistantDto,
  ): {
    type: AgentType | string;
    userId: UserIdType;
    conversationId: ConversationIdType;
    settings: Partial<ReActAgentConfig | GraphAgentConfig>;
    config: any;
  } {
    this.logger.info(
      `Converting assistant '${assistant.name}' to agent options`,
      AgentConfigFactory.name,
    );

    const agentType = this.determineAgentType(assistant);
    this.logger.debug(
      `Determined agent type: ${agentType}`,
      AgentConfigFactory.name,
    );

    const userId =
      executeDto.userId && Types.ObjectId.isValid(executeDto.userId)
        ? UserId.create(new Types.ObjectId(executeDto.userId))
        : UserId.create(new Types.ObjectId());

    const conversationId =
      executeDto.conversationId &&
      Types.ObjectId.isValid(executeDto.conversationId)
        ? ConversationId.create(new Types.ObjectId(executeDto.conversationId))
        : ConversationId.create(new Types.ObjectId());

    const enhancedConfig = this.extractEnhancedConfigurations(assistant);

    const settings =
      agentType === AgentType.GRAPH
        ? this.createGraphAgentSettings(assistant, enhancedConfig, executeDto)
        : this.createReActAgentSettings(assistant, enhancedConfig, executeDto);

    const config = {
      memoryConfig: this.createMemoryConfiguration(assistant, enhancedConfig),
      intelligenceConfig: this.createIntelligenceConfiguration(
        assistant,
        enhancedConfig,
        executeDto,
      ),
      toolsConfig: this.createToolsConfiguration(
        assistant,
        enhancedConfig,
        executeDto,
      ),
      executionConfig: this.createExecutionConfiguration(
        assistant,
        enhancedConfig,
        executeDto,
      ),
      systemPrompt: this.generateSystemPrompt(assistant, enhancedConfig),
      workflowConfig: this.createWorkflowConfiguration(assistant, agentType),
    };

    this.logger.info(
      `Successfully converted assistant '${assistant.name}' to agent configuration`,
      AgentConfigFactory.name,
    );
    return { type: agentType, userId, conversationId, settings, config };
  }

  private extractEnhancedConfigurations(assistant: Assistant): any {
    const metadata = assistant.metadata || {};

    // Check for intelligence config in reactConfig first, then metadata
    const intelligenceConfig = assistant.reactConfig?.intelligence || 
                             metadata.intelligence || 
                             this.getDefaultIntelligenceConfig(assistant);

    this.logger.debug(
      `Extracting config for assistant '${assistant.name}': reactConfig.intelligence=${!!assistant.reactConfig?.intelligence}, metadata.intelligence=${!!metadata.intelligence}`,
      AgentConfigFactory.name,
    );

    if (assistant.reactConfig?.intelligence) {
      this.logger.debug(
        `Found reactConfig intelligence: provider=${assistant.reactConfig.intelligence.llm?.provider}, model=${assistant.reactConfig.intelligence.llm?.model}`,
        AgentConfigFactory.name,
      );
    }

    return {
      agentType: metadata.agentType || this.determineAgentType(assistant),
      intelligence: intelligenceConfig,
      memory: metadata.memory || this.getDefaultMemoryConfig(),
      enhanced: metadata.enhanced || false,
    };
  }

  private createGraphAgentSettings(
    assistant: Assistant,
    enhancedConfig: any,
    _executeDto: ExecuteAssistantDto,
  ): Partial<GraphAgentConfig> {
    const nodes = this.convertBlocksToGraphNodes(
      assistant.blocks,
      assistant,
      enhancedConfig,
    );
    const edges = this.convertBlocksToGraphEdges(assistant.blocks, nodes);

    return {
      nodes,
      edges,
      memory: enhancedConfig.memory,
      checkpoints: {
        enabled: this.shouldEnableCheckpoints(assistant, enhancedConfig),
        allowList: this.getCheckpointAllowList(assistant, enhancedConfig),
      },
    };
  }

  private createReActAgentSettings(
    assistant: Assistant,
    enhancedConfig: any,
    executeAssistantDto: ExecuteAssistantDto,
  ): Partial<ReActAgentConfig> {
    const systemPrompt = this.generateSystemPrompt(assistant, enhancedConfig);
    const tools = this.convertToolsToAgentFormat(assistant.tools || []);
    // Determine a safe, validated maxSteps value
    const blockCount = Array.isArray(assistant.blocks)
      ? assistant.blocks.length
      : 0;
    const providedMaxStepsRaw = assistant.reactConfig?.cot?.maxSteps as
      | number
      | string
      | undefined;
    const parseProvided = (val: number | string | undefined) => {
      if (val === undefined || val === null) return undefined;
      const n = typeof val === 'string' ? Number(val) : val;
      if (!Number.isFinite(n as number) || (n as number) < 0) return undefined;
      return n as number; // allow 0 explicitly
    };
    const providedMaxSteps = parseProvided(providedMaxStepsRaw);
    const defaultFromBlocks = Math.min((blockCount || 2) * 2, 10);
    const computedMaxSteps = providedMaxSteps !== undefined
      ? Math.min(providedMaxSteps, 100)
      : defaultFromBlocks;
    this.logger.debug(
      `ReAct maxSteps resolved => provided: ${providedMaxStepsRaw ?? 'n/a'} -> ${providedMaxSteps ?? 'invalid'}, blockCount: ${blockCount}, computed: ${computedMaxSteps}`,
      AgentConfigFactory.name,
    );

    return {
      // Provide required identifiers/metadata so validator passes
      _id: `ra_${new Types.ObjectId().toHexString()}` as any,
      state: 'initializing' as any,
  userId: (executeAssistantDto.userId as any) || undefined,
      name: assistant.name as any,
      description: assistant.description || 'ReAct assistant',
      purpose: (assistant.primaryMode || 'General assistance') as any,
      enabled: true,
      cot: {
        enabled: true,
        promptTemplate: systemPrompt,
        maxTokens: enhancedConfig.intelligence?.llm?.tokenLimit || 8192,
        temperature: assistant.reactConfig?.cot?.temperature ?? 0.7,
        topP: assistant.reactConfig?.cot?.topP ?? 1.0,
        frequencyPenalty: assistant.reactConfig?.cot?.frequencyPenalty ?? 0,
        presencePenalty: assistant.reactConfig?.cot?.presencePenalty ?? 0,
        fewShotExamples: DEFAULT_REACT_SETTINGS.cot?.fewShotExamples || [],
        stopSequences: this.getStopSequences(assistant.type),
        maxSteps: computedMaxSteps,
        selfConsistency: {
          enabled: false,
          samples: 1,
        },
        temperatureModifiable: true,
        maxTokensModifiable: true,
      },
      tools,
      canModifyStorage: false,
      intelligence: enhancedConfig.intelligence,
      memory: enhancedConfig.memory,
    };
  }

  private createMemoryConfiguration(
    assistant: Assistant,
    enhancedConfig: any,
  ): any {
    // Use memory config if it exists (from reactConfig or metadata), regardless of enhanced flag
    if (enhancedConfig.memory) {
      return enhancedConfig.memory;
    }

    const memoryType = this.getDefaultMemoryType(assistant.type);

    switch (memoryType) {
      case 'cbwm':
        return {
          type: 'cbwm',
          maxSize: 10,
        };
      case 'ctbm':
        return {
          type: 'ctbm',
          maxTokenLimit: 2000,
        };
      case 'csm':
        return {
          type: 'csm',
          llm: enhancedConfig.intelligence?.llm,
        };
      case 'csbm':
        return {
          type: 'csbm',
          maxSize: 5,
          llm: enhancedConfig.intelligence?.llm,
        };
      case 'ckgm':
        return {
          type: 'ckgm',
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-ada-002',
        };
      case 'vsrm':
        return {
          type: 'vsrm',
          similarity: 0.8,
          top_k: 5,
          optimize: false,
        };
      default:
        return {
          type: 'cbm',
        };
    }
  }

  private createIntelligenceConfiguration(
    assistant: Assistant,
    enhancedConfig: any,
    executeDto: ExecuteAssistantDto,
  ): any {
    this.logger.debug(
      `Creating intelligence config for assistant '${assistant.name}': enhanced=${enhancedConfig.enhanced}, hasIntelligence=${!!enhancedConfig.intelligence}`,
      AgentConfigFactory.name,
    );

    // Use intelligence config if it exists (from reactConfig or metadata), regardless of enhanced flag
    if (enhancedConfig.intelligence) {
      const intelligence = { ...enhancedConfig.intelligence };

      this.logger.debug(
        `Using assistant intelligence config: provider=${intelligence.llm?.provider}, model=${intelligence.llm?.model}`,
        AgentConfigFactory.name,
      );

      // Allow execution options to override
      if (executeDto.options?.llmProvider) {
        intelligence.llm.provider = executeDto.options.llmProvider;
      }
      if (executeDto.options?.llmModel) {
        intelligence.llm.model = executeDto.options.llmModel;
      }
      if (executeDto.options?.maxTokens) {
        intelligence.llm.tokenLimit = executeDto.options.maxTokens;
      }

      return intelligence;
    }

    // Fallback to default configuration
    const defaultConfig = {
      llm: {
        provider: executeDto.options?.llmProvider || 'groq',
        model:
          executeDto.options?.llmModel || this.getDefaultModel(assistant.type),
        tokenLimit: executeDto.options?.maxTokens || 8192,
      },
      escalate: false,
      providerEscalationOptions: [],
      modelEscalationTable: {},
    };

    this.logger.debug(
      `Using default intelligence config: provider=${defaultConfig.llm.provider}, model=${defaultConfig.llm.model}`,
      AgentConfigFactory.name,
    );

    return defaultConfig;
  }

  private createToolsConfiguration(
    assistant: Assistant,
    _enhancedConfig: any,
    executeDto?: ExecuteAssistantDto,
  ): any {
    const tools = assistant.tools || [];

    return {
      selectedTools: tools.map((tool) => ({
        toolId: tool.toolName,
        toolName: tool.toolName,
        isEnabled: tool.isEnabled,
        parameters: tool.parameters,
        customInstructions: tool.customInstructions,
      })),
      requireApproval: executeDto?.options?.requireToolApproval || false,
      specificToolsRequiringApproval:
        executeDto?.options?.specificToolsRequiringApproval || [],
    };
  }

  private createExecutionConfiguration(
    assistant: Assistant,
    enhancedConfig: any,
    executeDto: ExecuteAssistantDto,
  ): any {
    return {
      streaming: executeDto.options?.streaming || false,
      traceExecution: executeDto.options?.traceExecution || false,
      maxIterations: this.getMaxIterations(
        assistant.type,
        assistant.blocks.length,
      ),
      timeout: this.configService.get<number>('assistants.executionTimeout'),
      enablePause: enhancedConfig.agentType === AgentType.GRAPH,
      enableUserInteraction: this.hasUserInteractionBlocks(assistant.blocks),
    };
  }

  private generateSystemPrompt(
    assistant: Assistant,
    enhancedConfig: any,
  ): string {
    const components: string[] = [];

    components.push(this.getAgentTypePrompt(enhancedConfig.agentType));

    if (assistant.type !== AssistantType.CUSTOM) {
      components.push(this.getAssistantTypePrompt(assistant.type));
    }

    if (
      assistant.primaryMode &&
      assistant.primaryMode !== AssistantMode.CUSTOM
    ) {
      components.push(this.getAssistantModePrompt(assistant.primaryMode));
    }

    if (assistant.subjectExpertise && assistant.subjectExpertise.length > 0) {
      components.push(
        `You have specialized expertise in: ${assistant.subjectExpertise.join(', ')}.`,
      );
    }

    if (assistant.customPrompts) {
      assistant.customPrompts
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .forEach((prompt) => {
          components.push(prompt.content);
        });
    }

    if (assistant.contextBlocks) {
      assistant.contextBlocks
        .filter((block) => block.isActive !== false)
        .forEach((block) => {
          components.push(`Context - ${block.name}: ${block.content}`);
        });
    }

    return components.join('\n\n');
  }

  private createWorkflowConfiguration(
    assistant: Assistant,
    agentType: AgentType,
  ): any {
    return {
      blocks: assistant.blocks,
      complexity: this.analyzeWorkflowComplexity(assistant.blocks),
      agentType,
      requiresApproval: this.hasApprovalBlocks(assistant.blocks),
      hasUserInput: this.hasUserInteractionBlocks(assistant.blocks),
      hasConditionalLogic: this.hasConditionalBlocks(assistant.blocks),
    };
  }

  private getDefaultIntelligenceConfig(assistant: Assistant): any {
    return {
      llm: {
        provider: 'groq',
        model: this.getDefaultModel(assistant.type),
        tokenLimit: 8192,
      },
      escalate: false,
      providerEscalationOptions: [],
      modelEscalationTable: {},
    };
  }

  private getDefaultMemoryConfig(): any {
    return {
      type: 'cbm',
    };
  }

  private getDefaultModel(assistantType: AssistantType): string {
    const modelMap =
      this.configService.get<Record<AssistantType, string>>(
        'assistants.defaultModels',
      ) ?? ({} as Record<AssistantType, string>);
    return (
      modelMap[assistantType] || modelMap[AssistantType.CUSTOM] || 'llama-3.3-70b-versatile'
    );
  }

  private getDefaultMemoryType(assistantType: AssistantType): string {
    const memoryMap =
      this.configService.get<Record<AssistantType, string>>(
        'assistants.defaultMemoryTypes',
      ) ?? ({} as Record<AssistantType, string>);
    return memoryMap[assistantType] || memoryMap[AssistantType.CUSTOM] || 'cbm';
  }

  private getAgentTypePrompt(agentType: AgentType): string {
    const prompts =
      this.configService.get<Record<AgentType, string>>(
        'assistants.agentTypePrompts',
      ) ?? ({} as Record<AgentType, string>);
    return prompts[agentType] || prompts[AgentType.BASE] || '';
  }

  private getAssistantTypePrompt(assistantType: AssistantType): string {
    const prompts =
      this.configService.get<Record<AssistantType, string>>(
        'assistants.assistantTypePrompts',
      ) ?? ({} as Record<AssistantType, string>);
    return prompts[assistantType] || '';
  }

  private getAssistantModePrompt(mode: AssistantMode): string {
    const prompts =
      this.configService.get<Record<AssistantMode, string>>(
        'assistants.assistantModePrompts',
      ) ?? ({} as Record<AssistantMode, string>);
    return prompts[mode] || '';
  }

  private getStopSequences(assistantType: AssistantType): string[] {
    const sequences =
      this.configService.get<Record<AssistantType, string[]>>(
        'assistants.stopSequences',
      ) ?? ({} as Record<AssistantType, string[]>);
    return sequences[assistantType] || sequences[AssistantType.CUSTOM] || [];
  }

  private getMaxIterations(
    assistantType: AssistantType,
    blockCount: number,
  ): number {
    const baseIterations = Math.max(3, Math.min(blockCount * 2, 15));
    const multipliers =
      this.configService.get<Record<AssistantType, number>>(
        'assistants.maxIterationsMultipliers',
      ) ?? ({} as Record<AssistantType, number>);
    return Math.floor(baseIterations * (multipliers[assistantType] || 1));
  }

  private analyzeWorkflowComplexity(blocks: any[]): any {
    let score = 0;
    let conditionalBranches = 0;
    let userInteractions = 0;
    let toolUsage = 0;

    blocks.forEach((block) => {
      if (
        block.type === 'condition' ||
        (typeof block.next === 'object' && block.next !== null)
      ) {
        conditionalBranches++;
        score += 10;
      }

      if (
        block.requiresUserInput ||
        block.type === 'input' ||
        block.type === 'approval'
      ) {
        userInteractions++;
        score += 8;
      }

      if (
        block.type === 'tool' ||
        block.type === 'retriever' ||
        block.type === 'actor'
      ) {
        toolUsage++;
        score += 5;
      }
    });

    return {
      score,
      conditionalBranches,
      userInteractions,
      toolUsage,
      requiresGraph: score > 20 || conditionalBranches > 1,
    };
  }

  private hasUserInteractionBlocks(blocks: any[]): boolean {
    return blocks.some(
      (block) =>
        block.requiresUserInput ||
        block.type === 'input' ||
        block.type === 'approval',
    );
  }

  private hasApprovalBlocks(blocks: any[]): boolean {
    return blocks.some((block) => block.type === 'approval');
  }

  private hasConditionalBlocks(blocks: any[]): boolean {
    return blocks.some(
      (block) =>
        block.type === 'condition' ||
        (typeof block.next === 'object' && block.next !== null),
    );
  }

  private shouldEnableCheckpoints(
    assistant: Assistant,
    _enhancedConfig: any,
  ): boolean {
    const complexity = this.analyzeWorkflowComplexity(assistant.blocks);
    return complexity.score > 30 || this.hasApprovalBlocks(assistant.blocks);
  }

  private getCheckpointAllowList(
    assistant: Assistant,
    _enhancedConfig: any,
  ): CheckPointTypes {
    const complexity = this.analyzeWorkflowComplexity(assistant.blocks);
    return complexity.score > 50 ? CheckPointTypes.All : CheckPointTypes.Nodes;
  }

  private convertBlocksToGraphNodes(
    blocks: any[],
    assistant: Assistant,
    enhancedConfig: any,
  ): any[] {
    return blocks.map((block, index) => ({
      _id: block.id || `node_${index}`,
      command: this.getNodeCommand(block.type),
      name: this.getNodeName(block, index),
      description: this.getNodeDescription(block),
      llm:
        enhancedConfig.intelligence?.llm ||
        this.getDefaultIntelligenceConfig(assistant).llm,
      ReActConfig: this.createNodeReActConfig(block, assistant, enhancedConfig),
      userInteraction: block.requiresUserInput
        ? {
            mode: 'single_react_cycle',
            requireApproval: true,
            confidenceThreshold: 0.8,
            maxCoTSteps: 3,
            allowUserPrompting: true,
            showEndChatButton: false,
          }
        : undefined,
    }));
  }

  private convertBlocksToGraphEdges(blocks: any[], nodes: any[]): any[] {
    const edges: any[] = [];

    blocks.forEach((block, index) => {
      if (block.next) {
        const currentNodeId = nodes[index]._id;

        if (typeof block.next === 'string') {
          const targetIndex = blocks.findIndex((b) => b.id === block.next);
          if (targetIndex !== -1) {
            edges.push({
              _id: `edge_${currentNodeId}_${nodes[targetIndex]._id}`,
              from: currentNodeId,
              to: nodes[targetIndex]._id,
              condition: {
                type: 'keyword',
                keyword: 'continue',
                analysisProvider: {
                  provider: 'groq',
                  model: 'llama-3.3-70b-versatile',
                  tokenLimit: 1000,
                },
              },
              contextFrom: [currentNodeId],
            });
          }
        } else {
          Object.entries(block.next).forEach(([condition, targetId]) => {
            const targetIndex = blocks.findIndex((b) => b.id === targetId);
            if (targetIndex !== -1) {
              edges.push({
                _id: `edge_${currentNodeId}_${condition}_${nodes[targetIndex]._id}`,
                from: currentNodeId,
                to: nodes[targetIndex]._id,
                condition: {
                  type: 'analysis',
                  analysisPrompt: `Analyze if the condition "${condition}" is met.`,
                  analysisProvider: {
                    provider: 'groq',
                    model: 'llama-3.3-70b-versatile',
                    tokenLimit: 1000,
                  },
                },
                contextFrom: [currentNodeId],
              });
            }
          });
        }
      }
    });

    return edges;
  }

  private convertToolsToAgentFormat(tools: any[]): any[] {
    return tools.map((tool) => ({
      _id: tool.toolName,
      name: tool.toolName,
      description: `Tool: ${tool.toolName}`,
      type: 'actor',
      useCase: tool.customInstructions || 'General purpose tool',
      inputSchema: tool.parameters || {},
      outputSchema: {},
      invocationExample: [],
      retries: 3,
      errorEvent: [],
      parallel: false,
      maxIterations: 1,
      pauseBeforeUse: false,
      userModifyQuery: false,
    }));
  }

  private getNodeCommand(blockType: string): string {
    const commandMap =
      this.configService.get<Record<string, string>>(
        'assistants.nodeCommands',
      ) ?? {};
    return commandMap[blockType] || 'PROCESS';
  }

  private getNodeName(block: any, index: number): string {
    if (block.config?.name) return block.config.name;
    const nameMap =
      this.configService.get<Record<string, string>>('assistants.nodeNames') ??
      {};
    return nameMap[block.type] || `Step ${index + 1}`;
  }

  private getNodeDescription(block: any): string {
    if (block.config?.description) return block.config.description;
    if (block.prompt)
      return `Execute: ${block.prompt.substring(0, 100)}${block.prompt.length > 100 ? '...' : ''}`;
    return `${this.getNodeName(block, 0)} - Process and continue workflow`;
  }

  private createNodeReActConfig(
    block: any,
    assistant: Assistant,
    enhancedConfig: any,
  ): any {
    const systemPrompt = block.prompt || 'Process this step in the workflow.';

    return {
      enabled: true,
      cot: {
        enabled: true,
        promptTemplate: systemPrompt,
        maxTokens: 2000,
        temperature:
          block.config?.temperature ||
          assistant.reactConfig?.cot?.temperature ||
          0.7,
        topP: 1.0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        fewShotExamples: DEFAULT_REACT_SETTINGS.cot?.fewShotExamples || [],
        stopSequences: [],
        maxSteps: 3,
        selfConsistency: { enabled: false, samples: 1 },
        temperatureModifiable: true,
        maxTokensModifiable: true,
      },
      tools: [],
      canModifyStorage: false,
      intelligence: enhancedConfig.intelligence,
      memory: enhancedConfig.memory,
    };
  }

  private determineAgentType(assistant: Assistant): AgentType {
    if (assistant.type === AssistantType.GRAPH_AGENT) {
      return AgentType.GRAPH;
    }
    return AgentType.REACT;
  }
}
