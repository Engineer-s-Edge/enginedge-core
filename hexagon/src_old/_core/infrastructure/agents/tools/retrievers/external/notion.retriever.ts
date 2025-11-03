import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { Client } from '@notionhq/client';

interface NotionRetrieveArgs {
  operation: 'search' | 'database-query';
  token?: string;
  query?: string;
  databaseId?: string;
  filter?: any;
  sorts?: any[];
}

interface NotionRetrieveOutput extends ToolOutput {
  data: any;
}

export class NotionRetriever extends BaseRetriever<
  NotionRetrieveArgs,
  NotionRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000305' as unknown as ToolIdType;
  name = 'notion.retrieve';
  description = 'Retrieve data from Notion (search or database query).';
  useCase = 'Pull notes or database items from Notion.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 10,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: {
      operation: { type: 'string', enum: ['search', 'database-query'] },
      token: { type: 'string' },
      query: { type: 'string' },
      databaseId: { type: 'string' },
      filter: { type: 'object' },
      sorts: { type: 'array', items: { type: 'object' } },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'notion.retrieve',
      args: { operation: 'search', query: 'roadmap' },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private client(token?: string) {
    const auth = token || process.env.NOTION_TOKEN || '';
    if (!auth) {
      this.logger.error(
        'Notion token missing for retriever',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('Notion token missing'), {
        name: 'ValidationError',
      });
    }
    this.logger.debug(
      'Creating Notion client for retriever',
      this.constructor.name,
    );
    return new Client({ auth });
  }

  protected async retrieve(
    args: NotionRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<NotionRetrieveOutput> {
    this.logger.info(
      `Retrieving from Notion with operation: ${args.operation}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Notion retriever args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const notion = this.client(args.token);
      switch (args.operation) {
        case 'search': {
          this.logger.debug(
            `Searching Notion with query: ${args.query || ''}`,
            this.constructor.name,
          );
          const res = await notion.search({ query: args.query || '' });
          const items = (res.results || []).slice(
            0,
            args.ragConfig.top_k || 10,
          );
          this.logger.info(
            `Notion search completed: ${items.length} items retrieved`,
            this.constructor.name,
          );
          return {
            data: { ok: true, data: items } as any,
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
          const items = (res.results || []).slice(
            0,
            args.ragConfig.top_k || 10,
          );
          this.logger.info(
            `Notion database query completed: ${items.length} items retrieved`,
            this.constructor.name,
          );
          return {
            data: { ok: true, data: items } as any,
            mimeType: 'application/json' as any,
          };
        }
        default:
          this.logger.error(
            `Unsupported Notion retriever operation: ${args.operation}`,
            undefined,
            this.constructor.name,
          );
          throw Object.assign(
            new Error(`Unsupported operation: ${args.operation}`),
            { name: 'ValidationError' },
          );
      }
    } catch (error: any) {
      this.logger.error(
        `Notion retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default NotionRetriever;
