import { Test, TestingModule } from '@nestjs/testing';
import { MyLogger } from '@core/services/logger/logger.service';

// Mock the complex dependencies to avoid import issues
jest.mock(
  '@core/infrastructure/agents/core/agents/services/factory.service',
  () => ({
    AgentType: {
      BASE: 'base',
      REACT: 'react',
      GRAPH: 'graph',
    },
    ReActAgentTypeManager: {
      getBaseType: jest.fn((type) =>
        type.startsWith('react_') ? 'react' : type,
      ),
      isReActType: jest.fn(
        (type) => type === 'react' || type.startsWith('react_'),
      ),
    },
  }),
);

jest.mock('@core/infrastructure/agents/core/agents/types/agent.entity', () => ({
  AgentState: {
    READY: 'ready',
    INITIALIZING: 'initializing',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ERRORED: 'errored',
  },
}));

jest.mock(
  '@core/infrastructure/agents/components/llm/interfaces/llm.interface',
  () => ({
    Providers: {
      OPENAI: 'openai',
      ANTHROPIC: 'anthropic',
      GOOGLE: 'google',
      GROQ: 'groq',
      XAI: 'xai',
      NVIDIA: 'nvidia',
    },
  }),
);

jest.mock(
  '@core/infrastructure/agents/components/memory/memory.interface',
  () => ({
    AgentMemoryType: {
      ConversationBufferMemory: 'buffer',
    },
  }),
);

// Now import the validation service
import { AgentValidationService } from './validation.service';

