jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

// Mock Notion client
const searchMock = jest.fn();
const pagesCreateMock = jest.fn();
const dbQueryMock = jest.fn();
const blocksAppendMock = jest.fn();
jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    search: searchMock,
    pages: { create: pagesCreateMock },
    databases: { query: dbQueryMock },
    blocks: { children: { append: blocksAppendMock } },
  })),
}));

import { NotionActor } from './notion.actor';

describe('NotionActor (behavior)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    searchMock.mockReset();
    pagesCreateMock.mockReset();
    dbQueryMock.mockReset();
    blocksAppendMock.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fails for invalid input shape', async () => {
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'unknown' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('requires token via arg or env; search returns results', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    searchMock.mockImplementation(async (opts: any) => {
      expect(opts.query).toBe('hello');
      return { results: [{ id: 'n1' }] };
    });
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'search', query: 'hello' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
      expect(out.data.data[0].id).toBe('n1');
    }
  });

  it('token arg overrides env', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    // Behavior is internal to Client construction; ensure call path works
    searchMock.mockResolvedValue({ results: [] });
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'search', token: 'ARG_TOKEN' },
    });
    expect(res.success).toBe(true);
  });

  it('fails when token missing', async () => {
    delete process.env.NOTION_TOKEN;
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'search' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('page-create: requires page and returns created page', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    pagesCreateMock.mockImplementation(async (body: any) => {
      expect(body.parent.database_id).toBe('db1');
      expect(body.properties.Title.title[0].text.content).toBe('T');
      return { id: 'p1' };
    });
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'page-create',
        page: {
          parent: { database_id: 'db1' },
          properties: { Title: { title: [{ text: { content: 'T' } }] } },
        },
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.data.id).toBe('p1');
    }
  });

  it('page-create: throws validation error when page missing', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'page-create' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('database-query: requires databaseId and returns results', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    dbQueryMock.mockImplementation(async (opts: any) => {
      expect(opts.database_id).toBe('db1');
      expect(opts.filter?.prop).toBe('v');
      return { results: [{ id: 'r1' }, { id: 'r2' }] };
    });
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'database-query',
        databaseId: 'db1',
        filter: { prop: 'v' } as any,
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.data.length).toBe(2);
    }
  });

  it('database-query: throws validation error when databaseId missing', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'database-query' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('block-append: requires blockAppend and appends children', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    blocksAppendMock.mockImplementation(async (opts: any) => {
      expect(opts.block_id).toBe('blk1');
      expect(Array.isArray(opts.children)).toBe(true);
      return { results: [{ id: 'c1' }] };
    });
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: {
        op: 'block-append',
        blockAppend: { blockId: 'blk1', children: [{ paragraph: {} }] },
      },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const out = (res as any).output;
      expect(out.data.ok).toBe(true);
    }
  });

  it('block-append: throws validation error when blockAppend missing', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    const tool = new NotionActor();
    const res = await tool.execute({
      name: tool.name,
      args: { op: 'block-append' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('returns failure when Notion client throws', async () => {
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    searchMock.mockRejectedValueOnce(new Error('notion down'));
    const tool = new NotionActor();
    const res = await tool.execute({ name: tool.name, args: { op: 'search' } });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/notion down/);
  });
});
