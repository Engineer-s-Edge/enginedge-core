jest.mock('@core/services/logger/logger.service', () => ({
  MyLogger: class {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
}));

import { NotionRetriever } from './notion.retriever';
import { Client as NotionClient } from '@notionhq/client';

jest.mock('@notionhq/client', () => {
  const mockCtor = jest.fn();
  return { Client: mockCtor };
});

describe('NotionRetriever (behavior)', () => {
  it('fails validation for invalid operation', async () => {
    const tool = new NotionRetriever();
    const res = await tool.execute({
      name: tool.name,
      args: { operation: 'nope' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('search: requires token via arg or env and slices by top_k', async () => {
    // Mock Notion client instance with search
    const instance = {
      search: jest.fn(async () => ({
        results: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` })),
      })),
    } as any;
    (NotionClient as unknown as jest.Mock).mockImplementation(({ auth }) => {
      expect(auth).toBe('ENV_TOKEN');
      return instance;
    });
    process.env.NOTION_TOKEN = 'ENV_TOKEN';

    const tool = new NotionRetriever();
    const res = await tool.execute({
      name: 'notion.retrieve',
      args: {
        operation: 'search',
        query: 'roadmap',
        ragConfig: { top_k: 3 },
      } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    expect(out.data.map((x: any) => x.id)).toEqual(['p0', 'p1', 'p2']);
    expect(instance.search).toHaveBeenCalledWith({ query: 'roadmap' });
  });

  it('database-query: requires databaseId or fails validation', async () => {
    const tool = new NotionRetriever();
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    const res = await tool.execute({
      name: 'notion.retrieve',
      args: { operation: 'database-query' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.name).toBe('ValidationError');
  });

  it('database-query: queries with filters/sorts and slices by top_k', async () => {
    const instance = {
      databases: {
        query: jest.fn(async () => ({
          results: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
        })),
      },
    } as any;
    (NotionClient as unknown as jest.Mock).mockImplementation(() => instance);
    process.env.NOTION_TOKEN = 'ENV_TOKEN';

    const tool = new NotionRetriever();
    const res = await tool.execute({
      name: 'notion.retrieve',
      args: {
        operation: 'database-query',
        databaseId: 'db',
        filter: { a: 1 },
        sorts: [{ b: 'asc' }],
        ragConfig: { top_k: 2 },
      } as any,
    });
    expect(res.success).toBe(true);
    const out = (res as any).output.data;
    expect(out.ok).toBe(true);
    expect(out.data).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(instance.databases.query).toHaveBeenCalledWith({
      database_id: 'db',
      filter: { a: 1 },
      sorts: [{ b: 'asc' }],
    });
  });

  it('returns failure when Notion client throws', async () => {
    (NotionClient as unknown as jest.Mock).mockImplementation(() => ({
      search: jest.fn(async () => {
        throw new Error('notion down');
      }),
    }));
    process.env.NOTION_TOKEN = 'ENV_TOKEN';
    const tool = new NotionRetriever();
    const res = await tool.execute({
      name: 'notion.retrieve',
      args: { operation: 'search', query: 'x' } as any,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.name).toBe('Error');
      expect(res.error.message).toBe('notion down');
    }
  });
});