describe('AgentValidationService', () => {
  let service: AgentValidationService;
  let mockLogger: jest.Mocked<MyLogger>;

  beforeEach(async () => {
    const mockLoggerImplementation = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn(),
      info: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentValidationService,
        {
          provide: MyLogger,
          useValue: mockLoggerImplementation,
        },
      ],
    }).compile();

    service = module.get<AgentValidationService>(AgentValidationService);
    mockLogger = module.get(MyLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize and log initialization message', () => {
    expect(mockLogger.info).toHaveBeenCalledWith(
      'AgentValidationService initializing',
      'AgentValidationService',
    );
  });

  describe('validateAgentOptions', () => {
    it('should validate valid agent options', () => {
      const validOptions = {
        type: 'react',
        userId: 'u_507f1f77bcf86cd799439011',
        conversationId: 'c_507f1f77bcf86cd799439012',
      };

      expect(() =>
        service.validateAgentOptions(validOptions as any),
      ).not.toThrow();
    });

    it('should throw error for missing type', () => {
      const invalidOptions = {
        type: undefined,
        userId: 'u_507f1f77bcf86cd799439011',
        conversationId: 'c_507f1f77bcf86cd799439012',
      } as any;

      expect(() => service.validateAgentOptions(invalidOptions)).toThrow(
        'Agent type is required',
      );
    });

    it('should throw error for missing userId', () => {
      const invalidOptions = {
        type: 'react',
        userId: undefined,
        conversationId: 'c_507f1f77bcf86cd799439012',
      } as any;

      expect(() => service.validateAgentOptions(invalidOptions)).toThrow(
        'User ID is required',
      );
    });

    it('should throw error for missing conversationId', () => {
      const invalidOptions = {
        type: 'react',
        userId: 'u_507f1f77bcf86cd799439011',
        conversationId: undefined,
      } as any;

      expect(() => service.validateAgentOptions(invalidOptions)).toThrow(
        'Conversation ID is required',
      );
    });

    it('should throw error for invalid object', () => {
      expect(() => service.validateAgentOptions(null as any)).toThrow(
        'Agent options must be provided and be an object',
      );

      expect(() => service.validateAgentOptions(undefined as any)).toThrow(
        'Agent options must be provided and be an object',
      );
    });
  });

  describe('validateReActAgentConfig', () => {
    const createMinimalValidConfig = () => ({
      _id: 'ra_507f1f77bcf86cd799439011',
      state: 'ready',
      userId: 'u_507f1f77bcf86cd799439011',
      name: 'Test Agent',
      description: 'Test Description',
      purpose: 'Test Purpose',
      enabled: true,
      cot: {
        enabled: true,
        promptTemplate: 'Think step by step: {input}',
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        fewShotExamples: [],
        stopSequences: [],
        maxSteps: 5,
        selfConsistency: {
          enabled: true,
          samples: 3,
        },
        temperatureModifiable: true,
        maxTokensModifiable: true,
      },
      tools: [],
      canModifyStorage: true,
      intelligence: {
        llm: {
          provider: 'openai',
          model: 'gpt-4',
          tokenLimit: 8000,
        },
        escalate: true,
        providerEscalationOptions: ['openai'],
        modelEscalationTable: {
          openai: [{ model: 'gpt-4', tokenLimit: 8000 }],
        },
      },
    });

    it('should validate a complete ReAct agent configuration', () => {
      const validConfig = createMinimalValidConfig();
      expect(() =>
        service.validateReActAgentConfig(validConfig as any),
      ).not.toThrow();
    });

    it('should throw error for null or undefined settings', () => {
      expect(() => service.validateReActAgentConfig(null as any)).toThrow(
        'ReAct agents require complete settings configuration. Settings cannot be empty or partial.',
      );

      expect(() => service.validateReActAgentConfig(undefined as any)).toThrow(
        'ReAct agents require complete settings configuration. Settings cannot be empty or partial.',
      );
    });

    it('should throw error for missing required fields', () => {
      const requiredFields = [
        '_id',
        'userId',
        'name',
        'description',
        'purpose',
        'cot',
        'intelligence',
      ];

      requiredFields.forEach((field) => {
        const incompleteConfig = createMinimalValidConfig();
        delete (incompleteConfig as any)[field];

        expect(() =>
          service.validateReActAgentConfig(incompleteConfig as any),
        ).toThrow(`ReAct agent settings missing required field: ${field}`);
      });
    });

    it('should throw error for invalid cot configuration', () => {
      const configWithInvalidCot = createMinimalValidConfig();
      (configWithInvalidCot as any).cot = null;

      expect(() =>
        service.validateReActAgentConfig(configWithInvalidCot as any),
      ).toThrow(
        'ReAct agent settings.cot is required and must be a complete object',
      );
    });

    it('should validate that when ReAct is disabled, maxSteps is 1', () => {
      const configWithDisabledReAct = createMinimalValidConfig();
      configWithDisabledReAct.cot.enabled = false;
      configWithDisabledReAct.cot.maxSteps = 5;

      expect(() =>
        service.validateReActAgentConfig(configWithDisabledReAct as any),
      ).toThrow(
        'When ReAct is disabled, maxSteps must be set to 1 (no iteration allowed)',
      );
    });

    it('should validate maxSteps range when enabled', () => {
      const configWithInvalidMaxSteps = createMinimalValidConfig();
      configWithInvalidMaxSteps.cot.maxSteps = 0;

      expect(() =>
        service.validateReActAgentConfig(configWithInvalidMaxSteps as any),
      ).toThrow('maxSteps must be between 1 and 100 when ReAct is enabled');

      configWithInvalidMaxSteps.cot.maxSteps = 101;
      expect(() =>
        service.validateReActAgentConfig(configWithInvalidMaxSteps as any),
      ).toThrow('maxSteps must be between 1 and 100 when ReAct is enabled');
    });
  });

  describe('validateGraphAgentConfig', () => {
    const createMinimalGraphConfig = () => ({
      _id: 'ga_507f1f77bcf86cd799439011',
      state: 'ready',
      nodes: [
        {
          _id: 'n_507f1f77bcf86cd799439011',
          name: 'Test Node',
          description: 'Test Description',
          ReActConfig: {
            _id: 'ra_507f1f77bcf86cd799439011',
            state: 'ready',
            userId: 'u_507f1f77bcf86cd799439011',
            name: 'Node Agent',
            description: 'Node Description',
            purpose: 'Node Purpose',
            enabled: true,
            cot: {
              enabled: true,
              promptTemplate: 'Think step by step: {input}',
              maxTokens: 1000,
              temperature: 0.7,
              topP: 0.9,
              frequencyPenalty: 0.0,
              presencePenalty: 0.0,
              fewShotExamples: [],
              stopSequences: [],
              maxSteps: 5,
              selfConsistency: {
                enabled: true,
                samples: 3,
              },
              temperatureModifiable: true,
              maxTokensModifiable: true,
            },
            tools: [],
            canModifyStorage: true,
            intelligence: {
              llm: {
                provider: 'openai',
                model: 'gpt-4',
                tokenLimit: 8000,
              },
              escalate: true,
              providerEscalationOptions: ['openai'],
              modelEscalationTable: {
                openai: [{ model: 'gpt-4', tokenLimit: 8000 }],
              },
            },
          },
        },
      ],
      edges: [],
      memory: { type: 'buffer' },
      checkpoints: { enabled: true, allowList: 'all' },
    });

    it('should validate a complete Graph agent configuration', () => {
      // Mock the validateReActAgentConfig method to avoid recursive validation
      jest
        .spyOn(service, 'validateReActAgentConfig')
        .mockImplementation(() => {});

      const validConfig = createMinimalGraphConfig();
      expect(() =>
        service.validateGraphAgentConfig(validConfig as any),
      ).not.toThrow();
    });

    it('should throw error for null or undefined settings', () => {
      expect(() => service.validateGraphAgentConfig(null as any)).toThrow(
        'Graph agents require complete settings configuration. Settings cannot be empty or partial.',
      );
    });

    it('should throw error for missing required fields', () => {
      const requiredFields = ['_id', 'nodes', 'edges', 'memory', 'checkpoints'];

      requiredFields.forEach((field) => {
        const incompleteConfig = createMinimalGraphConfig();
        delete (incompleteConfig as any)[field];

        expect(() =>
          service.validateGraphAgentConfig(incompleteConfig as any),
        ).toThrow(`Graph agent settings missing required field: ${field}`);
      });
    });

    it('should throw error for empty nodes array', () => {
      const configWithEmptyNodes = createMinimalGraphConfig();
      configWithEmptyNodes.nodes = [];

      expect(() =>
        service.validateGraphAgentConfig(configWithEmptyNodes as any),
      ).toThrow('Graph agent settings.nodes must be a non-empty array');
    });
  });

  describe('validateAndFixNodeConfig', () => {
    const createValidNode = () => ({
      _id: 'n_507f1f77bcf86cd799439011',
      name: 'Test Node',
      description: 'Test Description',
      llm: {
        provider: 'openai',
        model: 'gpt-4',
        tokenLimit: 8000,
      },
      ReActConfig: {
        _id: 'ra_507f1f77bcf86cd799439011',
        state: 'ready',
        userId: 'u_507f1f77bcf86cd799439011',
        name: 'Node Agent',
        description: 'Node Description',
        purpose: 'Node Purpose',
        enabled: true,
        cot: {
          enabled: true,
          promptTemplate: 'Think step by step: {input}',
          maxTokens: 1000,
          temperature: 0.7,
          topP: 0.9,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          fewShotExamples: [],
          stopSequences: [],
          maxSteps: 5,
          selfConsistency: {
            enabled: true,
            samples: 3,
          },
          temperatureModifiable: true,
          maxTokensModifiable: true,
        },
        tools: [],
        canModifyStorage: true,
        intelligence: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            tokenLimit: 8000,
          },
          escalate: true,
          providerEscalationOptions: ['openai'],
          modelEscalationTable: {
            openai: [{ model: 'gpt-4', tokenLimit: 8000 }],
          },
        },
      },
    });

    it('should validate and fix node configuration successfully', () => {
      const validNode = createValidNode();
      jest
        .spyOn(service, 'validateReActAgentConfig')
        .mockImplementation(() => {});

      expect(() =>
        service.validateAndFixNodeConfig(validNode as any),
      ).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Node Test Node configuration validated and fixed successfully',
        'AgentValidationService',
      );
    });

    it('should fix maxSteps when ReAct is disabled', () => {
      const nodeWithDisabledReAct = createValidNode();
      nodeWithDisabledReAct.ReActConfig.cot.enabled = false;
      nodeWithDisabledReAct.ReActConfig.cot.maxSteps = 5;

      jest
        .spyOn(service, 'validateReActAgentConfig')
        .mockImplementation(() => {});

      service.validateAndFixNodeConfig(nodeWithDisabledReAct as any);

      expect(nodeWithDisabledReAct.ReActConfig.cot.maxSteps).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Fixing node Test Node - setting maxSteps to 1 for disabled ReAct',
        'AgentValidationService',
      );
    });

    it('should throw error for missing ReActConfig', () => {
      const nodeWithoutReActConfig = createValidNode();
      delete (nodeWithoutReActConfig as any).ReActConfig;

      expect(() =>
        service.validateAndFixNodeConfig(nodeWithoutReActConfig as any),
      ).toThrow('Node Test Node must have ReActConfig.cot configuration');
    });

    it('should handle nodes without names', () => {
      const nodeWithoutName = createValidNode();
      delete (nodeWithoutName as any).name;

      jest
        .spyOn(service, 'validateReActAgentConfig')
        .mockImplementation(() => {});

      expect(() =>
        service.validateAndFixNodeConfig(nodeWithoutName as any),
      ).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Validating and fixing node configuration for node: unnamed',
        'AgentValidationService',
      );
    });
  });
});
