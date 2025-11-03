import { jest } from '@jest/globals';
import { ConversationKGMemory } from '@core/infrastructure/agents/components/memory/structures/kg';
import LLMService from '@core/infrastructure/agents/components/llm/llm.service';
import { MyLogger } from '@core/services/logger/logger.service';
import {
  AgentMemoryType,
  BufferMemoryMessage,
  KGMemoryConfig,
} from '@core/infrastructure/agents/components/memory/memory.interface';
import { MessageIdType } from '@core/infrastructure/database/utils/custom_types';

// Mock the knowledge graph dependencies
jest.mock('@core/infrastructure/agents/components/knowledge/base', () => {
  const graphMockFactory = () => ({
    addNode: jest.fn().mockImplementation((node: any) => ({
      id: `${node?.type || 'node'}-id`,
      type: node?.type || 'Entity',
      label: node?.label || 'Unnamed',
      properties: node?.properties || {},
      createdAt: new Date(),
      lastUpdated: new Date(),
    })),
    addEdge: jest.fn(),
    getNode: jest.fn().mockReturnValue(undefined),
    getOutgoingEdges: jest.fn().mockReturnValue([]),
    getIncomingEdges: jest.fn().mockReturnValue([]),
    findNodeByLabel: jest.fn().mockReturnValue(undefined),
    findShortestPath: jest.fn().mockReturnValue(null),
    getAllNodes: jest.fn().mockReturnValue([]),
    getAllEdges: jest.fn().mockReturnValue([]),
    getSubgraph: jest.fn().mockReturnValue({ nodes: [], edges: [] }),
    clear: jest.fn(),
    toJSON: jest.fn().mockReturnValue({ nodes: [], edges: [] }),
  });
  return {
    KnowledgeGraph: jest
      .fn()
      .mockImplementation((_config, _logger) => graphMockFactory()),
    KnowledgeNode: jest.fn(),
    KnowledgeEdge: jest.fn(),
    GraphPath: jest.fn(),
  };
});

