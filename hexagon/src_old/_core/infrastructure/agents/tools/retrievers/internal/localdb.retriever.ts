import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import * as path from 'path';
import { promises as fs } from 'fs';

interface LocalDbRetrieveArgs {
  collection: string;
  query?: any;
  dbPath?: string;
  limit?: number;
}

interface LocalDbRetrieveOutput extends ToolOutput {
  data: any;
}

export class LocalDbRetriever extends BaseRetriever<
  LocalDbRetrieveArgs,
  LocalDbRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000301' as unknown as ToolIdType;
  name = 'localdb.retrieve';
  description = 'Retrieve documents from a JSONL local DB collection.';
  useCase = 'Lightweight retrieval from local persisted data.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 20,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['collection'],
    properties: {
      collection: { type: 'string' },
      query: { type: 'object' },
      dbPath: { type: 'string' },
      limit: { type: 'number', minimum: 1, default: 20 },
      ragConfig: { type: 'object' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'localdb.retrieve',
      args: { collection: 'notes', query: { tag: 'ai' } },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [
    {
      name: 'ValidationError',
      guidance: 'Ensure collection exists and query is valid.',
      retryable: false,
    },
  ];
  parallel = true;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private basePath(p?: string) {
    return path.resolve(
      p || path.resolve(process.cwd(), '.agent_state', 'localdb'),
    );
  }
  private fileFor(dir: string, name: string) {
    return path.resolve(dir, `${name}.jsonl`);
  }

  private matchesQuery(doc: any, query: any): boolean {
    if (!query || Object.keys(query).length === 0) {
      this.logger.debug(
        'Empty query, matching all documents',
        this.constructor.name,
      );
      return true;
    }

    const matches = Object.entries(query).every(([k, v]) => {
      const dv = (doc as any)[k];
      if (Array.isArray(v))
        return Array.isArray(dv) && v.every((x) => dv.includes(x));
      if (v && typeof v === 'object') {
        if ('$in' in (v as any)) {
          const arr = (v as any)['$in'];
          return Array.isArray(arr) ? arr.includes(dv) : false;
        }
      }
      return dv === v;
    });

    this.logger.debug(
      `Query match result: ${matches} for document field ${Object.keys(query)[0]}`,
      this.constructor.name,
    );
    return matches;
  }

  private async readAll(filePath: string): Promise<any[]> {
    try {
      this.logger.debug(`Reading file: ${filePath}`, this.constructor.name);
      const raw = await fs.readFile(filePath, 'utf8');
      const docs = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      this.logger.debug(
        `Parsed ${docs.length} documents from file`,
        this.constructor.name,
      );
      return docs;
    } catch (e: any) {
      if (e && e.code === 'ENOENT') {
        this.logger.debug(
          `File not found: ${filePath}, returning empty array`,
          this.constructor.name,
        );
        return [];
      }
      this.logger.error(
        `Error reading file: ${filePath}`,
        e.stack,
        this.constructor.name,
      );
      throw e;
    }
  }

  protected async retrieve(
    args: LocalDbRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<LocalDbRetrieveOutput> {
    this.logger.info(
      `Retrieving from local database collection: ${args.collection}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Retrieval args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const dir = this.basePath(args.dbPath);
    const file = this.fileFor(dir, args.collection);
    this.logger.debug(`Database file path: ${file}`, this.constructor.name);

    const docs = await this.readAll(file);
    this.logger.debug(
      `Read ${docs.length} documents from collection`,
      this.constructor.name,
    );

    const matched = docs
      .filter((d) => this.matchesQuery(d, args.query))
      .slice(0, args.limit || args.ragConfig.top_k || 20);
    this.logger.info(
      `Retrieved ${matched.length} matching documents from collection: ${args.collection}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Query: ${JSON.stringify(args.query)}, limit: ${args.limit || args.ragConfig.top_k || 20}`,
      this.constructor.name,
    );

    return {
      data: { ok: true, data: matched } as any,
      mimeType: 'application/json' as any,
    };
  }
}

export default LocalDbRetriever;
