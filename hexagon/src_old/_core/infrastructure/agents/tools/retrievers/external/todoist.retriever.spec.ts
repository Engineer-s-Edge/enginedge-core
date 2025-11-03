jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import axios from 'axios';
jest.mock('axios');

import { TodoistRetriever } from './todoist.retriever';

describe('TodoistRetriever (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    (axios.get as jest.Mock).mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails validation for unexpected arg', async () => {
    const tool = new TodoistRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { unexpected: true } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('requires token via arg or env; uses filter param and slices by ragConfig.top_k', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const tool = new TodoistRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { filter: 'today', ragConfig: { top_k: 2 } as any } as any,
    });

    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(Array.isArray(out.data.data)).toBe(true);
      expect(out.data.data.length).toBe(2); // sliced to top_k
      // axios call assertions
      const [url, config] = (axios.get as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks');
      expect(config.params).toEqual({ filter: 'today' });
      expect(config.headers.Authorization).toBe('Bearer ENV_TOKEN');
    }
  });

  it('prefers token arg over env', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'a' }] });

    const tool = new TodoistRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { token: 'ARG_TOKEN' } as any,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [, config] = (axios.get as jest.Mock).mock.calls[0];
      expect(config.headers.Authorization).toBe('Bearer ARG_TOKEN');
    }
  });

  it('returns failure when token missing entirely', async () => {
    delete process.env.TODOIST_TOKEN;

    const tool = new TodoistRetriever();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('ValidationError');
      expect(res.error.message).toMatch(/Todoist token missing/);
    }
  });

  it('returns failure when axios throws', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('todoist down'));
    const tool = new TodoistRetriever();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/todoist down/);
  });
});
