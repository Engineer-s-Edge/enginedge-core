import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { WolframService } from '@core/infrastructure/wolfram/wolfram.service';
import { LocalWolframService } from '@core/infrastructure/wolfram/local-kernel/local-wolfram.service';
import { WebWolframService } from '@core/infrastructure/wolfram/web/web-wolfram.service';
import { MyLogger } from '@core/services/logger/logger.service';
import { ConfigService } from '@nestjs/config';

interface WolframArgs {
  query: string;
  format?: 'plaintext' | 'html' | 'image';
}
interface WolframOutput extends ToolOutput {
  data: any;
}

export class WolframRetriever extends BaseRetriever<
  WolframArgs,
  WolframOutput
> {
  _id: ToolIdType = 't_000000000000000000000309' as unknown as ToolIdType;
  name = 'wolfram.retrieve';
  description = 'Retrieve results from Wolfram Alpha.';
  useCase = 'Mathematics and computational queries.';

  constructor(
    logger: MyLogger,
    configService: ConfigService,
    private localWolfram: LocalWolframService,
    private webWolfram: WebWolframService,
    private wolfram: WolframService,
  ) {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 1,
      top_kModifiable: false,
      optimize: true,
    });
    this.logger.info(
      `Initializing WolframRetriever with WolframService`,
      this.constructor.name,
    );
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string' },
      format: { type: 'string', enum: ['plaintext', 'html', 'image'] },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'wolfram.retrieve',
      args: { query: 'integrate sin(x) dx' },
    } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  protected async retrieve(
    args: WolframArgs & { ragConfig: RAGConfig },
  ): Promise<WolframOutput> {
    this.logger.info(
      `Retrieving Wolfram Alpha results for query: ${args.query}`,
      this.constructor.name,
    );
    this.logger.debug(
      `Wolfram args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const format = args.format || 'plaintext';
      this.logger.debug(
        `Executing Wolfram query with format: ${format}`,
        this.constructor.name,
      );

      const res = await this.wolfram.execute(args.query);

      this.logger.info(
        `Wolfram query completed: ${res?.success ? 'success' : 'failed'}`,
        this.constructor.name,
      );
      this.logger.debug(
        `Query: ${args.query}, Format: ${format}, Success: ${res?.success}`,
        this.constructor.name,
      );

      return {
        data: { ok: !!res?.success, data: res } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `Wolfram retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default WolframRetriever;
