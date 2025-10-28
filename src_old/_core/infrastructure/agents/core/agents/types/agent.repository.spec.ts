import { AgentsRepository } from './agent.repository';

const makeModel = () => ({
  create: jest.fn(),
  findById: jest.fn().mockReturnThis(),
  findByIdAndUpdate: jest.fn().mockReturnThis(),
  findByIdAndDelete: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  exec: jest.fn(),
});

describe('AgentsRepository', () => {
  let baseModel: any;
  let reactModel: any;
  let graphModel: any;
  let repo: AgentsRepository;

  beforeEach(() => {
    baseModel = makeModel();
    reactModel = makeModel();
    graphModel = makeModel();
    repo = new AgentsRepository(baseModel, reactModel, graphModel) as any;
  });

  it('ReactAgent CRUD', async () => {
    reactModel.create.mockResolvedValue({ _id: 'r1' });
    reactModel.exec.mockResolvedValueOnce({ _id: 'r1' });
    reactModel.exec.mockResolvedValueOnce({ _id: 'r1', name: 'updated' });
    reactModel.exec.mockResolvedValueOnce({ _id: 'r1' });
    reactModel.exec.mockResolvedValueOnce([{ _id: 'r1' }]);

    expect(await repo.createReactAgent({ name: 'x' } as any)).toEqual({
      _id: 'r1',
    });
    expect(await repo.findReactAgentById('r1' as any)).toEqual({ _id: 'r1' });
    expect(
      await repo.updateReactAgent('r1' as any, { name: 'updated' } as any),
    ).toEqual({ _id: 'r1', name: 'updated' });
    expect(await repo.deleteReactAgent('r1' as any)).toEqual({ _id: 'r1' });
    expect(await repo.listReactAgents()).toEqual([{ _id: 'r1' }]);
  });

  it('GraphAgent CRUD', async () => {
    graphModel.create.mockResolvedValue({ _id: 'g1' });
    graphModel.exec.mockResolvedValueOnce({ _id: 'g1' });
    graphModel.exec.mockResolvedValueOnce({ _id: 'g1', name: 'updated' });
    graphModel.exec.mockResolvedValueOnce({ _id: 'g1' });
    graphModel.exec.mockResolvedValueOnce([{ _id: 'g1' }]);

    expect(await repo.createGraphAgent({ name: 'x' } as any)).toEqual({
      _id: 'g1',
    });
    expect(await repo.findGraphAgentById('g1' as any)).toEqual({ _id: 'g1' });
    expect(
      await repo.updateGraphAgent('g1' as any, { name: 'updated' } as any),
    ).toEqual({ _id: 'g1', name: 'updated' });
    expect(await repo.deleteGraphAgent('g1' as any)).toEqual({ _id: 'g1' });
    expect(await repo.listGraphAgents()).toEqual([{ _id: 'g1' }]);
  });

  it('BaseAgent CRUD and query', async () => {
    baseModel.create.mockResolvedValue({ _id: 'b1' });
    baseModel.exec.mockResolvedValueOnce({ _id: 'b1' });
    baseModel.exec.mockResolvedValueOnce({
      _id: 'b1',
      agentType: 'ReactAgent',
    });
    baseModel.exec.mockResolvedValueOnce({ _id: 'b1' });
    baseModel.exec.mockResolvedValueOnce([{ _id: 'b1' }]);
    baseModel.exec.mockResolvedValueOnce([{ _id: 'b1' }]);

    expect(
      await repo.createBaseAgent({ agentType: 'ReactAgent' } as any),
    ).toEqual({ _id: 'b1' });
    expect(await repo.findBaseAgentById('b1')).toEqual({ _id: 'b1' });
    expect(
      await repo.updateBaseAgent('b1', { agentType: 'ReactAgent' } as any),
    ).toEqual({ _id: 'b1', agentType: 'ReactAgent' });
    expect(await repo.deleteBaseAgent('b1')).toEqual({ _id: 'b1' });
    expect(await repo.findBaseAgentByType('ReactAgent')).toEqual([
      { _id: 'b1' },
    ]);
    expect(await repo.listAllAgents()).toEqual([{ _id: 'b1' }]);
  });
});
