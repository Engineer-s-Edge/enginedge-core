import { Test, TestingModule } from '@nestjs/testing';
import { ExpertAgentFactory, ExpertAgentFactoryConfig } from '../expert-agent.factory';

describe('ExpertAgentFactory', () => {
  let factory: ExpertAgentFactory;
  let module: TestingModule;

  const mockConfig: ExpertAgentFactoryConfig = {
    userId: 'test-user-1',
    researchFocus: 'Machine Learning',
    specialization: 'primary',
    maxSources: 10,
    researchDepth: 'advanced',
    temperature: 0.7,
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [ExpertAgentFactory],
    }).compile();

    factory = module.get<ExpertAgentFactory>(ExpertAgentFactory);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createAgent', () => {
    it('should create a single agent with valid config', async () => {
      const agent = await factory.createAgent(mockConfig);

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.id).toMatch(/^ea_/);
      expect(agent.userId).toBe(mockConfig.userId);
      expect(agent.researchFocus).toBe(mockConfig.researchFocus);
    });

    it('should create agent with unique ID', async () => {
      const agent1 = await factory.createAgent(mockConfig);
      const agent2 = await factory.createAgent(mockConfig);
      expect(agent1.id).not.toBe(agent2.id);
    });

    it('should throw error if userId is missing', async () => {
      const invalidConfig = { ...mockConfig, userId: '' };
      await expect(factory.createAgent(invalidConfig)).rejects.toThrow(/userId/i);
    });

    it('should throw error if researchFocus is missing', async () => {
      const invalidConfig = { ...mockConfig, researchFocus: '' };
      await expect(factory.createAgent(invalidConfig)).rejects.toThrow(/researchFocus/i);
    });

    it('should set default specialization if not provided', async () => {
      const config = { userId: 'user-1', researchFocus: 'Topic' };
      const agent = await factory.createAgent(config);
      expect(agent.specialization).toBe('primary');
    });
  });

  describe('getAgent', () => {
    it('should retrieve agent by ID', async () => {
      const created = await factory.createAgent(mockConfig);
      const retrieved = factory.getAgent(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent agent', () => {
      const agent = factory.getAgent('non-existent-id');
      expect(agent).toBeUndefined();
    });
  });

  describe('agent.research', () => {
    it('should execute research operation', async () => {
      const agent = await factory.createAgent(mockConfig);
      const result = await agent.research({ query: 'What is machine learning?' });

      expect(result).toBeDefined();
      expect(result.query).toBe('What is machine learning?');
      expect(result.phases).toBeDefined();
      expect(result.phases.length).toBe(3);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should set status to researching during research', async () => {
      const agent = await factory.createAgent(mockConfig);
      const researchPromise = agent.research({ query: 'Test' });
      expect(agent.status).toBe('researching');
      await researchPromise;
    });

    it('should set status to completed after research', async () => {
      const agent = await factory.createAgent(mockConfig);
      await agent.research({ query: 'Test' });
      expect(agent.status).toBe('completed');
    });

    it('should return phases array with AIM, SHOOT, SKIN', async () => {
      const agent = await factory.createAgent(mockConfig);
      const result = await agent.research({ query: 'Test' });

      expect(result.phases.map((p: any) => p.phase)).toEqual(['AIM', 'SHOOT', 'SKIN']);
      expect(result.phases.every((p: any) => p.status === 'completed')).toBe(true);
    });
  });

  describe('agent.abort', () => {
    it('should abort research operation', async () => {
      const agent = await factory.createAgent(mockConfig);
      await expect(agent.abort()).resolves.not.toThrow();
    });
  });

  describe('createAgents (batch)', () => {
    it('should create multiple agents', async () => {
      const agents = await factory.createAgents(mockConfig, 3);
      expect(agents).toHaveLength(3);
      agents.forEach((a) => expect(a.id).toBeDefined());
    });

    it('should create agents with unique IDs', async () => {
      const agents = await factory.createAgents(mockConfig, 5);
      const ids = agents.map((a) => a.id);
      expect(new Set(ids).size).toBe(5);
    });

    it('should return empty array for zero agents', async () => {
      const agents = await factory.createAgents(mockConfig, 0);
      expect(agents).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should cleanup single agent', async () => {
      const agent = await factory.createAgent(mockConfig);
      const id = agent.id;
      expect(factory.getAgent(id)).toBeDefined();
      await factory.cleanup(id);
      expect(factory.getAgent(id)).toBeUndefined();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(factory.cleanup('non-existent')).rejects.toThrow(/not found|does not exist/i);
    });

    it('should cleanup without affecting others', async () => {
      const agent1 = await factory.createAgent(mockConfig);
      const agent2 = await factory.createAgent(mockConfig);

      await factory.cleanup(agent1.id);

      expect(factory.getAgent(agent1.id)).toBeUndefined();
      expect(factory.getAgent(agent2.id)).toBeDefined();
    });
  });

  describe('cleanupAll', () => {
    it('should cleanup all agents', async () => {
      const agents = await factory.createAgents(mockConfig, 3);
      await factory.cleanupAll();
      agents.forEach((a) => {
        expect(factory.getAgent(a.id)).toBeUndefined();
      });
    });

    it('should handle cleanup when no agents exist', async () => {
      await expect(factory.cleanupAll()).resolves.not.toThrow();
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent agent creation', async () => {
      const promises = Array.from({ length: 5 }, () =>
        factory.createAgent(mockConfig),
      );
      const agents = await Promise.all(promises);
      expect(agents).toHaveLength(5);
      const ids = agents.map((a) => a.id);
      expect(new Set(ids).size).toBe(5);
    });

    it('should handle concurrent research operations', async () => {
      const agent = await factory.createAgent(mockConfig);
      const queries = ['Q1', 'Q2', 'Q3'];

      const results = await Promise.all(
        queries.map((q) => agent.research({ query: q })),
      );

      expect(results).toHaveLength(3);
      results.forEach((r, i) => {
        expect(r.query).toBe(queries[i]);
      });
    });
  });
});
