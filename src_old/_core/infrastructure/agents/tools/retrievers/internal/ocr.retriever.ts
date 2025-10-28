import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { OcrService } from '@core/infrastructure/agents/components/loaders/utils/ocr';
import { MyLogger } from '@core/services/logger/logger.service';

interface OcrArgs {
  imagesBase64: string[];
  lang?: string;
  minLength?: number;
}
interface OcrOutput extends ToolOutput {
  data: any;
}

export class OcrRetriever extends BaseRetriever<OcrArgs, OcrOutput> {
  _id: ToolIdType = 't_000000000000000000000311' as unknown as ToolIdType;
  name = 'ocr.retrieve';
  description = 'Extract text from base64-encoded images via Tesseract.';
  useCase = 'OCR documents and images for retrieval.';

  constructor(
    logger: MyLogger,
    private ocr = new OcrService(logger),
  ) {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 10,
      top_kModifiable: true,
      optimize: true,
    });
    this.logger = logger;
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['imagesBase64'],
    properties: {
      imagesBase64: { type: 'array', items: { type: 'string' } },
      lang: { type: 'string' },
      minLength: { type: 'number' },
      ragConfig: { type: 'object' },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    {
      name: 'ocr.retrieve',
      args: { imagesBase64: ['iVBORw0...'] },
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
    args: OcrArgs & { ragConfig: RAGConfig },
  ): Promise<OcrOutput> {
    this.logger.info(
      `Performing OCR on ${args.imagesBase64.length} images`,
      this.constructor.name,
    );
    this.logger.debug(
      `OCR args: ${JSON.stringify({ ...args, imagesBase64: args.imagesBase64.map((_, i) => `image_${i}_${args.imagesBase64[i].length}chars`) })}`,
      this.constructor.name,
    );

    try {
      this.logger.debug(
        `Converting ${args.imagesBase64.length} base64 strings to buffers`,
        this.constructor.name,
      );
      const buffers = args.imagesBase64.map((b64) =>
        Buffer.from(b64, 'base64'),
      );
      this.logger.debug(
        `Buffer sizes: ${buffers.map((b) => b.length).join(', ')} bytes`,
        this.constructor.name,
      );

      const ocrOptions = {
        lang: args.lang || 'eng',
        minLength: args.minLength ?? 5,
      };
      this.logger.debug(
        `OCR options: ${JSON.stringify(ocrOptions)}`,
        this.constructor.name,
      );

      this.logger.debug(
        'Starting batch OCR recognition',
        this.constructor.name,
      );
      const texts = await this.ocr.batchRecognize(buffers, ocrOptions);
      this.logger.info(
        `OCR completed: ${texts.length} text results extracted`,
        this.constructor.name,
      );

      const data = texts.map((text, i) => ({ index: i, text }));
      this.logger.debug(
        `OCR results: ${data.map((d) => `image_${d.index}: ${d.text.length} chars`).join(', ')}`,
        this.constructor.name,
      );

      return {
        data: { ok: true, data } as any,
        mimeType: 'application/json' as any,
      };
    } catch (error: any) {
      this.logger.error(
        `OCR processing failed: ${error.message}`,
        error.stack,
        this.constructor.name,
      );
      throw error;
    }
  }
}

export default OcrRetriever;
