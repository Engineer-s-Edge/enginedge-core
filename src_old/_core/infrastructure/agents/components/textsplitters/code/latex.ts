import { Injectable } from '@nestjs/common';
import {
  LatexTextSplitter,
  LatexTextSplitterParams,
} from '@langchain/textsplitters';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { splitWithPositions } from '../utils/split_position';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '../../../../../../common/error-assertions';

// Use Case: Splits LaTeX documents along sections, commands, and environments.
// Recommendation: Ideal for academic papers and technical documents in .tex format.
export interface LatexSplitterOptions
  extends Partial<LatexTextSplitterParams> {}

@Injectable()
export class LatexTextSplitterAdapter
  implements TextSplitterAdapter<'latex', LatexSplitterOptions>
{
  private defaultOptions: LatexSplitterOptions;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      chunkSize: 800,
      chunkOverlap: 100,
      keepSeparator: true,
      lengthFunction: (text: string) => text.length,
    };
    this.logger.info(
      'LatexTextSplitterAdapter initializing',
      LatexTextSplitterAdapter.name,
    );
  }

  /**
   * Splits LaTeX text using language-specific separators. Allows overrides for chunk size and overlap.
   */
  async splitText(
    text: string,
    overrideOptions: LatexSplitterOptions = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using LaTeX splitter (text length: ${text.length})`,
      LatexTextSplitterAdapter.name,
    );
    try {
      const opts: LatexTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as LatexTextSplitterParams;
      this.logger.info(
        `LaTeX splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, keepSeparator=${opts.keepSeparator}`,
        LatexTextSplitterAdapter.name,
      );
      const splitter = new LatexTextSplitter(opts);
      const result = await splitter.splitText(text);
      this.logger.info(
        `Successfully split text into ${result.length} chunks using LaTeX splitter`,
        LatexTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting text with LaTeX splitter: ${info.message}`,
        info.stack,
        LatexTextSplitterAdapter.name,
      );
      throw error;
    }
  }

  /**
   * Splits text by characters and returns each chunk with start/end positions.
   * Uses a shared helper to handle line/column mapping in one go.
   */
  async splitTextWithPositions(
    text: string,
    overrideOptions: LatexSplitterOptions = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with positions using LaTeX splitter (text length: ${text.length})`,
      LatexTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as LatexTextSplitterParams;
      this.logger.info(
        `LaTeX splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, keepSeparator=${opts.keepSeparator}`,
        LatexTextSplitterAdapter.name,
      );
      const splitter = new LatexTextSplitter(opts);
      const result = await splitWithPositions(text, splitter.splitText);
      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using LaTeX splitter`,
        LatexTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting text with positions using LaTeX splitter: ${info.message}`,
        info.stack,
        LatexTextSplitterAdapter.name,
      );
      throw error;
    }
  }
}
