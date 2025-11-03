import { Injectable } from '@nestjs/common';
import {
  RecursiveCharacterTextSplitter,
  RecursiveCharacterTextSplitterParams,
} from '@langchain/textsplitters';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { splitWithPositions } from '../utils/split_position';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// Use Case: Preserves semantic segments (paragraphs, sentences) before enforcing size limits.
// Recommendation: Ideal for generic documents where paragraph or sentence integrity matters.
export interface RecursiveSplitterOptions
  extends Partial<RecursiveCharacterTextSplitterParams> {}

@Injectable()
export class RecursiveCharacterTextSplitterAdapter
  implements TextSplitterAdapter<'recursive', RecursiveSplitterOptions>
{
  private defaultOptions: RecursiveSplitterOptions;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', ' ', ''],
    };
    this.logger.info(
      'RecursiveCharacterTextSplitterAdapter initializing',
      RecursiveCharacterTextSplitterAdapter.name,
    );
  }

  /**
   * Splits text recursively on a hierarchy of separators for semantic coherence.
   */
  async splitText(
    text: string,
    overrideOptions: RecursiveSplitterOptions = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using recursive character splitter (text length: ${text.length})`,
      RecursiveCharacterTextSplitterAdapter.name,
    );
    try {
      const opts: RecursiveCharacterTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as RecursiveCharacterTextSplitterParams;
      this.logger.info(
        `Recursive splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, separators=${opts.separators?.join(', ')}`,
        RecursiveCharacterTextSplitterAdapter.name,
      );
      const splitter = new RecursiveCharacterTextSplitter(opts);
      const result = await splitter.splitText(text);
      this.logger.info(
        `Successfully split text into ${result.length} chunks using recursive character splitter`,
        RecursiveCharacterTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with recursive character splitter\n' +
          (info.stack || ''),
        RecursiveCharacterTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Splits text by characters and returns each chunk with start/end positions.
   * Uses a shared helper to handle line/column mapping in one go.
   */
  async splitTextWithPositions(
    text: string,
    overrideOptions: RecursiveSplitterOptions = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with positions using recursive character splitter (text length: ${text.length})`,
      RecursiveCharacterTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as RecursiveCharacterTextSplitterParams;
      this.logger.info(
        `Recursive splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, separators=${opts.separators?.join(', ')}`,
        RecursiveCharacterTextSplitterAdapter.name,
      );
      const splitter = new RecursiveCharacterTextSplitter(opts);
      const result = await splitWithPositions(text, splitter.splitText);
      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using recursive character splitter`,
        RecursiveCharacterTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with positions using recursive character splitter\n' +
          (info.stack || ''),
        RecursiveCharacterTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }
}
