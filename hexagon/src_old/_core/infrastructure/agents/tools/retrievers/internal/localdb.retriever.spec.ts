jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import LocalDbRetriever from './localdb.retriever';

async function makeTempDir(prefix = 'localdb-retriever-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

async function writeJsonl(filePath: string, docs: any[]) {
  const lines = docs.map((d) => JSON.stringify(d)).join('\n');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines + '\n', 'utf8');
}

describe('LocalDbRetriever', () => {
  let retriever: LocalDbRetriever;
  let tmpDir: string;
  const collection = 'notes';

  beforeAll(async () => {
    retriever = new LocalDbRetriever();
  });

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('returns empty results when collection file does not exist', async () => {
    const result = await retriever.execute({
      name: retriever.name,
      args: { collection, dbPath: tmpDir },
    } as any);

    expect(result.success).toBe(true);
    const out = (result as any).output;
    expect(out.mimeType).toBe('application/json');
    expect(out.data).toEqual({ ok: true, data: [] });
  });

  it('filters by equality, array includes, and $in operator', async () => {
    const file = path.resolve(tmpDir, `${collection}.jsonl`);
    await writeJsonl(file, [
      { id: 1, tag: 'ai', tags: ['ai', 'ml'], status: 'open' },
      { id: 2, tag: 'dev', tags: ['dev'], status: 'closed' },
      { id: 3, tag: 'ai', tags: ['ai'], status: 'pending' },
    ]);
    // Append an invalid JSON line and a blank line to ensure they are ignored
    await fs.appendFile(file, 'not a json\n\n', 'utf8');

    // Equality match
    const resEq = await retriever.execute({
      name: retriever.name,
      args: { collection, dbPath: tmpDir, query: { tag: 'ai' } },
    } as any);
    expect(resEq.success).toBe(true);
    expect((resEq as any).output.data).toEqual({
      ok: true,
      data: [
        { id: 1, tag: 'ai', tags: ['ai', 'ml'], status: 'open' },
        { id: 3, tag: 'ai', tags: ['ai'], status: 'pending' },
      ],
    });

    // Array includes (single required tag)
    const resArr1 = await retriever.execute({
      name: retriever.name,
      args: { collection, dbPath: tmpDir, query: { tags: ['ai'] } },
    } as any);
    expect(resArr1.success).toBe(true);
    expect((resArr1 as any).output.data.data.map((d: any) => d.id)).toEqual([
      1, 3,
    ]);

    // Array includes (must include both 'ai' and 'ml')
    const resArr2 = await retriever.execute({
      name: retriever.name,
      args: { collection, dbPath: tmpDir, query: { tags: ['ai', 'ml'] } },
    } as any);
    expect(resArr2.success).toBe(true);
    expect((resArr2 as any).output.data.data.map((d: any) => d.id)).toEqual([
      1,
    ]);

    // $in operator on scalar field
    const resIn = await retriever.execute({
      name: retriever.name,
      args: {
        collection,
        dbPath: tmpDir,
        query: { status: { $in: ['open', 'closed'] } },
      },
    } as any);
    expect(resIn.success).toBe(true);
    expect((resIn as any).output.data.data.map((d: any) => d.id)).toEqual([
      1, 2,
    ]);
  });

  it('respects explicit limit over ragConfig.top_k and defaults', async () => {
    const file = path.resolve(tmpDir, `${collection}.jsonl`);
    await writeJsonl(file, [{ id: 1 }, { id: 2 }, { id: 3 }]);

    // limit should take precedence
    const resLimit = await retriever.execute({
      name: retriever.name,
      args: { collection, dbPath: tmpDir, limit: 2 },
    } as any);
    expect(resLimit.success).toBe(true);
    expect((resLimit as any).output.data.data.map((d: any) => d.id)).toEqual([
      1, 2,
    ]);

    // When limit is omitted, ragConfig.top_k (provided inline) should apply
    const resRagTopK = await retriever.execute({
      name: retriever.name,
      // Passing a minimal ragConfig with only top_k is sufficient for runtime
      args: { collection, dbPath: tmpDir, ragConfig: { top_k: 1 } },
    } as any);
    expect(resRagTopK.success).toBe(true);
    expect((resRagTopK as any).output.data.data.map((d: any) => d.id)).toEqual([
      1,
    ]);
  });

  it('fails validation when required fields are missing', async () => {
    const res = await retriever.execute({
      name: retriever.name,
      // collection is required by the inputSchema
      args: { dbPath: tmpDir },
    } as any);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('ValidationError');
      expect(res.error.message).toBe('Input does not match schema');
    }
  });
});
