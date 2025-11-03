import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { TavilySearchLoader } from '@core/infrastructure/agents/components/loaders/web/tavily';
import { MyLogger } from '@core/services/logger/logger.service';

interface TavilyArgs {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeRawContent?: boolean;
  includeImages?: boolean;
  filterDomains?: string[];
  excludeDomains?: string[];
  safeSearch?: boolean;
  apiKey?: string;
}

interface TavilyOutput extends ToolOutput {
  data: any;
}

export class TavilyRetriever extends BaseRetriever<TavilyArgs, TavilyOutput> {
  _id: ToolIdType = 't_000000000000000000000302' as unknown as ToolIdType;
  name = 'tavily.retrieve';
  description =
    'Retrieve web search results via Tavily with extracted content.';
  useCase = 'General web search retrieval with content extraction.';

  constructor(
    logger: MyLogger,
    private loader = new TavilySearchLoader(logger),
  ) {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 8,
      top_kModifiable: true,
      optimize: true,
    });
    this.logger = logger;
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string' },
      maxResults: { type: 'number' },
      searchDepth: { type: 'string', enum: ['basic', 'advanced'] },
      includeRawContent: { type: 'boolean' },
      includeImages: { type: 'boolean' },
      filterDomains: { type: 'array', items: { type: 'string' } },
      excludeDomains: { type: 'array', items: { type: 'string' } },
      safeSearch: { type: 'boolean' },
      apiKey: { type: 'string' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'tavily.retrieve',
      args: { query: 'latest AI research' },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [
    {
      name: 'ValidationError',
      guidance: 'Provide a query string.',
      retryable: false,
    },
  ];
  parallel = true;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async retrieve(
    args: TavilyArgs & { ragConfig: RAGConfig },
  ): Promise<TavilyOutput> {
    this.logger.info(
      `Retrieving web search results via Tavily for query: ${args.query}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Tavily args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const searchOptions = {
      apiKey: args.apiKey || process.env.TAVILY_API_KEY,
      maxResults: args.maxResults || args.ragConfig.top_k || 8,
      searchDepth: args.searchDepth || 'advanced',
      includeRawContent: args.includeRawContent ?? true,
      includeImages: args.includeImages ?? false,
      filterDomains: args.filterDomains,
      excludeDomains: args.excludeDomains,
      safeSearch: args.safeSearch,
    };

    this.logger.debug(
      `Tavily search options: ${JSON.stringify(searchOptions)}`,
      this.constructor.name,
    );

    try {
      this.logger.debug(
        'Loading documents via Tavily loader',
        this.constructor.name,
      );
      const docs = await this.loader.load(args.query, searchOptions);
      this.logger.info(
        `Tavily search completed: ${docs.length} documents retrieved`,
        this.constructor.name,
      );

      const data = docs.map((d) => ({
        content: d.pageContent,
        metadata: d.metadata,
      }));
      this.logger.debug(
        `Processed ${data.length} documents for return`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Tavily search failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default TavilyRetriever;
