// code.adapter.ts
import { Injectable } from '@nestjs/common';
import {
  RecursiveCharacterTextSplitter,
  RecursiveCharacterTextSplitterParams,
  SupportedTextSplitterLanguage,
} from '@langchain/textsplitters';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { splitWithPositions } from '../utils/split_position';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface CodeSplitterOptions
  extends Partial<RecursiveCharacterTextSplitterParams> {
  language: SupportedTextSplitterLanguage;
}

@Injectable()
export class CodeTextSplitterAdapter
  implements TextSplitterAdapter<'code', CodeSplitterOptions>
{
  private defaultOptions: Omit<
    RecursiveCharacterTextSplitterParams,
    'separators'
  > = {
    chunkSize: 500,
    chunkOverlap: 0,
    keepSeparator: false,
    lengthFunction: (text: string) => text.length,
  };

  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'CodeTextSplitterAdapter initializing',
      CodeTextSplitterAdapter.name,
    );
  }

  /** Matches interface: splitText(text: string, options: CodeSplitterOptions) */
  async splitText(
    code: string,
    options: CodeSplitterOptions,
  ): Promise<string[]> {
    this.logger.info(
      `Splitting code using code splitter (code length: ${code.length}, language: ${options.language})`,
      CodeTextSplitterAdapter.name,
    );
    try {
      const { language, ...overrideOptions } = options;
      const params: RecursiveCharacterTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
        separators:
          RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language),
      };
      this.logger.info(
        `Code splitter options: chunkSize=${params.chunkSize}, chunkOverlap=${params.chunkOverlap}, language=${language}`,
        CodeTextSplitterAdapter.name,
      );
      const result = await RecursiveCharacterTextSplitter.fromLanguage(
        language,
        params,
      ).splitText(code);
      this.logger.info(
        `Successfully split code into ${result.length} chunks using code splitter`,
        CodeTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting code with code splitter: ${info.message}`,
        info.stack,
        CodeTextSplitterAdapter.name,
      );
      throw error;
    }
  }

  /** Matches interface: splitTextWithPositions(text: string, options: CodeSplitterOptions) */
  async splitTextWithPositions(
    code: string,
    options: CodeSplitterOptions,
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting code with positions using code splitter (code length: ${code.length}, language: ${options.language})`,
      CodeTextSplitterAdapter.name,
    );
    try {
      const { language, ...overrideOptions } = options;
      const params: RecursiveCharacterTextSplitterParams = {
        ...this.defaultOptions,
        ...overrideOptions,
        separators:
          RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language),
      };
      this.logger.info(
        `Code splitter options: chunkSize=${params.chunkSize}, chunkOverlap=${params.chunkOverlap}, language=${language}`,
        CodeTextSplitterAdapter.name,
      );
      const splitter = RecursiveCharacterTextSplitter.fromLanguage(
        language,
        params,
      );
      const result = await splitWithPositions(code, splitter.splitText);
      this.logger.info(
        `Successfully split code with positions into ${result.length} chunks using code splitter`,
        CodeTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting code with positions using code splitter: ${info.message}`,
        info.stack,
        CodeTextSplitterAdapter.name,
      );
      throw error;
    }
  }
}
