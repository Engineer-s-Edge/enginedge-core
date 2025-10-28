import { promises as fs } from 'fs';
import * as path from 'path';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, ToolCall } from '../../toolkit.interface';

type LocalDbOperation =
  | 'insert'
  | 'find'
  | 'update'
  | 'delete'
  | 'count'
  | 'list-collections'
  | 'create-collection'
  | 'drop-collection';

interface LocalDbArgs {
  op: LocalDbOperation;
  collection?: string;
  record?: any;
  query?: any;
  update?: any; // $set style shallow merge
  many?: boolean;
  dbPath?: string; // defaults to ./.agent_state/localdb
}

interface LocalDbOutput extends ToolOutput {
  data: any;
}

export class LocalDbActor extends BaseActor<LocalDbArgs, LocalDbOutput> {
  _id: ToolIdType = 't_000000000000000000000105' as unknown as ToolIdType;
  name = 'localdb.actor';
  description =
    'Simple JSONL-backed local database with basic CRUD operations.';
  useCase = 'Persist lightweight structured data without external DBs.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: [
          'insert',
          'find',
          'update',
          'delete',
          'count',
          'list-collections',
          'create-collection',
          'drop-collection',
        ],
      },
      collection: { type: 'string' },
      record: {},
      query: {},
      update: {},
      many: { type: 'boolean', default: false },
      dbPath: { type: 'string' },
    },
  };

  outputSchema = {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      data: {},
      matched: { type: 'number' },
      modified: { type: 'number' },
      deleted: { type: 'number' },
      collections: { type: 'array', items: { type: 'string' } },
    },
  };

  invocationExample = [
    {
      name: 'localdb.actor',
      args: { op: 'create-collection', collection: 'notes' },
    } as ToolCall,
    {
      name: 'localdb.actor',
      args: {
        op: 'insert',
        collection: 'notes',
        record: { title: 'hello', tags: ['a'] },
      },
    } as ToolCall,
    {
      name: 'localdb.actor',
      args: { op: 'find', collection: 'notes', query: { title: 'hello' } },
    } as ToolCall,
  ];

  retries = 0;
  errorEvent = [
    {
      name: 'ValidationError',
      guidance: 'Check required fields for the selected operation.',
      retryable: false,
    },
  ];
  parallel = false;
  concatenate = (results: any[]) => results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private basePath(p?: string) {
    return path.resolve(
      p || path.resolve(process.cwd(), '.agent_state', 'localdb'),
    );
  }

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private collectionFile(dir: string, name: string) {
    return path.resolve(dir, `${name}.jsonl`);
  }

  private async readCollection(filePath: string): Promise<any[]> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((x) => x !== null);
    } catch (e: any) {
      if (e && e.code === 'ENOENT') return [];
      throw e;
    }
  }

  private async appendRecord(filePath: string, record: any) {
    await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
  }

  private matchesQuery(doc: any, query: any): boolean {
    if (!query || Object.keys(query).length === 0) return true;
    return Object.entries(query).every(([k, v]) => {
      const dv = (doc as any)[k];
      if (Array.isArray(v))
        return Array.isArray(dv) && v.every((x) => dv.includes(x));
      if (v && typeof v === 'object') {
        // naive $in support
        if ('$in' in (v as any)) {
          const arr = (v as any)['$in'];
          return Array.isArray(arr) ? arr.includes(dv) : false;
        }
      }
      return dv === v;
    });
  }

  protected async act(args: LocalDbArgs): Promise<LocalDbOutput> {
    this.logger.info(
      `Executing local database operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `LocalDb args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const dir = this.basePath(args.dbPath);
    this.logger.debug(`Database directory: ${dir}`, this.constructor.name);
    await this.ensureDir(dir);

    if (args.op === 'list-collections') {
      this.logger.debug('Listing all collections', this.constructor.name);
      const entries = await fs.readdir(dir);
      const collections = entries
        .filter((e) => e.endsWith('.jsonl'))
        .map((e) => path.basename(e, '.jsonl'));
      this.logger.info(
        `Found ${collections.length} collections: ${collections.join(', ')}`,
        this.constructor.name,
      );
      return {
        data: { ok: true, collections } as any,
        mimeType: 'application/json' as any,
      };
    }

    if (!args.collection || args.collection.trim().length === 0) {
      this.logger.error(
        'collection is required for database operation',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('collection is required'), {
        name: 'ValidationError',
      });
    }
    const file = this.collectionFile(dir, args.collection);
    this.logger.debug(`Collection file: ${file}`, this.constructor.name);

    switch (args.op) {
      case 'create-collection': {
        this.logger.debug(
          `Creating collection: ${args.collection}`,
          this.constructor.name,
        );
        await fs.writeFile(file, '', 'utf8');
        this.logger.info(
          `Collection created successfully: ${args.collection}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'drop-collection': {
        this.logger.debug(
          `Dropping collection: ${args.collection}`,
          this.constructor.name,
        );
        try {
          await fs.unlink(file);
        } catch {}
        this.logger.info(
          `Collection dropped successfully: ${args.collection}`,
          this.constructor.name,
        );
        return {
          data: { ok: true } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'insert': {
        if (!args.record) {
          this.logger.error(
            'record is required for insert operation',
            undefined,
            this.constructor.name,
          );
          throw Object.assign(new Error('record is required for insert'), {
            name: 'ValidationError',
          });
        }
        this.logger.debug(
          `Inserting record into collection: ${args.collection}`,
          this.constructor.name,
        );
        const recordWithId = {
          _id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          ...args.record,
        };
        await this.appendRecord(file, recordWithId);
        this.logger.info(
          `Record inserted successfully: ${recordWithId._id}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: recordWithId } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'find': {
        this.logger.debug(
          `Finding records in collection: ${args.collection}`,
          this.constructor.name,
        );
        const docs = await this.readCollection(file);
        const matched = docs.filter((d) => this.matchesQuery(d, args.query));
        this.logger.info(
          `Find operation completed: ${matched.length} records matched`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: matched } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'count': {
        this.logger.debug(
          `Counting records in collection: ${args.collection}`,
          this.constructor.name,
        );
        const docs = await this.readCollection(file);
        const matched = docs.filter((d) => this.matchesQuery(d, args.query));
        this.logger.info(
          `Count operation completed: ${matched.length} records`,
          this.constructor.name,
        );
        return {
          data: { ok: true, data: matched.length } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'update': {
        this.logger.debug(
          `Updating records in collection: ${args.collection}`,
          this.constructor.name,
        );
        const docs = await this.readCollection(file);
        let modified = 0;
        const result = [] as any[];
        for (const doc of docs) {
          if (this.matchesQuery(doc, args.query)) {
            modified++;
            if (args.update && typeof args.update === 'object') {
              if ('$set' in (args.update as any)) {
                Object.assign(doc, (args.update as any)['$set']);
              } else {
                Object.assign(doc, args.update);
              }
            }
          }
          result.push(doc);
          if (!args.many && modified > 0) {
            // push remaining docs untouched
            const idx = docs.indexOf(doc);
            result.push(...docs.slice(idx + 1));
            break;
          }
        }
        await fs.writeFile(
          file,
          result.map((d) => JSON.stringify(d)).join('\n') +
            (result.length ? '\n' : ''),
          'utf8',
        );
        this.logger.info(
          `Update operation completed: ${modified} records modified`,
          this.constructor.name,
        );
        return {
          data: { ok: true, matched: modified, modified } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete': {
        this.logger.debug(
          `Deleting records from collection: ${args.collection}`,
          this.constructor.name,
        );
        const docs = await this.readCollection(file);
        let deleted = 0;
        const kept = [] as any[];
        for (const doc of docs) {
          if (this.matchesQuery(doc, args.query)) {
            deleted++;
            if (!args.many && deleted > 0) {
              // Keep the rest
              const idx = docs.indexOf(doc);
              kept.push(...docs.slice(idx + 1));
              break;
            }
          } else {
            kept.push(doc);
          }
        }
        await fs.writeFile(
          file,
          kept.map((d) => JSON.stringify(d)).join('\n') +
            (kept.length ? '\n' : ''),
          'utf8',
        );
        this.logger.info(
          `Delete operation completed: ${deleted} records deleted`,
          this.constructor.name,
        );
        return {
          data: { ok: true, deleted } as any,
          mimeType: 'application/json' as any,
        };
      }
      default: {
        this.logger.error(
          `Unsupported local database operation: ${args.op}`,
          undefined,
          this.constructor.name,
        );
        throw Object.assign(new Error(`Unsupported op: ${args.op}`), {
          name: 'ValidationError',
        });
      }
    }
  }
}

export default LocalDbActor;
