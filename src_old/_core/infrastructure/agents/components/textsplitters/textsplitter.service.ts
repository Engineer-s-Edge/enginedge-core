// textsplitter.service.ts
import { Injectable, Scope } from '@nestjs/common';
import TextSplitterFactory, {
  TextSplitterOptionsMap,
  TextSplitterType,
} from './textsplitter.factory';
import { LineCharPos } from '../vectorstores/entities/store.entity';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable({ scope: Scope.DEFAULT })
export default class TextSplitterService {
  constructor(
    private factory: TextSplitterFactory,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'TextSplitterService initialized',
      TextSplitterService.name,
    );
  }

  async split<T extends TextSplitterType>(
    text: string,
    type: T,
    overrideOptions?: TextSplitterOptionsMap[T],
  ): Promise<string[]> {
    this.logger.info(
      `Splitting text using ${type} splitter, text length: ${text.length}`,
      TextSplitterService.name,
    );

    try {
      const splitter = this.factory.getSplitter(type);
      const result = await splitter.splitText(text, overrideOptions);

      this.logger.info(
        `Successfully split text into ${result.length} chunks using ${type} splitter`,
        TextSplitterService.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to split text using ${type} splitter:\n` + (info.stack || ''),
        TextSplitterService.name,
      );
      throw new Error(info.message);
    }
  }

  async splitWithLines<T extends TextSplitterType>(
    text: string,
    type: T,
    overrideOptions?: TextSplitterOptionsMap[T],
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting text with line positions using ${type} splitter, text length: ${text.length}`,
      TextSplitterService.name,
    );

    try {
      const splitter = this.factory.getSplitter(type);
      const result = await splitter.splitTextWithPositions(
        text,
        overrideOptions,
      );

      this.logger.info(
        `Successfully split text with positions into ${result.length} chunks using ${type} splitter`,
        TextSplitterService.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to split text with positions using ${type} splitter:\n` +
          (info.stack || ''),
        TextSplitterService.name,
      );
      throw new Error(info.message);
    }
  }
}
