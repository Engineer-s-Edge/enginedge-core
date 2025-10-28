import {
  AgentFactoryService,
  AgentType,
  ReActAgentTypeManager,
} from './factory.service';

// Lightweight stubs for constructor deps
class ToolkitStub {}
class MemoryStub {
  async load() {}
}
class LLMStub {}
class ConversationRepoStub {}
class VectorStoreStub {}
class CheckpointStub {}
class LoaderStub {}

// Spy-able Base/Agents
jest.mock('../structures/base', () => {
  return {
    __esModule: true,
    default: class BaseAgentMock {
      switchConversation = jest.fn(async () => {});
      on = jest.fn();
      removeAllListeners = jest.fn();
      constructor(
        public toolkit: any,
        public memory: any,
        public llm: any,
        public conversationRepository: any,
        public vectorStore: any,
        public checkpointService: any,
        public loaderService: any,
        public config: any,
        public userId: any,
        public logger: any,
      ) {}
    },
  };
});

jest.mock('../structures/react', () => {
  return {
    __esModule: true,
    ReActAgent: class ReActAgentMock {
      switchConversation = jest.fn(async () => {});
      on = jest.fn();
      removeAllListeners = jest.fn();
      memory = { load: jest.fn(async () => {}) } as any;
      memoryConfig = { type: 'buffer' } as any;
      constructor(
        public toolkit: any,
        public memorySvc: any,
        public llm: any,
        public conversationRepository: any,
        public vectorStore: any,
        public checkpointService: any,
        public loaderService: any,
        public settings: any,
        public fullConfig: any,
        public userId: any,
        public logger: any,
      ) {}
    },
  };
});

jest.mock('../structures/graph', () => {
  return {
    __esModule: true,
    default: class GraphAgentMock {
      switchConversation = jest.fn(async () => {});
      on = jest.fn();
      removeAllListeners = jest.fn();
      memory = { load: jest.fn(async () => {}) } as any;
      memoryConfig = { type: 'buffer' } as any;
      constructor(
        public toolkit: any,
        public memorySvc: any,
        public llm: any,
        public conversationRepository: any,
        public vectorStore: any,
        public checkpointService: any,
        public loaderService: any,
        public settings: any,
        public fullConfig: any,
        public userId: any,
        public conversationId: any,
        public logger: any,
      ) {}
    },
  };
});

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('AgentFactoryService', () => {
  const userId = 'user-1' as any;
  const conversationId = 'conv-1' as any;
  let svc: AgentFactoryService;
  let logger: any;

  beforeEach(() => {
    logger = makeLogger();
    svc = new AgentFactoryService(
      new ToolkitStub() as any,
      new MemoryStub() as any,
      new LLMStub() as any,
      new ConversationRepoStub() as any,
      new VectorStoreStub() as any,
      new CheckpointStub() as any,
      new LoaderStub() as any,
      logger,
    );
  });

  it('creates Base agent and switches conversation', async () => {
    const agent = await svc.createBaseAgent(userId, conversationId, {}, {});
    expect(agent.switchConversation).toHaveBeenCalledWith(conversationId);
  });

  it('creates ReAct agent and preloads memory', async () => {
    const agent = (await svc.createReActAgent(
      userId,
      conversationId,
      { name: 'A', description: 'd' } as any,
      {},
    )) as any;
    expect(agent.switchConversation).toHaveBeenCalledWith(conversationId);
    expect(agent.memory.load).toHaveBeenCalled();
  });

  it('creates Graph agent and preloads memory', async () => {
    const agent = (await svc.createGraphAgent(
      userId,
      conversationId,
      { nodes: [], edges: [] } as any,
      {},
    )) as any;
    expect(agent.switchConversation).toHaveBeenCalledWith(conversationId);
    expect(agent.memory.load).toHaveBeenCalled();
  });

  it('createAgentByType selects correct factory path', async () => {
    const reactType =
      ReActAgentTypeManager.generateUniqueReActType('My Assistant');
    const a = await svc.createAgentByType(
      reactType,
      userId,
      conversationId,
      { name: 'A', description: 'd' } as any,
      {},
    );
    expect((a as any).switchConversation).toHaveBeenCalledWith(conversationId);

    const g = await svc.createAgentByType(
      AgentType.GRAPH,
      userId,
      conversationId,
      { nodes: [], edges: [] } as any,
      {},
    );
    expect((g as any).switchConversation).toHaveBeenCalledWith(conversationId);

    const b = await svc.createAgentByType(
      AgentType.BASE,
      userId,
      conversationId,
      {},
      {},
    );
    expect((b as any).switchConversation).toHaveBeenCalledWith(conversationId);
  });
});
