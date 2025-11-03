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

import { TodoistActor } from './todoist.actor';

describe('TodoistActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    (axios.get as jest.Mock).mockReset();
    (axios.post as jest.Mock).mockReset();
    (axios.delete as jest.Mock).mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns failure on invalid args (schema validation)', async () => {
    const tool = new TodoistActor();
    const result = await tool.execute({
      name: tool.name,
      args: { bad: true } as any,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('ValidationError');
  });

  it('list-tasks: uses token from env and returns tasks', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 't1' }, { id: 't2' }],
    });
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'list-tasks' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data.length).toBe(2);
      const [url, config] = (axios.get as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks');
      expect(config.headers.Authorization).toBe('Bearer ENV_TOKEN');
    }
  });

  it('create-task: requires payload and uses token arg', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { id: 'new' } });
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'create-task',
        token: 'ARG_TOKEN',
        payload: { content: 'Do x' },
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url, body, config] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks');
      expect(body.content).toBe('Do x');
      expect(config.headers.Authorization).toBe('Bearer ARG_TOKEN');
    }
  });

  it('create-task: throws validation error when payload missing', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'create-task' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('update-task: requires taskId and payload', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { id: 't5' } });
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'update-task', taskId: 't5', payload: { priority: 4 } },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url, body] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks/t5');
      expect(body.priority).toBe(4);
    }
  });

  it('update-task: throws validation error when fields missing', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'update-task', taskId: 't5' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('close-task: requires taskId and posts to close endpoint', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.post as jest.Mock).mockResolvedValueOnce({});
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'close-task', taskId: 't1' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks/t1/close');
    }
  });

  it('close-task: throws validation error when taskId missing', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'close-task' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('reopen-task: requires taskId and posts to reopen endpoint', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.post as jest.Mock).mockResolvedValueOnce({});
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'reopen-task', taskId: 't2' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks/t2/reopen');
    }
  });

  it('reopen-task: throws validation error when taskId missing', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'reopen-task' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('delete-task: requires taskId and calls delete', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.delete as jest.Mock).mockResolvedValueOnce({});
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete-task', taskId: 't3' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const [url] = (axios.delete as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.todoist.com/rest/v2/tasks/t3');
    }
  });

  it('delete-task: throws validation error when taskId missing', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'delete-task' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when axios throws', async () => {
    process.env.TODOIST_TOKEN = 'ENV_TOKEN';
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('todoist down'));
    const tool = new TodoistActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'list-tasks' },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/todoist down/);
  });
});
