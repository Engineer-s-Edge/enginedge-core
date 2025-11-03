import { Injectable } from '@nestjs/common';
import {
  MarkdownTextSplitter,
  MarkdownTextSplitterParams,
} from '@langchain/textsplitters';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { splitWithPositions } from '../utils/split_position';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// Use Case: Splits Markdown documents by heading markers (#/##/###), keeping sections intact.
// Recommendation: Ideal for README files, blogs, or docs written in Markdown.
export interface MarkdownHeaderSplitterOptions
  extends Partial<MarkdownTextSplitterParams> {}

@Injectable()
export class MarkdownTextSplitterAdapter
  implements TextSplitterAdapter<'markdown', MarkdownHeaderSplitterOptions>
{
  private defaultOptions: MarkdownHeaderSplitterOptions;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      chunkSize: 750,
      chunkOverlap: 100,
      keepSeparator: true,
      lengthFunction: (text: string) => text.length,
    };
    this.logger.info(
      'MarkdownTextSplitterAdapter initializing',
      MarkdownTextSplitterAdapter.name,
    );
  }

  /**
   * Splits Markdown by headers. Runtime overrides let you control size and overlap.
   */
  async splitText(
    md: string,
    overrideOptions: MarkdownHeaderSplitterOptions = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting markdown using markdown splitter (markdown length: ${md.length})`,
      MarkdownTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as MarkdownTextSplitterParams;
      this.logger.info(
        `Markdown splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, keepSeparator=${opts.keepSeparator}`,
        MarkdownTextSplitterAdapter.name,
      );
      const splitter = new MarkdownTextSplitter(opts);
      const result = await splitter.splitText(md);
      this.logger.info(
        `Successfully split markdown into ${result.length} chunks using markdown splitter`,
        MarkdownTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting markdown with markdown splitter: ${info.message}`,
        info.stack,
        MarkdownTextSplitterAdapter.name,
      );
      throw error;
    }
  }

  /**
   * Splits Markdown by headers, returning the text and line numbers.
   */
  async splitTextWithPositions(
    md: string,
    overrideOptions: MarkdownHeaderSplitterOptions = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting markdown with positions using markdown splitter (markdown length: ${md.length})`,
      MarkdownTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as MarkdownTextSplitterParams;
      this.logger.info(
        `Markdown splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, keepSeparator=${opts.keepSeparator}`,
        MarkdownTextSplitterAdapter.name,
      );
      const splitter = new MarkdownTextSplitter(opts);
      const result = await splitWithPositions(md, splitter.splitText);
      this.logger.info(
        `Successfully split markdown with positions into ${result.length} chunks using markdown splitter`,
        MarkdownTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting markdown with positions using markdown splitter: ${info.message}`,
        info.stack,
        MarkdownTextSplitterAdapter.name,
      );
      throw error;
    }
  }
}
