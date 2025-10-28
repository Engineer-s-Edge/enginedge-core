import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { TextSplitterType } from '../textsplitter.factory';

export interface TextSplitterAdapter<T extends TextSplitterType, O> {
  splitText(text: string, options?: O): Promise<string[]>;

  splitTextWithPositions(
    text: string,
    options?: O,
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]>;
}