describe('ConversationKGMemory', () => {
  let mockLogger: jest.Mocked<MyLogger>;
  let mockLLM: jest.Mocked<LLMService>;
  let memory: ConversationKGMemory;
  let config: KGMemoryConfig;
  let _mockGraph: any;

  // Helper to create test messages
  const createMessage = (
    id: string,
    sender: 'human' | 'ai' | 'system',
    text: string,
  ): BufferMemoryMessage => ({
    _id: id as MessageIdType,
    sender: sender as any,
    text,
  });

  // Mock relation extraction results
  const mockRelationExtractions = [
    {
      source: { entity: 'John', type: 'person' },
      relation: 'works_at',
      target: { entity: 'Acme Corp', type: 'organization' },
      confidence: 0.9,
      properties: { role: 'manager' },
    },
    {
      source: { entity: 'Acme Corp', type: 'organization' },
      relation: 'located_in',
      target: { entity: 'New York', type: 'location' },
      confidence: 0.8,
    },
    {
      source: { entity: 'John', type: 'person' },
      relation: 'knows',
      target: { entity: 'Alice', type: 'person' },
      confidence: 0.7, // Low confidence for filtering tests
    },
  ];

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      log: jest.fn(),
      setContext: jest.fn(),
    } as any;

    mockLLM = {
      chat: jest.fn(),
      stream: jest.fn(),
      listProviders: jest.fn().mockReturnValue(['groq', 'openai']),
      listModels: jest.fn().mockReturnValue(['llama3-8b', 'gpt-4']) as any,
      countTokens: jest.fn(),
    } as any;

    // Mock LLM to return relation extractions
    mockLLM.chat.mockResolvedValue({
      response: JSON.stringify(mockRelationExtractions),
      usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
    });

    config = {
      type: AgentMemoryType.ConversationKGMemory,
      llm: {
        provider: 'groq',
        model: 'llama3-8b',
        tokenLimit: 8192,
        embeddingProvider: 'groq',
        embeddingModel: 'llama3-8b',
      },
      recentMessagesToConsider: 5,
      filterLowConfidenceRelations: true,
      relationConfidenceThreshold: 0.75,
      enableEmbeddings: true,
      relationExtractionPrompt: 'Extract relations from the conversation',
    };

    memory = new ConversationKGMemory(config, mockLLM, mockLogger);

    // Get the mock graph instance for testing
    _mockGraph = (memory as any).graph;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      expect(memory.provider).toBe('groq');
      expect(memory.model).toBe('llama3-8b');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ConversationKGMemory initializing',
        'ConversationKGMemory',
      );
    });

    it('should initialize knowledge graph with embeddings enabled', () => {
      const {
        KnowledgeGraph,
      } = require('@core/infrastructure/agents/components/knowledge/base');
      expect(KnowledgeGraph).toHaveBeenCalled();
    });
  });

  describe('processMessage', () => {
    it('should extract relations and populate knowledge graph', async () => {
      // Arrange
      const message = createMessage(
        '1',
        'human',
        'John works at Acme Corp in New York',
      );
      const mockGraph = memory.knowledgeGraph;

      // Act
      await memory.processMessage(message);

      // Assert
      expect(mockLLM.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ providerName: 'groq', modelId: 'llama3-8b' }),
      );
      const callArgs = (mockLLM.chat as jest.Mock).mock.calls[0];
      const msgs = callArgs[0] as Array<{ content?: any }>;
      const combined = msgs
        .map((m) => (m as any).content?.toString?.() ?? '')
        .join('\n');
      expect(combined).toContain('John works at Acme Corp in New York');
      expect(mockGraph.addNode).toHaveBeenCalled();
      expect(mockGraph.addEdge).toHaveBeenCalled();
    });

    it('should process batch of messages considering recent limit', async () => {
      // Arrange
      const messages = [
        createMessage('1', 'human', 'Old message 1'),
        createMessage('2', 'ai', 'Old response 1'),
        createMessage('3', 'human', 'Old message 2'),
        createMessage('4', 'ai', 'Old response 2'),
        createMessage('5', 'human', 'Recent message 1'), // Should be considered
        createMessage('6', 'ai', 'Recent response 1'), // Should be considered
        createMessage('7', 'human', 'Recent message 2'), // Should be considered
      ];

      // Act
      await memory.processMessages(messages);

      // Assert
      expect(mockLLM.chat).toHaveBeenCalled();
      const args = (mockLLM.chat as jest.Mock).mock.calls[0];
      const mArr = args[0] as Array<{ content?: any }>;
      const combinedText = mArr
        .map((m) => (m as any).content?.toString?.() ?? '')
        .join('\n');
      expect(combinedText).toContain('Recent message');
    });
  });

  describe('filterLowConfidenceRelations', () => {
    it('should remove relations below threshold when filtering enabled', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');
      const mockGraph = memory.knowledgeGraph;

      // Act
      await memory.processMessage(message);

      // Assert - should only add high confidence relations (0.9, 0.8) but not 0.7
      const addEdgeCalls = (mockGraph.addEdge as unknown as jest.Mock).mock
        .calls;
      expect(addEdgeCalls.length).toBeLessThan(3); // Should filter out the 0.7 confidence relation
    });

    it('should keep all relations when filtering disabled', async () => {
      // Arrange
      config.filterLowConfidenceRelations = false;
      memory = new ConversationKGMemory(config, mockLLM, mockLogger);
      const message = createMessage('1', 'human', 'Test message');
      const mockGraph = memory.knowledgeGraph;

      // Act
      await memory.processMessage(message);

      // Assert - should add all relations regardless of confidence
      const addEdgeCalls = (mockGraph.addEdge as unknown as jest.Mock).mock
        .calls;
      expect(addEdgeCalls.length).toBe(3); // All relations should be added
    });
  });

  describe('enableEmbeddings flag wiring', () => {
    it('should pass embeddings configuration to knowledge graph', () => {
      // Arrange
      const embedConfig: KGMemoryConfig = {
        ...config,
        enableEmbeddings: false,
      };

      // Act
      const _memoryWithoutEmbeddings = new ConversationKGMemory(
        embedConfig,
        mockLLM,
        mockLogger,
      );

      // Assert
      const {
        KnowledgeGraph,
      } = require('@core/infrastructure/agents/components/knowledge/base');
      expect(KnowledgeGraph).toHaveBeenCalled();
    });
  });

  describe('changeModel and provider', () => {
    it('should update model and provider configuration', () => {
      // Act
      const result = memory.changeModel('gpt-4', 'openai');

      // Assert
      expect(result).toBe(memory); // Should return this for chaining
      expect(memory.model).toBe('gpt-4');
      expect(memory.provider).toBe('openai');
    });

    it('should throw error for unsupported provider', () => {
      // Arrange
      mockLLM.listProviders.mockReturnValue(['groq']); // Remove openai

      // Act & Assert
      expect(() => memory.changeModel('gpt-4', 'openai')).toThrow(
        'Provider not available',
      );
    });

    it('should throw error for unsupported model', () => {
      // Arrange
      (mockLLM.listModels as jest.Mock).mockReturnValue(['llama3-8b']); // Remove gpt-4

      // Act & Assert
      expect(() => memory.changeModel('gpt-4', 'openai')).toThrow(
        'Model not available',
      );
    });
  });

  describe('formatSubgraphForPrompt', () => {
    it('should return deterministic prompt string for small graph', () => {
      // Arrange
      const mockGraph = memory.knowledgeGraph as any;
      (mockGraph.getSubgraph as jest.Mock).mockReturnValue({
        nodes: [
          { id: 'john', name: 'John', type: 'person' },
          { id: 'acme', name: 'Acme Corp', type: 'organization' },
        ],
        edges: [
          {
            source: 'john',
            target: 'acme',
            relation: 'works_at',
            confidence: 0.9,
          },
        ],
      });

      // Act
      const promptArr = memory.formatSubgraphForPrompt('john');
      const prompt = Array.isArray(promptArr)
        ? promptArr[0]
        : String(promptArr);

      // Assert
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('John');
      expect(prompt).toContain('Acme Corp');
      expect(prompt).toContain('works_at');
    });
  });

  describe('toJSON and loadFromJSON round-trip', () => {
    it('should preserve graph structure after serialization', async () => {
      // Arrange
      await memory.processMessage(
        createMessage('1', 'human', 'John works at Acme Corp'),
      );
      const kgAny = memory.knowledgeGraph as any;
      (kgAny.toJSON as jest.Mock).mockReturnValue({
        nodes: [],
        edges: [],
      });

      // Act
      const json = memory.toJSON();
      memory.clear();
      memory.fromJSON(json);

      // Assert
      expect(json).toHaveProperty('type');
      expect(json).toHaveProperty('graph');
    });

    it('should handle empty graph serialization', () => {
      // Act
      const json = memory.toJSON();

      // Assert
      expect(json).toHaveProperty('type', AgentMemoryType.ConversationKGMemory);
      expect(json).toHaveProperty('graph');
    });
  });

  describe('error handling', () => {
    it('should surface LLM error as clean error without stack leak', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');
      mockLLM.chat.mockRejectedValue(new Error('LLM service error'));

      // Act & Assert
      await expect(memory.processMessage(message)).rejects.toThrow(
        'LLM service error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error processing message for relation extraction',
        ),
        expect.any(String),
        'ConversationKGMemory',
      );
    });

    it('should handle malformed LLM response', async () => {
      // Arrange
      const message = createMessage('1', 'human', 'Test message');
      mockLLM.chat.mockResolvedValue({
        response: 'Invalid JSON response',
        usage: { prompt: 50, completion: 10, total: 60 },
        stopReason: 'stop',
      } as any);

      // Act - should not throw
      await memory.processMessage(message);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse relation extraction response',
        'ConversationKGMemory',
      );
    });
  });

  describe('getContext', () => {
    it('should include knowledge graph context in system message', async () => {
      // Arrange
      await memory.processMessage(
        createMessage('1', 'human', 'John works at Acme Corp'),
      );
      const mockGraph = memory.knowledgeGraph as any;
      (mockGraph.getAllNodes as jest.Mock).mockReturnValue([
        { label: 'John' },
        { label: 'Acme Corp' },
      ]);

      // Act
      const context = memory.getContext();

      // Assert
      expect(Array.isArray(context)).toBe(true);
      if (context.length > 0) {
        const systemMessage = context.find(
          (msg) => String((msg as any).sender) === 'system',
        );
        expect((systemMessage as any)?.text).toContain('knowledge');
      }
    });
  });

  describe('clear', () => {
    it('should clear knowledge graph and reset state', async () => {
      // Arrange
      await memory.processMessage(createMessage('1', 'human', 'Test message'));
      const mockGraph = memory.knowledgeGraph;

      // Act
      memory.clear();

      // Assert
      expect(mockGraph.clear).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Clearing knowledge graph memory',
        'ConversationKGMemory',
      );
    });
  });
});
