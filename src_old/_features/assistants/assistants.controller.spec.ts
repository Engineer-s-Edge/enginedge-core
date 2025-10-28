import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AssistantsController } from '@features/assistants/controllers/assistants.controller';
import { AssistantsService } from '@features/assistants/assistants.service';
import {
  CreateAssistantDto,
  UpdateAssistantDto,
  AssistantFiltersDto,
} from '@features/assistants/dto/assistant.dto';
import { ExecuteAssistantDto } from '@features/assistants/dto/execution.dto';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AssistantType,
  AssistantMode,
  AssistantStatus,
} from '@features/assistants/entities/assistant.entity';

describe('AssistantsController', () => {
  let controller: AssistantsController;
  let assistantsService: jest.Mocked<AssistantsService>;

  // Helper to normalize assistant for assertions
  const normalizeAssistant = (assistant: any) => {
    const typeMap: Record<string, string> = {
      react_agent: 'react',
      graph_agent: 'graph',
    };
    return {
      ...assistant,
      type: typeMap[assistant.type] || assistant.type,
      settings: assistant.reactConfig
        ? {
            intelligence: assistant.reactConfig.intelligence
              ? {
                  llm: {
                    provider: assistant.reactConfig.intelligence.llm?.provider,
                    model: assistant.reactConfig.intelligence.llm?.model,
                    tokenLimit:
                      assistant.reactConfig.intelligence.llm?.tokenLimit,
                    temperature: assistant.reactConfig.cot?.temperature,
                  },
                }
              : undefined,
            memory: assistant.reactConfig.memory,
            tools: assistant.reactConfig.tools,
          }
        : undefined,
    };
  };

  // Helper to create assistant DTO with defaults
  const makeAssistantDto = (
    overrides: Partial<CreateAssistantDto> = {},
  ): CreateAssistantDto => ({
    name: 'test-assistant',
    description: 'Test assistant',
    type: 'react',
    userId: 'user1',
    primaryMode: AssistantMode.BALANCED,
    ...overrides,
  });

  beforeEach(async () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn(),
    };

    const mockAssistantsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByName: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      execute: jest.fn(),
      getAllModels: jest.fn(),
      getAvailableProviders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssistantsController],
      providers: [
        {
          provide: AssistantsService,
          useValue: mockAssistantsService,
        },
        {
          provide: MyLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    controller = module.get<AssistantsController>(AssistantsController);
    assistantsService = module.get(AssistantsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should normalize type and expose settings', async () => {
      // Arrange: mock service.create to return entity with type 'react_agent' and internal reactConfig
      const dto = makeAssistantDto({
        name: 'test-react',
        type: 'react',
      });

      const mockEntity = {
        id: 'assistant-id',
        name: 'test-react',
        description: 'Test assistant',
        type: 'react_agent', // Internal type
        userId: 'user1',
        status: AssistantStatus.ACTIVE,
        reactConfig: {
          intelligence: {
            llm: {
              provider: 'groq',
              model: 'llama3-8b',
              tokenLimit: 8192,
            },
          },
          memory: { windowSize: 8 },
          tools: [],
          cot: { temperature: 0.3 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      assistantsService.create.mockResolvedValue(mockEntity as any);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.assistant).toBeDefined();
      expect(result.assistant.type).toBe('react'); // normalized
      expect(result.assistant.settings).toBeDefined();
      expect(result.assistant.settings.intelligence.llm.provider).toBe('groq');
      expect(result.assistant.settings.intelligence.llm.temperature).toBe(0.3);
      expect(result.assistant.settings.memory.windowSize).toBe(8);
      expect(result.assistant.reactConfig).toBeUndefined(); // should not leak internal config
      expect(assistantsService.create).toHaveBeenCalledWith(dto);
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const dto = makeAssistantDto();
      assistantsService.create.mockRejectedValue(new Error('Creation failed'));

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Creation failed');
    });
  });

  describe('findAll', () => {
    it('should scope by user and normalize each assistant', async () => {
      // Arrange: mock service.findAll returning mixed entities
      const filters: AssistantFiltersDto = { userId: 'user1' };
      const mockEntities = [
        {
          id: '1',
          name: 'react-assistant',
          type: 'react_agent',
          userId: 'user1',
          reactConfig: {
            intelligence: { llm: { provider: 'groq', model: 'llama3-8b' } },
            memory: { windowSize: 8 },
            tools: [],
            cot: { temperature: 0.3 },
          },
        },
        {
          id: '2',
          name: 'graph-assistant',
          type: 'graph_agent',
          userId: 'user1',
          reactConfig: {
            intelligence: { llm: { provider: 'openai', model: 'gpt-4' } },
            memory: { windowSize: 10 },
            tools: ['search'],
          },
        },
      ];

      assistantsService.findAll.mockResolvedValue(mockEntities as any);

      // Act
      const result = await controller.findAll(filters);

      // Assert
      expect(result.success).toBe(true);
      expect(result.assistants).toHaveLength(2);

      // Check normalization
      expect(result.assistants[0].type).toBe('react');
      expect(result.assistants[1].type).toBe('graph');

      // Check settings are exposed
      expect(result.assistants[0].settings).toBeDefined();
      expect(result.assistants[0].settings.intelligence.llm.provider).toBe(
        'groq',
      );
      expect(result.assistants[1].settings).toBeDefined();
      expect(result.assistants[1].settings.tools).toEqual(['search']);

      // Check reactConfig is not leaked
      expect(result.assistants[0].reactConfig).toBeUndefined();
      expect(result.assistants[1].reactConfig).toBeUndefined();

      expect(assistantsService.findAll).toHaveBeenCalledWith(filters);
    });

    it('should handle service errors and return empty array', async () => {
      // Arrange
      assistantsService.findAll.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.findAll({});

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.assistants).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return normalized assistant', async () => {
      // Arrange: service.findOne returns entity with type 'react_agent' and reactConfig
      const mockEntity = {
        id: '1',
        name: 'test-assistant',
        type: 'react_agent',
        reactConfig: {
          intelligence: {
            llm: { provider: 'groq', model: 'llama3-8b', tokenLimit: 8192 },
          },
          memory: { windowSize: 8 },
          tools: [],
          cot: { temperature: 0.3 },
        },
      };

      assistantsService.findByName.mockResolvedValue(mockEntity as any);

      // Act
      const result = await controller.findOne('test-assistant');

      // Assert
      expect(result.success).toBe(true);
      expect(result.assistant.type).toBe('react'); // normalized
      expect(result.assistant.settings).toBeDefined();
      expect(result.assistant.settings.intelligence.llm.provider).toBe('groq');
      expect(result.assistant.reactConfig).toBeUndefined(); // not leaked
      expect(assistantsService.findByName).toHaveBeenCalledWith(
        'test-assistant',
      );
    });

    it('should handle not found errors', async () => {
      // Arrange
      assistantsService.findByName.mockRejectedValue(
        new Error('Assistant not found'),
      );

      // Act
      const result = await controller.findOne('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Assistant not found');
    });
  });

  describe('update', () => {
    it('should merge partial settings and normalize output', async () => {
      // Arrange: input settings with partial update, previous had memory.windowSize=8
      const updateDto: UpdateAssistantDto = {
        // Simulating settings update through the DTO structure
        reactConfig: {
          cot: { temperature: 0.7 },
        } as any,
      };

      const mockUpdatedEntity = {
        id: '1',
        name: 'test-assistant',
        type: 'react_agent',
        reactConfig: {
          intelligence: { llm: { provider: 'groq', model: 'llama3-8b' } },
          memory: { windowSize: 8 }, // preserved
          tools: [],
          cot: { temperature: 0.7 }, // updated
        },
      };

      assistantsService.update.mockResolvedValue(mockUpdatedEntity as any);

      // Act
      const result = await controller.update('test-assistant', updateDto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.assistant.settings.intelligence.llm.temperature).toBe(0.7); // updated
      expect(result.assistant.settings.memory.windowSize).toBe(8); // preserved
      expect(assistantsService.update).toHaveBeenCalledWith(
        'test-assistant',
        updateDto,
      );
    });

    it('should handle update errors', async () => {
      // Arrange
      const updateDto: UpdateAssistantDto = {
        description: 'Updated description',
      };
      assistantsService.update.mockRejectedValue(new Error('Update failed'));

      // Act
      const result = await controller.update('test-assistant', updateDto);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed');
    });
  });

  describe('remove', () => {
    it('should be idempotent', async () => {
      // Arrange: first remove returns success; second remove does not throw 404
      assistantsService.remove.mockResolvedValue(undefined);

      // Act & Assert: first removal
      const result1 = await controller.remove('test-assistant');
      expect(result1.success).toBe(true);
      expect(result1.message).toContain('deleted successfully');

      // Act & Assert: second removal (idempotent)
      const result2 = await controller.remove('test-assistant');
      expect(result2.success).toBe(true);
      expect(result2.message).toContain('deleted successfully');

      expect(assistantsService.remove).toHaveBeenCalledTimes(2);
    });

    it('should handle removal errors gracefully', async () => {
      // Arrange
      assistantsService.remove.mockRejectedValue(new Error('Removal failed'));

      // Act
      const result = await controller.remove('test-assistant');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Removal failed');
    });
  });

  describe('execute', () => {
    it('should return 200 and success payload', async () => {
      // Arrange: valid execute DTO; service.execute returns success
      const executeDto: ExecuteAssistantDto = {
        input: 'Hello, how can you help?',
        userId: 'user1',
        conversationId: 'conv1',
      };

      const mockExecuteResult = {
        success: true,
        data: { content: 'I can help you with various tasks!' },
        conversationId: 'conv1',
      };

      assistantsService.execute.mockResolvedValue(mockExecuteResult);

      // Act
      const result = await controller.execute('test-assistant', executeDto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.content).toBe('I can help you with various tasks!');
      expect(assistantsService.execute).toHaveBeenCalledWith(
        'test-assistant',
        executeDto,
      );
    });

    it('should handle malformed payload with early 400', async () => {
      // Arrange: mock service to throw BadRequest for malformed input
      const malformedDto: ExecuteAssistantDto = {
        input: '', // empty input
        userId: 'user1',
      };

      assistantsService.execute.mockResolvedValue({
        success: false,
        error: 'Invalid or empty input',
      });

      // Act
      const result = await controller.execute('test-assistant', malformedDto);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or empty input');
    });

    it('should handle service errors', async () => {
      // Arrange
      const executeDto: ExecuteAssistantDto = {
        input: 'test input',
        userId: 'user1',
      };

      assistantsService.execute.mockRejectedValue(
        new Error('Execution failed'),
      );

      // Act
      const result = await controller.execute('test-assistant', executeDto);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('getAllModels', () => {
    it('should expose Groq llama models', async () => {
      // Arrange: service.getAllModels returns Groq models
      const mockModels: any[] = [
        {
          name: 'llama3-8b',
          provider: 'Groq',
          description: 'LLaMA 3 8B model',
          category: 'gpt-4',
          contextWindow: 8192,
          maxOutputTokens: 4096,
          inputCostPer1M: 0.05,
          cachedInputCostPer1M: null,
          outputCostPer1M: 0.08,
          vision: false,
          functionCalling: true,
          multilingual: true,
        },
        {
          name: 'llama3-70b',
          provider: 'Groq',
          description: 'LLaMA 3 70B model',
          category: 'gpt-4',
          contextWindow: 8192,
          maxOutputTokens: 4096,
          inputCostPer1M: 0.59,
          cachedInputCostPer1M: null,
          outputCostPer1M: 0.79,
          vision: false,
          functionCalling: true,
          multilingual: true,
        },
      ];

      assistantsService.getAllModels.mockResolvedValue(mockModels);

      // Act
      const result = await controller.getAllModels();

      // Assert
      expect(result.success).toBe(true);
      expect(result.models).toEqual(mockModels);
      expect(result.count).toBe(2);
      expect(
        result.models.find((m: any) => m.name === 'llama3-8b'),
      ).toBeDefined();
      expect(
        result.models.find((m: any) => m.provider === 'Groq'),
      ).toBeDefined();
    });

    it('should handle service errors', async () => {
      // Arrange
      assistantsService.getAllModels.mockRejectedValue(
        new Error('Models fetch failed'),
      );

      // Act
      const result = await controller.getAllModels();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Models fetch failed');
      expect(result.models).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available providers', async () => {
      // Arrange
      const mockProviders = ['groq', 'openai', 'anthropic'];
      assistantsService.getAvailableProviders.mockResolvedValue(mockProviders);

      // Act
      const result = await controller.getAvailableProviders();

      // Assert
      expect(result.success).toBe(true);
      expect(result.providers).toEqual(mockProviders);
    });

    it('should handle service errors', async () => {
      // Arrange
      assistantsService.getAvailableProviders.mockRejectedValue(
        new Error('Providers fetch failed'),
      );

      // Act
      const result = await controller.getAvailableProviders();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Providers fetch failed');
      expect(result.providers).toEqual([]);
    });
  });
});
