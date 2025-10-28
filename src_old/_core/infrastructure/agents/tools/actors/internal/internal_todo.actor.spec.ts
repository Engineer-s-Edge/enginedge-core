jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { InternalTodoActor } from './internal_todo.actor';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

describe('InternalTodoActor', () => {
  it('fails validation when op is missing', async () => {
    const tool = new InternalTodoActor();
    const res = await tool.execute({ name: tool.name, args: {} as any });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('supports list/add/update/delete/clear workflow with storePath', async () => {
    const tool = new InternalTodoActor();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'todo-actor-'));
    const storePath = path.join(tmp, 'todos.json');
    try {
      // list (initially empty)
      let res = await tool.execute({
        name: tool.name,
        args: { op: 'list', storePath } as any,
      });
      expect(res.success).toBe(true);
      expect((res as any).output.data.items).toEqual([]);

      // add (missing title -> validation error thrown by act, but execute returns failure)
      let bad = await tool.execute({
        name: tool.name,
        args: { op: 'add', storePath } as any,
      });
      expect(bad.success).toBe(false);
      if (!bad.success) expect(bad.error.name).toBe('ValidationError');

      // add proper
      res = await tool.execute({
        name: tool.name,
        args: { op: 'add', title: 'Task 1', storePath } as any,
      });
      expect(res.success).toBe(true);
      let items = (res as any).output.data.items;
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('Task 1');
      const id = items[0].id;

      // update missing id -> failure
      let updBad = await tool.execute({
        name: tool.name,
        args: { op: 'update', title: 'X', storePath } as any,
      });
      expect(updBad.success).toBe(false);
      if (!updBad.success) expect(updBad.error.name).toBe('ValidationError');

      // update proper
      res = await tool.execute({
        name: tool.name,
        args: { op: 'update', id, done: true, storePath } as any,
      });
      expect(res.success).toBe(true);
      items = (res as any).output.data.items;
      expect(items[0].done).toBe(true);

      // delete missing id -> failure
      let delBad = await tool.execute({
        name: tool.name,
        args: { op: 'delete', storePath } as any,
      });
      expect(delBad.success).toBe(false);
      if (!delBad.success) expect(delBad.error.name).toBe('ValidationError');

      // delete proper
      res = await tool.execute({
        name: tool.name,
        args: { op: 'delete', id, storePath } as any,
      });
      expect(res.success).toBe(true);
      items = (res as any).output.data.items;
      expect(items.find((t: any) => t.id === id)).toBeFalsy();

      // add two and clear
      await tool.execute({
        name: tool.name,
        args: { op: 'add', title: 'A', storePath } as any,
      });
      await tool.execute({
        name: tool.name,
        args: { op: 'add', title: 'B', storePath } as any,
      });
      res = await tool.execute({
        name: tool.name,
        args: { op: 'clear', storePath } as any,
      });
      expect(res.success).toBe(true);
      expect((res as any).output.data.items).toEqual([]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
