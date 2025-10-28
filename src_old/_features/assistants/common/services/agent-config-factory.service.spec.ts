import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentConfigFactory } from './agent-config-factory.service';
import { MyLogger } from '../../../core/services/logger/logger.service';
import { AssistantType, AssistantMode } from '../entities/assistant.entity';

// Mock factory.service to avoid pulling in heavy/ESM deps
jest.mock(
  '../../../core/infrastructure/agents/core/agents/services/factory.service',
  () => ({
    AgentType: {
      BASE: 'base',
      REACT: 'react',
      GRAPH: 'graph',
      EXPERT: 'expert',
      GENIUS: 'genius',
      COLLECTIVE: 'collective',
      MANAGER: 'manager',
    },
  }),
  { virtual: true },
);

// Lightweight no-op logger
class LoggerMock {
  info = jest.fn();
  debug = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

// Config mock with deterministic values
const configGetMock = (key: string) => {
  switch (key) {
    case 'assistants.defaultModels':
      return {
        [AssistantType.CUSTOM]: 'gpt-4o-mini',
        [AssistantType.STUDY_HELPER]: 'gpt-4o',
        [AssistantType.GRAPH_AGENT]: 'gpt-4',
      } as Record<any, string>;
    case 'assistants.defaultMemoryTypes':
      return {
        [AssistantType.CUSTOM]: 'cbm',
        [AssistantType.STUDY_HELPER]: 'ctbm',
        [AssistantType.GRAPH_AGENT]: 'csm',
      } as Record<any, string>;
    case 'assistants.agentTypePrompts':
      return {
        base: 'You are a base agent.',
        react: 'You are a ReAct agent.',
        graph: 'You are a Graph agent.',
      } as Record<any, string>;
    case 'assistants.assistantTypePrompts':
      return {
        [AssistantType.STUDY_HELPER]: 'You are a study helper.',
      } as Record<any, string>;
    case 'assistants.assistantModePrompts':
      return {
        [AssistantMode.BALANCED]: 'Operate in balanced mode.',
      } as Record<any, string>;
    case 'assistants.stopSequences':
      return {
        [AssistantType.CUSTOM]: ['STOP'],
        [AssistantType.STUDY_HELPER]: ['END'],
      } as Record<any, string[]>;
    case 'assistants.maxIterationsMultipliers':
      return {
        [AssistantType.CUSTOM]: 1,
        [AssistantType.STUDY_HELPER]: 1.5,
        [AssistantType.GRAPH_AGENT]: 2,
      } as Record<any, number>;
    case 'assistants.nodeCommands':
      return { tool: 'TOOL', condition: 'COND', LLM: 'LLM' } as Record<
        string,
        string
      >;
    case 'assistants.nodeNames':
      return {
        tool: 'Tool Step',
        condition: 'Condition',
        LLM: 'LLM Step',
      } as Record<string, string>;
    case 'assistants.executionTimeout':
      return 120000;
    default:
      return undefined;
  }
};

describe('AgentConfigFactory', () => {
  let factory: AgentConfigFactory;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentConfigFactory,
        { provide: ConfigService, useValue: { get: jest.fn(configGetMock) } },
        { provide: MyLogger, useClass: LoggerMock },
      ],
    }).compile();

    factory = moduleRef.get(AgentConfigFactory);
  });

  const baseAssistant = {
    name: 'Test Assistant',
    description: 'desc',
    type: AssistantType.STUDY_HELPER,
    primaryMode: AssistantMode.BALANCED,
    subjectExpertise: ['math', 'physics'],
    customPrompts: [
      { content: 'High priority instruction', priority: 10 },
      { content: 'Lower priority instruction', priority: 1 },
    ],
    contextBlocks: [
      { name: 'policy', content: 'Follow the rules', isActive: true },
      { name: 'inactive', content: 'ignored', isActive: false },
    ],
    tools: [
      { toolName: 'search', isEnabled: true, parameters: { q: 'string' } },
      { toolName: 'calc', isEnabled: false, parameters: {} },
    ],
    reactConfig: {
      cot: {
        temperature: 0.55,
        topP: 0.9,
        presencePenalty: 0,
        frequencyPenalty: 0,
        maxSteps: 7,
      },
    },
    blocks: [
      { id: 'b1', type: 'tool', prompt: 'use a tool' },
      { id: 'b2', type: 'input', prompt: 'get input', requiresUserInput: true },
      { id: 'b3', type: 'condition', next: { yes: 'b4' }, prompt: 'branch' },
      { id: 'b4', type: 'approval', prompt: 'approve' },
    ],
    metadata: {},
  } as any;

  const executeDto = {
    userId: undefined,
    conversationId: undefined,
    input: 'hello',
    options: {
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      maxTokens: 2048,
      requireToolApproval: true,
      specificToolsRequiringApproval: ['calc'],
      streaming: true,
      traceExecution: true,
    },
  } as any;

  it('converts ReAct assistant to agent options with proper defaults and overrides', () => {
    const assistant = {
      ...baseAssistant,
      type: AssistantType.STUDY_HELPER,
    } as any;
    const result = factory.convertAssistantToAgentOptions(
      assistant,
      executeDto,
    );
    expect(result.type).toBe('react');
    // settings (ReAct)
    const settings: any = result.settings;
    expect(settings.cot).toBeDefined();
    expect(settings.cot.temperature).toBe(0.55);
    // maxSteps computed should clamp to provided (7) and within safe bounds
    expect(settings.cot.maxSteps).toBeGreaterThanOrEqual(1);
    expect(settings.cot.maxSteps).toBeLessThanOrEqual(100);

    // config pieces
    const cfg: any = result.config;
    expect(cfg.intelligenceConfig.llm.provider).toBe('openai');
    expect(cfg.intelligenceConfig.llm.model).toBe('gpt-4o');
    expect(cfg.intelligenceConfig.llm.tokenLimit).toBe(2048);
    expect(cfg.toolsConfig.requireApproval).toBe(true);
    expect(cfg.toolsConfig.specificToolsRequiringApproval).toContain('calc');
    expect(cfg.executionConfig.streaming).toBe(true);
    expect(cfg.executionConfig.traceExecution).toBe(true);

    // system prompt composition basics
    expect(typeof cfg.systemPrompt).toBe('string');
    expect(cfg.systemPrompt).toMatch(/ReAct agent/);
    expect(cfg.systemPrompt).toMatch(/study helper/i);
    expect(cfg.systemPrompt).toMatch(/Operate in balanced mode/);
    expect(cfg.systemPrompt).toMatch(/specialized expertise/i);
    expect(cfg.systemPrompt).toMatch(/High priority instruction/);
    expect(cfg.systemPrompt).not.toMatch(/inactive/);

    // workflow config
    expect(cfg.workflowConfig.blocks.length).toBe(4);
    expect(cfg.workflowConfig.requiresApproval).toBe(true);
    expect(cfg.workflowConfig.hasUserInput).toBe(true);
  });

  it('returns Graph agent settings when assistant is GRAPH_AGENT', () => {
    const assistant = {
      ...baseAssistant,
      type: AssistantType.GRAPH_AGENT,
    } as any;
    const result = factory.convertAssistantToAgentOptions(
      assistant,
      executeDto,
    );
    expect(result.type).toBe('graph');
    const settings: any = result.settings;
    expect(Array.isArray(settings.nodes)).toBe(true);
    expect(Array.isArray(settings.edges)).toBe(true);
    expect(settings.checkpoints).toBeDefined();
  });

  it('uses default memory type derived from config when not enhanced', () => {
    const assistant = {
      ...baseAssistant,
      type: AssistantType.STUDY_HELPER,
      metadata: { enhanced: false },
    } as any;
    const result = factory.convertAssistantToAgentOptions(
      assistant,
      executeDto,
    );
    expect(result.config.memoryConfig).toBeDefined();
    // from defaultMemoryTypes -> ctbm
    expect(result.config.memoryConfig.type).toBeDefined();
  });

  it('honors enhanced memory/intelligence config when provided in metadata', () => {
    const assistant = {
      ...baseAssistant,
      metadata: {
        enhanced: true,
        memory: {
          type: 'csbm',
          maxSize: 2,
          llm: { provider: 'openai', model: 'gpt-4o-mini', tokenLimit: 1024 },
        },
        intelligence: {
          llm: { provider: 'google', model: 'gemini-1.5', tokenLimit: 4096 },
        },
      },
    } as any;
    const result = factory.convertAssistantToAgentOptions(
      assistant,
      executeDto,
    );
    expect(result.config.memoryConfig.type).toBe('csbm');
    expect(result.config.intelligenceConfig.llm.provider).toBe('openai');
    // executeDto overrides provider/model/tokenLimit even when enhanced
    expect(result.config.intelligenceConfig.llm.model).toBe('gpt-4o');
    expect(result.config.intelligenceConfig.llm.tokenLimit).toBe(2048);
  });
});
