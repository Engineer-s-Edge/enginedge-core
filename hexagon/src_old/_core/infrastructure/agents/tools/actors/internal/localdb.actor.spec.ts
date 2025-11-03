jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { LocalDbActor } from './localdb.actor';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

describe('LocalDbActor (behavioral)', () => {
  let dbPath: string;
  let tool: LocalDbActor;

  beforeEach(async () => {
    dbPath = await fs.mkdtemp(path.join(os.tmpdir(), 'localdb-'));
    tool = new LocalDbActor();
  });

  afterEach(async () => {
    // best-effort cleanup
    try {
      await fs.rm(dbPath, { recursive: true, force: true });
    } catch {}
  });

  it('creates and lists collections', async () => {
    // create-collection
    const create = await tool.execute({
      name: tool.name,
      args: { op: 'create-collection', collection: 'notes', dbPath },
    });
    expect(create.success).toBe(true);

    // list-collections
    const list = await tool.execute({
      name: tool.name,
      args: { op: 'list-collections', dbPath },
    });
    expect(list.success).toBe(true);
    if (list.success) {
      expect((list.output.data as any).collections).toContain('notes');
    }
  });

  it('insert, find, count basic flow', async () => {
    await tool.execute({
      name: tool.name,
      args: { op: 'create-collection', collection: 'notes', dbPath },
    });

    const insert1 = await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'a', tags: ['x'] },
      },
    });
    const insert2 = await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'b', tags: ['y'] },
      },
    });
    expect(insert1.success && insert2.success).toBe(true);

    const findA = await tool.execute({
      name: tool.name,
      args: { op: 'find', collection: 'notes', dbPath, query: { title: 'a' } },
    });
    expect(findA.success).toBe(true);
    if (findA.success) {
      const items = (findA.output.data as any).data;
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('a');
      expect(items[0]._id).toBeDefined();
    }

    const count = await tool.execute({
      name: tool.name,
      args: { op: 'count', collection: 'notes', dbPath, query: {} },
    });
    expect(count.success).toBe(true);
    if (count.success) {
      expect((count.output.data as any).data).toBe(2);
    }
  });

  it('update one vs many semantics', async () => {
    await tool.execute({
      name: tool.name,
      args: { op: 'create-collection', collection: 'notes', dbPath },
    });
    await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'a', n: 1 },
      },
    });
    await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'a', n: 2 },
      },
    });

    // update one (many: false)
    const updOne = await tool.execute({
      name: tool.name,
      args: {
        op: 'update',
        collection: 'notes',
        dbPath,
        query: { title: 'a' },
        update: { $set: { flag: true } },
        many: false,
      },
    });
    expect(updOne.success).toBe(true);
    if (updOne.success) {
      expect((updOne.output.data as any).modified).toBe(1);
    }

    // verify only one got flag true
    const afterOne = await tool.execute({
      name: tool.name,
      args: { op: 'find', collection: 'notes', dbPath, query: { title: 'a' } },
    });
    if (afterOne.success) {
      const items = (afterOne.output.data as any).data;
      const flagged = items.filter((x: any) => x.flag === true);
      expect(flagged.length).toBe(1);
    }

    // update many
    const updMany = await tool.execute({
      name: tool.name,
      args: {
        op: 'update',
        collection: 'notes',
        dbPath,
        query: { title: 'a' },
        update: { $set: { tag: 'all' } },
        many: true,
      },
    });
    expect(updMany.success).toBe(true);
    if (updMany.success) {
      expect((updMany.output.data as any).modified).toBe(2);
    }
  });

  it('delete one vs many semantics', async () => {
    await tool.execute({
      name: tool.name,
      args: { op: 'create-collection', collection: 'notes', dbPath },
    });
    await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'x' },
      },
    });
    await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'x' },
      },
    });
    await tool.execute({
      name: tool.name,
      args: {
        op: 'insert',
        collection: 'notes',
        dbPath,
        record: { title: 'y' },
      },
    });

    const delOne = await tool.execute({
      name: tool.name,
      args: {
        op: 'delete',
        collection: 'notes',
        dbPath,
        query: { title: 'x' },
        many: false,
      },
    });
    expect(delOne.success).toBe(true);
    if (delOne.success) expect((delOne.output.data as any).deleted).toBe(1);

    const delMany = await tool.execute({
      name: tool.name,
      args: {
        op: 'delete',
        collection: 'notes',
        dbPath,
        query: { title: 'x' },
        many: true,
      },
    });
    expect(delMany.success).toBe(true);
    if (delMany.success) expect((delMany.output.data as any).deleted).toBe(1);

    const count = await tool.execute({
      name: tool.name,
      args: { op: 'count', collection: 'notes', dbPath, query: {} },
    });
    if (count.success) expect((count.output.data as any).data).toBe(1);
  });

  it('drop-collection removes file', async () => {
    await tool.execute({
      name: tool.name,
      args: { op: 'create-collection', collection: 'gone', dbPath },
    });
    const drop = await tool.execute({
      name: tool.name,
      args: { op: 'drop-collection', collection: 'gone', dbPath },
    });
    expect(drop.success).toBe(true);
    const list = await tool.execute({
      name: tool.name,
      args: { op: 'list-collections', dbPath },
    });
    if (list.success)
      expect((list.output.data as any).collections).not.toContain('gone');
  });
});
