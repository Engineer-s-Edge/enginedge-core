import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { promises as fs } from 'fs';
import * as path from 'path';

interface FsRetrieveArgs {
  root?: string;
  dir?: string;
  pattern?: string;
  file?: string;
  encoding?: BufferEncoding;
  maxBytes?: number;
}
interface FsRetrieveOutput extends ToolOutput {
  data: any;
}

export class FilesystemRetriever extends BaseRetriever<
  FsRetrieveArgs,
  FsRetrieveOutput
> {
  _id: ToolIdType = 't_000000000000000000000308' as unknown as ToolIdType;
  name = 'fs.retrieve';
  description = 'List files or read a file safely inside a sandbox root.';
  useCase = 'Retrieve local files for RAG.';

  constructor() {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 50,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      root: { type: 'string' },
      dir: { type: 'string' },
      pattern: { type: 'string' },
      file: { type: 'string' },
      encoding: { type: 'string' },
      maxBytes: { type: 'number' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'fs.retrieve', args: { dir: 'docs', pattern: '.md' } } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private resolveSafe(root: string, p: string) {
    const full = path.resolve(root, p);
    if (!full.startsWith(root)) {
      this.logger.error(
        `Path escapes sandbox: ${p} -> ${full}`,
        undefined,
        this.constructor.name,
      );
      throw Object.assign(new Error('Path escapes sandbox'), {
        name: 'ValidationError',
      });
    }
    this.logger.debug(`Path validated: ${p} -> ${full}`, this.constructor.name);
    return full;
  }

  protected async retrieve(
    args: FsRetrieveArgs & { ragConfig: RAGConfig },
  ): Promise<FsRetrieveOutput> {
    this.logger.info(
      `Retrieving filesystem data: ${args.file ? 'file' : 'directory'}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Filesystem retriever args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    const root = path.resolve(args.root || process.cwd());
    this.logger.debug(`Sandbox root: ${root}`, this.constructor.name);

    if (args.file) {
      this.logger.debug(`Reading file: ${args.file}`, this.constructor.name);
      const full = this.resolveSafe(root, args.file);
      const maxBytes = args.maxBytes ?? 512 * 1024;

      this.logger.debug(
        `Opening file with maxBytes: ${maxBytes}`,
        this.constructor.name,
      );
      const fh = await fs.open(full, 'r');
      const buf = Buffer.alloc(Math.min(maxBytes, (await fh.stat()).size));
      await fh.read(buf, 0, buf.length, 0);
      await fh.close();

      const content =
        (args.encoding || 'utf8') === 'utf8'
          ? buf.toString('utf8')
          : buf.toString(args.encoding || 'utf8');
      this.logger.info(
        `File read successfully: ${args.file} (${content.length} chars)`,
        this.constructor.name,
      );

      return {
        data: {
          ok: true,
          data: { path: path.relative(root, full), content },
        } as any,
        mimeType: 'application/json' as any,
      };
    }

    this.logger.debug(
      `Listing directory: ${args.dir || '.'}`,
      this.constructor.name,
    );
    const dir = this.resolveSafe(root, args.dir || '.');
    const entries = await fs.readdir(dir);
    const filtered = (
      args.pattern ? entries.filter((e) => e.includes(args.pattern!)) : entries
    ).slice(0, args.ragConfig.top_k || 50);

    this.logger.info(
      `Directory listing completed: ${filtered.length} files (pattern: ${args.pattern || 'none'})`,
      this.constructor.name,
    );
    this.logger.debug(
      `Total entries: ${entries.length}, filtered: ${filtered.length}`,
      this.constructor.name,
    );

    return {
      data: { ok: true, data: filtered } as any,
      mimeType: 'application/json' as any,
    };
  }
}

export default FilesystemRetriever;
