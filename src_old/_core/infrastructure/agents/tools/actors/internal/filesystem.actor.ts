import { promises as fs } from 'fs';
import * as path from 'path';
import { BaseActor } from '../../base/BaseActor';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolCall, ToolOutput } from '../../toolkit.interface';

type FsOperation = 'read' | 'write' | 'delete' | 'mkdir' | 'exists' | 'list';

interface FilesystemArgs {
  op: FsOperation;
  filepath?: string;
  content?: string;
  encoding?: BufferEncoding;
  recursive?: boolean;
  root?: string; // optional sandbox root; defaults to process.cwd()
}

interface FilesystemOutput extends ToolOutput {
  data: {
    ok: boolean;
    op: string;
    filepath?: string;
    content?: string;
    exists?: boolean;
    entries?: string[];
  };
}

export class FilesystemActor extends BaseActor<
  FilesystemArgs,
  FilesystemOutput
> {
  _id: ToolIdType = 't_000000000000000000000102' as unknown as ToolIdType;
  name = 'fs.actor';
  description =
    'Safely perform basic filesystem operations within a sandboxed root.';
  useCase = 'Create, read, update, delete files and folders for automation.';

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: ['read', 'write', 'delete', 'mkdir', 'exists', 'list'],
      },
      filepath: { type: 'string' },
      content: { type: 'string' },
      encoding: {
        type: 'string',
        enum: ['utf8', 'utf-8', 'ascii', 'base64'],
        default: 'utf8',
      },
      recursive: { type: 'boolean', default: false },
      root: { type: 'string' },
    },
  };

  outputSchema = {
    type: 'object',
    required: ['ok', 'op'],
    properties: {
      ok: { type: 'boolean' },
      op: { type: 'string' },
      filepath: { type: 'string' },
      content: { type: 'string' },
      exists: { type: 'boolean' },
      entries: { type: 'array', items: { type: 'string' } },
    },
  };

  invocationExample = [
    {
      name: 'fs.actor',
      args: { op: 'read', filepath: 'README.md' },
    } as ToolCall,
    {
      name: 'fs.actor',
      args: { op: 'write', filepath: 'notes/todo.txt', content: 'hello' },
    } as ToolCall,
  ];

  retries = 0;
  errorEvent = [
    {
      name: 'ENOENT',
      guidance: 'File or directory not found.',
      retryable: false,
    },
    {
      name: 'EACCES',
      guidance: 'Permission denied; check sandbox root and path.',
      retryable: false,
    },
  ];
  parallel = false;
  concatenate = (
    results: import('../../toolkit.interface').ToolResult<any, ToolOutput>[],
  ): import('../../toolkit.interface').ToolResult<any, ToolOutput> =>
    results[results.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async act(args: FilesystemArgs): Promise<FilesystemOutput> {
    this.logger.info(
      `Executing filesystem operation: ${args.op}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Filesystem args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const sandboxRoot = path.resolve(args.root || process.cwd());
    this.logger.debug(`Sandbox root: ${sandboxRoot}`, this.constructor.name);

    const ensureInsideRoot = (p: string) => {
      const full = path.resolve(sandboxRoot, p);
      if (!full.startsWith(sandboxRoot)) {
        this.logger.error(
          `Path escapes sandbox root: ${p} -> ${full}`,
          undefined,
          this.constructor.name,
        );
        const err: any = new Error('Path escapes sandbox root');
        err.name = 'EACCES';
        throw err;
      }
      this.logger.debug(
        `Path validated: ${p} -> ${full}`,
        this.constructor.name,
      );
      return full;
    };

    const encoding = (args.encoding || 'utf8') as BufferEncoding;
    const op = args.op;
    this.logger.debug(
      `Operation: ${op}, encoding: ${encoding}`,
      this.constructor.name,
    );

    if (op === 'list') {
      const dir = ensureInsideRoot(args.filepath || '.');
      this.logger.debug(`Listing directory: ${dir}`, this.constructor.name);
      const entries = await fs.readdir(dir);
      this.logger.info(
        `Directory listing completed: ${entries.length} entries`,
        this.constructor.name,
      );
      return {
        data: {
          ok: true,
          op,
          entries,
          filepath: path.relative(sandboxRoot, dir),
        } as any,
        mimeType: 'application/json' as any,
      };
    }

    if (!args.filepath) {
      this.logger.error(
        'filepath is required for filesystem operation',
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('filepath is required'), {
        name: 'ValidationError',
      });
    }

    const fullPath = ensureInsideRoot(args.filepath);
    this.logger.debug(`Full path resolved: ${fullPath}`, this.constructor.name);

    switch (op) {
      case 'read': {
        this.logger.debug(`Reading file: ${fullPath}`, this.constructor.name);
        const content = await fs.readFile(fullPath, { encoding });
        this.logger.info(
          `File read successfully: ${fullPath} (${content.length} chars)`,
          this.constructor.name,
        );
        return {
          data: { ok: true, op, filepath: args.filepath, content } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'write': {
        this.logger.debug(`Writing file: ${fullPath}`, this.constructor.name);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, args.content || '', { encoding });
        this.logger.info(
          `File written successfully: ${fullPath} (${(args.content || '').length} chars)`,
          this.constructor.name,
        );
        return {
          data: { ok: true, op, filepath: args.filepath } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'delete': {
        this.logger.debug(
          `Deleting file/directory: ${fullPath} (recursive: ${!!args.recursive})`,
          this.constructor.name,
        );
        await fs.rm(fullPath, { recursive: !!args.recursive, force: true });
        this.logger.info(
          `File/directory deleted successfully: ${fullPath}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, op, filepath: args.filepath } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'mkdir': {
        this.logger.debug(
          `Creating directory: ${fullPath} (recursive: ${!!args.recursive})`,
          this.constructor.name,
        );
        await fs.mkdir(fullPath, { recursive: !!args.recursive });
        this.logger.info(
          `Directory created successfully: ${fullPath}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, op, filepath: args.filepath } as any,
          mimeType: 'application/json' as any,
        };
      }
      case 'exists': {
        this.logger.debug(
          `Checking if path exists: ${fullPath}`,
          this.constructor.name,
        );
        let exists = false;
        try {
          await fs.access(fullPath);
          exists = true;
        } catch {}
        this.logger.info(
          `Path exists check completed: ${fullPath} -> ${exists}`,
          this.constructor.name,
        );
        return {
          data: { ok: true, op, filepath: args.filepath, exists } as any,
          mimeType: 'application/json' as any,
        };
      }
      default: {
        this.logger.error(
          `Unsupported filesystem operation: ${op}`,
          undefined,
          this.constructor.name,
        );
        const err: any = new Error(`Unsupported op: ${op}`);
        err.name = 'ValidationError';
        throw err;
      }
    }
  }
}

export default FilesystemActor;
