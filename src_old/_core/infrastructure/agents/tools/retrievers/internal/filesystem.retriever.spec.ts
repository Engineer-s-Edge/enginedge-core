jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { FilesystemRetriever } from './filesystem.retriever';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

describe('FilesystemRetriever (behavioral)', () => {
  let root: string;
  let tool: FilesystemRetriever;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-ret-'));
    tool = new FilesystemRetriever();
  });

  afterEach(async () => {
    try {
      await fs.rm(root, { recursive: true, force: true });
    } catch {}
  });

  it('lists directory with pattern and respects top_k', async () => {
    await fs.mkdir(path.join(root, 'dir'), { recursive: true });
    await fs.writeFile(path.join(root, 'dir', 'a.md'), 'A');
    await fs.writeFile(path.join(root, 'dir', 'b.txt'), 'B');
    await fs.writeFile(path.join(root, 'dir', 'c.md'), 'C');

    const res = await tool.execute({
      name: tool.name,
      args: {
        root,
        dir: 'dir',
        pattern: '.md',
        ragConfig: { top_k: 1 } as any,
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const data = res.output.data.data as any[];
      expect(data.every((e) => e.includes('.md'))).toBe(true);
      expect(data.length).toBe(1);
    }
  });

  it('reads file content with maxBytes and encoding', async () => {
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'note.txt'), 'hello world');

    const res = await tool.execute({
      name: tool.name,
      args: {
        root,
        file: 'docs/note.txt',
        encoding: 'utf8',
        maxBytes: 5,
        ragConfig: { top_k: 50 } as any,
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const payload = res.output.data.data as any;
      const normalized = (payload.path as string).split(path.sep).join('/');
      expect(normalized).toBe('docs/note.txt');
      // read only first 5 bytes
      expect(payload.content).toBe('hello');
    }
  });

  it('blocks sandbox escape', async () => {
    const res = await tool.execute({
      name: tool.name,
      args: { root, file: '../secret.txt', ragConfig: { top_k: 50 } as any },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('fails validation for unexpected field', async () => {
    const res = await tool.execute({
      name: tool.name,
      args: { unknown: 1 } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });
});
