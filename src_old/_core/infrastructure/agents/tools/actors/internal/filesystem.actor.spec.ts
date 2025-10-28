jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { FilesystemActor } from './filesystem.actor';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

describe('FilesystemActor (behavioral)', () => {
  let root: string;
  let tool: FilesystemActor;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-actor-'));
    tool = new FilesystemActor();
  });

  afterEach(async () => {
    try {
      await fs.rm(root, { recursive: true, force: true });
    } catch {}
  });

  it('mkdir, write, read, exists, list, delete roundtrip', async () => {
    // mkdir
    const mkdir = await tool.execute({
      name: tool.name,
      args: { op: 'mkdir', root, filepath: 'dir/sub', recursive: true },
    });
    expect(mkdir.success).toBe(true);

    // write
    const write = await tool.execute({
      name: tool.name,
      args: { op: 'write', root, filepath: 'dir/sub/hello.txt', content: 'hi' },
    });
    expect(write.success).toBe(true);

    // exists
    const exists = await tool.execute({
      name: tool.name,
      args: { op: 'exists', root, filepath: 'dir/sub/hello.txt' },
    });
    expect(exists.success).toBe(true);
    if (exists.success) expect((exists.output.data as any).exists).toBe(true);

    // read
    const read = await tool.execute({
      name: tool.name,
      args: { op: 'read', root, filepath: 'dir/sub/hello.txt' },
    });
    expect(read.success).toBe(true);
    if (read.success) expect((read.output.data as any).content).toBe('hi');

    // list
    const list = await tool.execute({
      name: tool.name,
      args: { op: 'list', root, filepath: 'dir' },
    });
    expect(list.success).toBe(true);
    if (list.success)
      expect((list.output.data as any).entries).toContain('sub');

    // delete
    const del = await tool.execute({
      name: tool.name,
      args: { op: 'delete', root, filepath: 'dir', recursive: true },
    });
    expect(del.success).toBe(true);

    const existsAfter = await tool.execute({
      name: tool.name,
      args: { op: 'exists', root, filepath: 'dir' },
    });
    if (existsAfter.success)
      expect((existsAfter.output.data as any).exists).toBe(false);
  });

  it('blocks sandbox escape attempts', async () => {
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'write',
        root,
        filepath: '../escape.txt',
        content: 'blocked',
      } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('EACCES');
  });
});
