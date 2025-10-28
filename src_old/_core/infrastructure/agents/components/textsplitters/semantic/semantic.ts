// Logic from https://github.com/tsensei's SemanticTextSplitter
import { Injectable } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitterParams } from '@langchain/textsplitters';
import * as naturalNS from 'natural';
import * as math from 'mathjs';
import { quantile } from 'd3-array';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { splitWithPositions } from '../utils/split_position';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * Options to configure the semantic splitter behavior.
 * - `splitterOptions`: underlying RecursiveCharacterTextSplitter settings.
 * - `bufferSize`: number of neighboring sentences to group for context.
 * - `percentile`: distance percentile threshold to detect semantic shifts.
 */
export interface SemanticSplitterOptions {
  splitterOptions?: Partial<RecursiveCharacterTextSplitterParams>;
  bufferSize?: number;
  percentile?: number;
}

interface SentenceObject {
  sentence: string;
  index: number;
  combined?: string;
  embedding?: number[];
  distance?: number;
}

// Use Case: Splits text semantically using sentence embeddings.
// Recommendation: Ideal for documents where semantic meaning is more important than strict structure.
export class SemanticTextSplitter {
  constructor(private options: SemanticSplitterOptions) {}

  async splitText(text: string): Promise<string[]> {
    // 1. Sentence tokenization
    const nat: any = (naturalNS as any) ?? {};
    const ST = nat.SentenceTokenizer || nat.SentenceTokenizer?.default;
    if (!ST) throw new Error('natural SentenceTokenizer not available');
    const tokenizer = new ST();
    const sentences = tokenizer.tokenize(text);
    // 2. Structure with buffer
    const structured = this.structure(sentences, this.options.bufferSize!);
    // 3. Generate embeddings
    await this.embedAll(structured);
    // 4. Compute distances and breakpoints
    const { shifts } = this.distanceAndShifts(
      structured,
      this.options.percentile!,
    );
    // 5. Group into chunks
    return this.groupChunks(structured, shifts);
  }

  private structure(sentences: string[], bufferSize: number): SentenceObject[] {
    return sentences.map((s, i) => {
      const start = Math.max(0, i - bufferSize);
      const end = Math.min(sentences.length - 1, i + bufferSize);
      const combined = sentences.slice(start, end + 1).join(' ');
      return { sentence: s, index: i, combined };
    });
  }

  private async embedAll(objs: SentenceObject[]): Promise<void> {
    const embeddings = new OpenAIEmbeddings();
    const texts = objs.map((o) => o.combined!);
    const vectors = await embeddings.embedDocuments(texts);
    objs.forEach((o, i) => (o.embedding = vectors[i]));
  }

  private distanceAndShifts(
    objs: SentenceObject[],
    pct: number,
  ): { shifts: number[] } {
    const distances: number[] = [];
    for (let i = 0; i < objs.length - 1; i++) {
      const a = objs[i].embedding!;
      const b = objs[i + 1].embedding!;
      const sim =
        (math.dot(a, b) as number) /
        ((math.norm(a) as number) * (math.norm(b) as number));
      const dist = 1 - sim;
      objs[i].distance = dist;
      distances.push(dist);
    }
    const sorted = [...distances].sort((a, b) => a - b);
    const threshold = (quantile(sorted, pct / 100) ?? 0) as number;
    const shifts = distances
      .map((d, i) => (d >= threshold ? i : -1))
      .filter((i) => i >= 0);
    return { shifts };
  }

  private groupChunks(objs: SentenceObject[], shifts: number[]): string[] {
    const breakpoints = [...shifts, objs.length - 1];
    const chunks: string[] = [];
    let start = 0;
    breakpoints.forEach((bp) => {
      const group = objs.slice(start, bp + 1).map((o) => o.sentence);
      chunks.push(group.join(' '));
      start = bp + 1;
    });
    return chunks;
  }
}

@Injectable()
export class SemanticTextSplitterAdapter
  implements TextSplitterAdapter<'semantic', SemanticSplitterOptions>
{
  private defaultOptions: SemanticSplitterOptions = {
    splitterOptions: {
      chunkSize: 200,
      chunkOverlap: 20,
      separators: ['\n', ' '],
    },
    bufferSize: 1,
    percentile: 90,
  };
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'SemanticTextSplitterAdapter initializing',
      SemanticTextSplitterAdapter.name,
    );
  }

  /**
   * Splits text semantically using sentence embeddings.
   */
  async splitText(
    text: string,
    overrideOptions: Partial<SemanticSplitterOptions> = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using semantic splitter (text length: ${text.length})`,
      SemanticTextSplitterAdapter.name,
    );
    try {
      const opts = { ...this.defaultOptions, ...overrideOptions };
      this.logger.info(
        `Semantic splitter options: bufferSize=${opts.bufferSize}, percentile=${opts.percentile}, chunkSize=${opts.splitterOptions?.chunkSize}`,
        SemanticTextSplitterAdapter.name,
      );
      const splitter = new SemanticTextSplitter(opts);
      const result = await splitter.splitText(text);
      this.logger.info(
        `Successfully split text into ${result.length} chunks using semantic splitter`,
        SemanticTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting text with semantic splitter: ${info.message}`,
        info.stack,
        SemanticTextSplitterAdapter.name,
      );
      throw error;
    }
  }

  /**
   * Splits text semantically and returns the text with line positions for each chunk.
   */
  async splitTextWithPositions(
    text: string,
    overrideOptions: Partial<SemanticSplitterOptions> = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with positions using semantic splitter (text length: ${text.length})`,
      SemanticTextSplitterAdapter.name,
    );
    try {
      const opts = { ...this.defaultOptions, ...overrideOptions };
      this.logger.info(
        `Semantic splitter options: bufferSize=${opts.bufferSize}, percentile=${opts.percentile}, chunkSize=${opts.splitterOptions?.chunkSize}`,
        SemanticTextSplitterAdapter.name,
      );
      const splitter = new SemanticTextSplitter(opts);
      // Bind instance method to preserve `this` inside splitText when passed as a callback
      const boundSplit = splitter.splitText.bind(splitter);
      const result = await splitWithPositions(text, boundSplit);
      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using semantic splitter`,
        SemanticTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting text with positions using semantic splitter: ${info.message}`,
        info.stack,
        SemanticTextSplitterAdapter.name,
      );
      throw error;
    }
  }
}
