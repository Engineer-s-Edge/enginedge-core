import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { YouTubeWebLoader } from '@core/infrastructure/agents/components/loaders/web/youtube';
import { MyLogger } from '@core/services/logger/logger.service';

interface YouTubeArgs {
  videoUrl: string;
  language?: string;
  includeInfo?: boolean;
}
interface YouTubeOutput extends ToolOutput {
  data: any;
}

export class YouTubeRetriever extends BaseRetriever<
  YouTubeArgs,
  YouTubeOutput
> {
  _id: ToolIdType = 't_000000000000000000000306' as unknown as ToolIdType;
  name = 'youtube.retrieve';
  description = 'Retrieve YouTube transcript and metadata.';
  useCase = 'Pull transcripts for analysis and RAG.';

  constructor(
    logger: MyLogger,
    private loader = new YouTubeWebLoader(logger),
  ) {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 1,
      top_kModifiable: false,
      optimize: true,
    });
    this.logger = logger;
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['videoUrl'],
    properties: {
      videoUrl: { type: 'string' },
      language: { type: 'string' },
      includeInfo: { type: 'boolean' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'youtube.retrieve',
      args: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
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
    args: YouTubeArgs & { ragConfig: RAGConfig },
  ): Promise<YouTubeOutput> {
    this.logger.info(
      `Retrieving YouTube transcript for video: ${args.videoUrl}`,
      this.constructor.name,
    );
    this.logger.debug(
      `YouTube args: ${JSON.stringify(args)}`,
      this.constructor.name,
    );

    try {
      const loaderOptions = {
        language: args.language || 'en',
        addVideoInfo: args.includeInfo ?? true,
      };
      this.logger.debug(
        `YouTube loader options: ${JSON.stringify(loaderOptions)}`,
        this.constructor.name,
      );

      this.logger.debug(
        'Loading YouTube video transcript',
        this.constructor.name,
      );
      const docs = await this.loader.load(args.videoUrl, loaderOptions);
      this.logger.info(
        `YouTube transcript loaded: ${docs.length} documents`,
        this.constructor.name,
      );

      const data = docs.map((d) => ({
        content: d.pageContent,
        metadata: d.metadata,
      }));
      this.logger.debug(
        `Processed ${data.length} transcript documents`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `YouTube transcript retrieval failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default YouTubeRetriever;
