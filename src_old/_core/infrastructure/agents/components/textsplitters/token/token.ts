import { Injectable } from '@nestjs/common';
import {
  TokenTextSplitter,
  TokenTextSplitterParams,
} from '@langchain/textsplitters';
import { splitWithPositions } from '../utils/split_position';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// Use Case: Splits text into token-based chunks based on a specified tokenizer.
// Recommendation: Ensures you never exceed your model's token limits; customize `encodingName` for different models.
export interface TokenSplitterOptions
  extends Partial<TokenTextSplitterParams> {}

@Injectable()
export class TokenTextSplitterAdapter
  implements TextSplitterAdapter<'token', TokenSplitterOptions>
{
  private defaultOptions: TokenSplitterOptions;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      chunkSize: 500,
      chunkOverlap: 50,
      encodingName: 'gpt2',
    };
    this.logger.info(
      'TokenTextSplitterAdapter initializing',
      TokenTextSplitterAdapter.name,
    );
  }

  /**
   * Splits text by tokens. Override encoding or sizes at runtime as needed.
   */
  async splitText(
    text: string,
    overrideOptions: TokenSplitterOptions = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using token splitter (text length: ${text.length})`,
      TokenTextSplitterAdapter.name,
    );
    try {
      const opts: TokenTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as TokenTextSplitterParams;
      this.logger.info(
        `Token splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, encodingName=${opts.encodingName}`,
        TokenTextSplitterAdapter.name,
      );
      const splitter = new TokenTextSplitter(opts);
      const result = await splitter.splitText(text);
      this.logger.info(
        `Successfully split text into ${result.length} chunks using token splitter`,
        TokenTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with token splitter\n' + (info.stack || ''),
        TokenTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Splits text by tokens and returns the start and end line numbers.
   */
  async splitTextWithPositions(
    text: string,
    overrideOptions: TokenSplitterOptions = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with positions using token splitter (text length: ${text.length})`,
      TokenTextSplitterAdapter.name,
    );
    try {
      const opts: TokenTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as TokenTextSplitterParams;
      this.logger.info(
        `Token splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, encodingName=${opts.encodingName}`,
        TokenTextSplitterAdapter.name,
      );
      const splitter = new TokenTextSplitter(opts);
      const result = await splitWithPositions(
        text,
        splitter.splitText.bind(splitter),
      );
      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using token splitter`,
        TokenTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with positions using token splitter\n' +
          (info.stack || ''),
        TokenTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }
}
