import { Injectable } from '@nestjs/common';
import {
  CharacterTextSplitter,
  CharacterTextSplitterParams,
} from '@langchain/textsplitters';
import { splitWithPositions } from '../utils/split_position';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface CharacterSplitterOptions
  extends Partial<CharacterTextSplitterParams> {}

@Injectable()
export class CharacterTextSplitterAdapter
  implements TextSplitterAdapter<'character', CharacterSplitterOptions>
{
  private defaultOptions: CharacterSplitterOptions;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = { chunkSize: 500, chunkOverlap: 50 };
    this.logger.info(
      'CharacterTextSplitterAdapter initializing',
      CharacterTextSplitterAdapter.name,
    );
  }

  /** Simple split to plain chunks */
  async splitText(
    text: string,
    overrideOptions: CharacterSplitterOptions = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using character splitter (text length: ${text.length})`,
      CharacterTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as CharacterTextSplitterParams;
      this.logger.info(
        `Character splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}`,
        CharacterTextSplitterAdapter.name,
      );
      const splitter = new CharacterTextSplitter(opts);
      const result = await splitter.splitText(text);
      this.logger.info(
        `Successfully split text into ${result.length} chunks using character splitter`,
        CharacterTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with character splitter',
        CharacterTextSplitterAdapter.name,
        info.stack,
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
    overrideOptions: CharacterSplitterOptions = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with positions using character splitter (text length: ${text.length})`,
      CharacterTextSplitterAdapter.name,
    );
    try {
      const opts = {
        ...this.defaultOptions,
        ...overrideOptions,
      } as CharacterTextSplitterParams;
      this.logger.info(
        `Character splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}`,
        CharacterTextSplitterAdapter.name,
      );
      const splitter = new CharacterTextSplitter(opts);
      const result = await splitWithPositions(text, splitter.splitText);
      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using character splitter`,
        CharacterTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting text with positions using character splitter',
        CharacterTextSplitterAdapter.name,
        info.stack,
      );
      throw error;
    }
  }
}
