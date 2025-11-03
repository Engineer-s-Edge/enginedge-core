import { Injectable } from '@nestjs/common';
import {
  ReActAgentConfig,
  GraphAgent as GraphAgentConfig,
  Node,
} from '../types/agent.entity';
import { AgentType, ReActAgentTypeManager } from './factory.service';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  UserIdType,
  ConversationIdType,
} from '@core/infrastructure/database/utils/custom_types';

export interface AgentOptions {
  type: AgentType | string;
  userId: UserIdType;
  conversationId: ConversationIdType;
}

@Injectable()
export class AgentValidationService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'AgentValidationService initializing',
      AgentValidationService.name,
    );
  }
  /**
   * Validate ReAct agent configuration
   */
  validateReActAgentConfig(settings: ReActAgentConfig): void {
    this.logger.info(
      'Validating ReAct agent configuration',
      AgentValidationService.name,
    );
    this.logger.debug(
      `Agent name: ${settings?.name || 'unknown'}`,
      AgentValidationService.name,
    );

    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'ReAct agent settings validation failed - settings not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error(
        'ReAct agents require complete settings configuration. Settings cannot be empty or partial.',
      );
    }

    // Validate all required ReActAgentConfig fields are present
    const requiredFields = [
      '_id',
      'userId',
      'name',
      'description',
      'purpose',
      'cot',
      'intelligence',
    ];

    for (const field of requiredFields) {
      if (!(field in settings)) {
        this.logger.error(
          `ReAct agent settings missing required field: ${field}`,
          AgentValidationService.name,
        );
        throw new Error(
          `ReAct agent settings missing required field: ${field}`,
        );
      }
    }
    this.logger.debug(
      'All required ReAct agent fields validated successfully',
      AgentValidationService.name,
    );

    // Validate cot configuration completeness
    this.logger.debug(
      'Validating CoT (Chain of Thought) configuration',
      AgentValidationService.name,
    );
    const cotConfig = settings.cot;
    if (!cotConfig || typeof cotConfig !== 'object') {
      this.logger.error(
        'ReAct agent CoT configuration validation failed - cot not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error(
        'ReAct agent settings.cot is required and must be a complete object',
      );
    }

    const requiredCotFields = [
      'enabled',
      'promptTemplate',
      'maxTokens',
      'temperature',
      'topP',
      'frequencyPenalty',
      'presencePenalty',
      'fewShotExamples',
      'stopSequences',
      'maxSteps',
      'selfConsistency',
      'temperatureModifiable',
      'maxTokensModifiable',
    ];

    for (const field of requiredCotFields) {
      if (!(field in cotConfig)) {
        this.logger.error(
          `ReAct agent CoT configuration missing required field: ${field}`,
          AgentValidationService.name,
        );
        throw new Error(
          `ReAct agent settings.cot missing required field: ${field}`,
        );
      }
    }
    this.logger.debug(
      'All required CoT fields validated successfully',
      AgentValidationService.name,
    );

    // Validate selfConsistency configuration
    this.logger.debug(
      'Validating selfConsistency configuration',
      AgentValidationService.name,
    );
    if (
      !cotConfig.selfConsistency ||
      typeof cotConfig.selfConsistency !== 'object'
    ) {
      this.logger.error(
        'ReAct agent selfConsistency configuration validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error('ReAct agent settings.cot.selfConsistency is required');
    }

    if (
      !('enabled' in cotConfig.selfConsistency) ||
      !('samples' in cotConfig.selfConsistency)
    ) {
      this.logger.error(
        'ReAct agent selfConsistency configuration missing required fields',
        AgentValidationService.name,
      );
      throw new Error(
        'ReAct agent settings.cot.selfConsistency must have enabled and samples fields',
      );
    }
    this.logger.debug(
      'SelfConsistency configuration validated successfully',
      AgentValidationService.name,
    );

    // Validate that when ReAct is disabled, maxSteps is set to 1
    if (!cotConfig.enabled && cotConfig.maxSteps !== 1) {
      this.logger.error(
        `ReAct validation failed - when disabled, maxSteps must be 1, got ${cotConfig.maxSteps}`,
        AgentValidationService.name,
      );
      throw new Error(
        'When ReAct is disabled, maxSteps must be set to 1 (no iteration allowed)',
      );
    }

    // Validate maxSteps range when enabled
    if (
      cotConfig.enabled &&
      (cotConfig.maxSteps < 1 || cotConfig.maxSteps > 100)
    ) {
      this.logger.error(
        `ReAct validation failed - maxSteps must be between 1-100 when enabled, got ${cotConfig.maxSteps}`,
        AgentValidationService.name,
      );
      throw new Error(
        'maxSteps must be between 1 and 100 when ReAct is enabled',
      );
    }
    this.logger.debug(
      `CoT enabled: ${cotConfig.enabled}, maxSteps: ${cotConfig.maxSteps}`,
      AgentValidationService.name,
    );

    // Validate intelligence configuration
    this.logger.debug(
      'Validating intelligence configuration',
      AgentValidationService.name,
    );
    const intelligenceConfig = settings.intelligence;
    if (!intelligenceConfig || typeof intelligenceConfig !== 'object') {
      this.logger.error(
        'ReAct agent intelligence configuration validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error(
        'ReAct agent settings.intelligence is required and must be a complete object',
      );
    }

    if (!intelligenceConfig.llm || typeof intelligenceConfig.llm !== 'object') {
      this.logger.error(
        'ReAct agent LLM configuration validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error('ReAct agent settings.intelligence.llm is required');
    }

    const requiredLlmFields = ['provider', 'model', 'tokenLimit'];
    for (const field of requiredLlmFields) {
      if (!(field in intelligenceConfig.llm)) {
        this.logger.error(
          `ReAct agent LLM configuration missing required field: ${field}`,
          AgentValidationService.name,
        );
        throw new Error(
          `ReAct agent settings.intelligence.llm missing required field: ${field}`,
        );
      }
    }
    this.logger.debug(
      `LLM provider: ${intelligenceConfig.llm.provider}, model: ${intelligenceConfig.llm.model}`,
      AgentValidationService.name,
    );
    this.logger.info(
      'ReAct agent configuration validation completed successfully',
      AgentValidationService.name,
    );
  }

  /**
   * Validate and fix Node configuration to ensure consistency
   */
  validateAndFixNodeConfig(node: Node): void {
    this.logger.info(
      `Validating and fixing node configuration for node: ${node.name || 'unnamed'}`,
      AgentValidationService.name,
    );

    if (!node.ReActConfig || !node.ReActConfig.cot) {
      this.logger.error(
        `Node ${node.name || 'unnamed'} validation failed - missing ReActConfig.cot`,
        AgentValidationService.name,
      );
      throw new Error(
        `Node ${node.name || 'unnamed'} must have ReActConfig.cot configuration`,
      );
    }

    // If ReAct is disabled, ensure maxSteps is 1
    if (!node.ReActConfig.cot.enabled && node.ReActConfig.cot.maxSteps !== 1) {
      this.logger.warn(
        `Fixing node ${node.name || 'unnamed'} - setting maxSteps to 1 for disabled ReAct`,
        AgentValidationService.name,
      );
      node.ReActConfig.cot.maxSteps = 1;
    }

    // Validate the ReActConfig
    this.validateReActAgentConfig(node.ReActConfig);
    this.logger.info(
      `Node ${node.name || 'unnamed'} configuration validated and fixed successfully`,
      AgentValidationService.name,
    );
  }

  /**
   * Validate Graph agent configuration
   */
  validateGraphAgentConfig(settings: GraphAgentConfig): void {
    this.logger.info(
      'Validating Graph agent configuration',
      AgentValidationService.name,
    );
    this.logger.debug(
      `Agent ID: ${settings?._id || 'unknown'}`,
      AgentValidationService.name,
    );

    if (!settings || typeof settings !== 'object') {
      this.logger.error(
        'Graph agent settings validation failed - settings not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error(
        'Graph agents require complete settings configuration. Settings cannot be empty or partial.',
      );
    }

    // Validate all required GraphAgentConfig fields are present
    const requiredFields = ['_id', 'nodes', 'edges', 'memory', 'checkpoints'];

    for (const field of requiredFields) {
      if (!(field in settings)) {
        this.logger.error(
          `Graph agent settings missing required field: ${field}`,
          AgentValidationService.name,
        );
        throw new Error(
          `Graph agent settings missing required field: ${field}`,
        );
      }
    }
    this.logger.debug(
      'All required Graph agent fields validated successfully',
      AgentValidationService.name,
    );

    // Validate nodes array
    this.logger.debug(
      `Validating nodes array - count: ${settings.nodes?.length || 0}`,
      AgentValidationService.name,
    );
    if (!Array.isArray(settings.nodes) || settings.nodes.length === 0) {
      this.logger.error(
        'Graph agent nodes validation failed - must be non-empty array',
        AgentValidationService.name,
      );
      throw new Error('Graph agent settings.nodes must be a non-empty array');
    }

    // Validate each node
    this.logger.debug(
      `Validating ${settings.nodes.length} nodes`,
      AgentValidationService.name,
    );
    for (const node of settings.nodes) {
      if (!node._id || !node.name || !node.description || !node.ReActConfig) {
        this.logger.error(
          `Graph agent node validation failed - missing required fields for node: ${node.name || 'unnamed'}`,
          AgentValidationService.name,
        );
        throw new Error(
          'Graph agent node must have _id, name, description, and ReActConfig fields',
        );
      }

      // Validate the ReActConfig for each node
      this.validateReActAgentConfig(node.ReActConfig);
    }
    this.logger.debug(
      'All nodes validated successfully',
      AgentValidationService.name,
    );

    // Validate edges array
    this.logger.debug(
      `Validating edges array - count: ${settings.edges?.length || 0}`,
      AgentValidationService.name,
    );
    if (!Array.isArray(settings.edges)) {
      this.logger.error(
        'Graph agent edges validation failed - must be array',
        AgentValidationService.name,
      );
      throw new Error('Graph agent settings.edges must be an array');
    }

    // Validate each edge
    this.logger.debug(
      `Validating ${settings.edges.length} edges`,
      AgentValidationService.name,
    );
    for (const edge of settings.edges) {
      if (!edge.from || !edge.to) {
        this.logger.error(
          `Graph agent edge validation failed - missing from/to fields`,
          AgentValidationService.name,
        );
        throw new Error('Graph agent edge must have from and to fields');
      }
    }
    this.logger.debug(
      'All edges validated successfully',
      AgentValidationService.name,
    );
    this.logger.info(
      'Graph agent configuration validation completed successfully',
      AgentValidationService.name,
    );

    // Validate memory configuration
    this.logger.debug(
      'Validating memory configuration',
      AgentValidationService.name,
    );
    if (!settings.memory || typeof settings.memory !== 'object') {
      this.logger.error(
        'Graph agent memory configuration validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error('Graph agent settings.memory is required');
    }

    // Validate checkpoints configuration
    this.logger.debug(
      'Validating checkpoints configuration',
      AgentValidationService.name,
    );
    if (!settings.checkpoints || typeof settings.checkpoints !== 'object') {
      this.logger.error(
        'Graph agent checkpoints configuration validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error('Graph agent settings.checkpoints is required');
    }
    this.logger.debug(
      'Memory and checkpoints configurations validated successfully',
      AgentValidationService.name,
    );
  }
  /**
   * Validate agent configuration by type (supports unique ReAct types)
   */
  validateAgentConfigByType(
    type: AgentType | string,
    settings: ReActAgentConfig | GraphAgentConfig,
  ): void {
    this.logger.info(
      `Validating agent configuration by type: ${type}`,
      AgentValidationService.name,
    );
    const baseType = ReActAgentTypeManager.getBaseType(type);
    this.logger.debug(
      `Base type determined: ${baseType}`,
      AgentValidationService.name,
    );

    switch (baseType) {
      case AgentType.REACT:
        this.logger.debug(
          'Validating as ReAct agent type',
          AgentValidationService.name,
        );
        this.validateReActAgentConfig(settings as ReActAgentConfig);
        break;

      case AgentType.GRAPH:
        this.logger.debug(
          'Validating as Graph agent type',
          AgentValidationService.name,
        );
        this.validateGraphAgentConfig(settings as GraphAgentConfig);
        break;

      case AgentType.BASE:
        this.logger.debug(
          'Validating as Base agent type',
          AgentValidationService.name,
        );
        // Base agents have more flexible configuration requirements
        if (settings && typeof settings !== 'object') {
          this.logger.error(
            'Base agent settings validation failed - must be object if provided',
            AgentValidationService.name,
          );
          throw new Error('Base agent settings must be an object if provided');
        }
        break;

      default:
        this.logger.error(
          `Unknown agent type: ${type}`,
          AgentValidationService.name,
        );
        throw new Error(`Unknown agent type: ${type}`);
    }

    this.logger.info(
      `Agent configuration validation completed for type: ${type}`,
      AgentValidationService.name,
    );
  }

  /**
   * Validate general agent options
   */
  validateAgentOptions(options: AgentOptions): void {
    this.logger.info('Validating agent options', AgentValidationService.name);

    if (!options || typeof options !== 'object') {
      this.logger.error(
        'Agent options validation failed - not provided or invalid',
        AgentValidationService.name,
      );
      throw new Error('Agent options must be provided and be an object');
    }

    if (!options.type) {
      this.logger.error(
        'Agent options validation failed - type is required',
        AgentValidationService.name,
      );
      throw new Error('Agent type is required');
    }

    if (!options.userId) {
      this.logger.error(
        'Agent options validation failed - userId is required',
        AgentValidationService.name,
      );
      throw new Error('User ID is required');
    }

    if (!options.conversationId) {
      this.logger.error(
        'Agent options validation failed - conversationId is required',
        AgentValidationService.name,
      );
      throw new Error('Conversation ID is required');
    }

    if (!Object.values(AgentType).includes(options.type as AgentType)) {
      this.logger.error(
        `Agent options validation failed - invalid type: ${options.type}`,
        AgentValidationService.name,
      );
      throw new Error(`Invalid agent type: ${options.type}`);
    }

    this.logger.debug(
      `Agent options validated - type: ${options.type}, userId: ${options.userId}, conversationId: ${options.conversationId}`,
      AgentValidationService.name,
    );
    this.logger.info(
      'Agent options validation completed successfully',
      AgentValidationService.name,
    );
  }
}
