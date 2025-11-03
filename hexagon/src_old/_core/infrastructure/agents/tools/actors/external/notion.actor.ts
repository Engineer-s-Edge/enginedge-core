import { Client } from '@notionhq/client';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type NotionOp = 'search' | 'page-create' | 'database-query' | 'block-append';

interface NotionArgs {
  op: NotionOp;
  token?: string;
  query?: string;
  page?: {
    parent: { page_id?: string; database_id?: string };
    properties: Record<string, any>;
    children?: any[];
  };
  databaseId?: string;
  filter?: any;
  sorts?: any[];
  blockAppend?: { blockId: string; children: any[] };
}

interface NotionOutput extends ToolOutput {
  data: any;
}

export class NotionActor extends BaseActor<NotionArgs, NotionOutput> {
  _id: ToolIdType = 't_000000000000000000000205' as unknown as ToolIdType;
  name = 'notion.actor';
  description =
    'Notion operations: search, create page, query database, append blocks.';
  useCase = 'Integrate with Notion workspaces for notes and data.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: ['search', 'page-create', 'database-query', 'block-append'],
      },
      token: { type: 'string' },
      query: { type: 'string' },
      page: { type: 'object' },
      databaseId: { type: 'string' },
      filter: { type: 'object' },
      sorts: { type: 'array', items: { type: 'object' } },
      blockAppend: { type: 'object' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'notion.actor',
      args: { op: 'search', query: 'Project' },
    } as ToolCall,
  ];
  retries = 1;
  errorEvent = [
    {
      name: 'NotionError',
      guidance: 'Check Notion token and permissions.',
      retryable: true,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private client(token?: string) {
    const auth = token || process.env.NOTION_TOKEN || '';
    if (!auth) {
      this.logger.error(
        'Notion token missing',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('Notion token missing'), {
        name: 'ValidationError',
      });
    }
    this.logger.debug(
      'Creating Notion client with provided token',
      this.constructor.name,
    );
    return new Client({ auth });
  }

  protected async act(args: NotionArgs): Promise<NotionOutput> {
    this.logger.info(
      `Executing Notion operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Notion args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const notion = this.client(args.token);
    switch (args.op) {
      case 'search': {
        this.logger.debug(
          `Searching Notion with query: ${args.query || ''}`,
          this.constructor.name,
        );
        const res = await notion.search({ query: args.query || '' });
        this.logger.info(
          `Notion search completed: ${res.results.length} results`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.results } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'page-create': {
        if (!args.page) {
          this.logger.error(
            'page object required for page-create operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('page object required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Creating Notion page with parent: ${JSON.stringify(args.page.parent)}`,
          this.constructor.name,
        );
        const res = await notion.pages.create(args.page as any);
        this.logger.info(
          `Notion page created successfully: ${res.id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'database-query': {
        if (!args.databaseId) {
          this.logger.error(
            'databaseId required for database-query operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('databaseId required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Querying Notion database: ${args.databaseId}`,
          this.constructor.name,
        );
        const res = await notion.databases.query({
          database_id: args.databaseId,
          filter: args.filter as any,
          sorts: args.sorts as any,
        });
        this.logger.info(
          `Notion database query completed: ${res.results.length} results`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res.results } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'block-append': {
        if (!args.blockAppend) {
          this.logger.error(
            'blockAppend required for block-append operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('blockAppend required'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Appending blocks to Notion block: ${args.blockAppend.blockId}`,
          this.constructor.name,
        );
        const res = await notion.blocks.children.append({
          block_id: args.blockAppend.blockId,
          children: args.blockAppend.children as any,
        });
        this.logger.info(
          `Notion blocks appended successfully: ${res.results.length} blocks`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: res } as any,
          mimeType: 'application/json' as any,
        };
      }
      default:
        this.logger.error(
          `Unsupported Notion operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
    }
  }
}

export default NotionActor;
