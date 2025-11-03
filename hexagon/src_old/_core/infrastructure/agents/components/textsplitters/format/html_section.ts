import { Injectable } from '@nestjs/common';
import { parse, HTMLElement } from 'node-html-parser';
import { splitWithPositions } from '../utils/split_position';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// define splitter argument interface
export interface HTMLSectionSplitterParams {
  headersToSplitOn: [string, string][];
  chunkSize: number;
  chunkOverlap: number;
}

export interface HTMLSectionTextSplitterOptions
  extends HTMLSectionSplitterParams {}

// new splitter implementation
export class HTMLSectionTextSplitter {
  constructor(private options: HTMLSectionTextSplitterOptions) {}

  private chunkText(text: string): string[] {
    const { chunkSize, chunkOverlap } = this.options;
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - chunkOverlap;
    }
    return chunks;
  }

  async splitText(html: string): Promise<string[]> {
    const { headersToSplitOn } = this.options;
    const tags = headersToSplitOn.map((h) => h[0]);
    const levelsMap = new Map(headersToSplitOn);
    const root = parse(html);
    const body = root.querySelector('body') || root;
    const sections: { level: string; content: string }[] = [];
    let current = { level: 'root', content: '' };

    for (const node of body.childNodes) {
      if (
        node instanceof HTMLElement &&
        tags.includes(node.tagName.toLowerCase())
      ) {
        if (current.content) sections.push(current);
        const lvl = levelsMap.get(node.tagName.toLowerCase()) || 'root';
        current = { level: lvl, content: node.textContent.trim() + '\n' };
      } else {
        const text = node.textContent.trim();
        if (text) current.content += text + '\n';
      }
    }
    if (current.content) sections.push(current);

    const results: string[] = [];
    for (const sec of sections) {
      const full = sec.content.trim();
      results.push(...this.chunkText(full));
    }
    return results;
  }
}

// adapter uses our custom splitter
@Injectable()
export class HTMLSectionTextSplitterAdapter
  implements TextSplitterAdapter<'html-section', HTMLSectionTextSplitterOptions>
{
  private defaultOptions: HTMLSectionSplitterParams;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      headersToSplitOn: [
        ['h1', 'H1'],
        ['h2', 'H2'],
        ['h3', 'H3'],
      ],
      chunkSize: 800,
      chunkOverlap: 100,
    } as HTMLSectionSplitterParams;
    this.logger.info(
      'HTMLSectionTextSplitterAdapter initializing',
      HTMLSectionTextSplitterAdapter.name,
    );
  }

  async splitText(
    html: string,
    overrideOptions: Partial<HTMLSectionSplitterParams> = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting HTML using section splitter (HTML length: ${html.length})`,
      HTMLSectionTextSplitterAdapter.name,
    );
    try {
      const opts: HTMLSectionSplitterParams = {
        ...this.defaultOptions,
        ...(overrideOptions as HTMLSectionSplitterParams),
      };
      this.logger.info(
        `HTML section splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, headers=${opts.headersToSplitOn.map((h) => h[0]).join(', ')}`,
        HTMLSectionTextSplitterAdapter.name,
      );
      const splitter = new HTMLSectionTextSplitter(opts);
      const result = await splitter.splitText(html);
      this.logger.info(
        `Successfully split HTML into ${result.length} chunks using section splitter`,
        HTMLSectionTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting HTML with section splitter: ${info.message}`,
        info.stack,
        HTMLSectionTextSplitterAdapter.name,
      );
      throw error;
    }
  }

  async splitTextWithPositions(
    html: string,
    overrideOptions: Partial<HTMLSectionSplitterParams> = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting HTML with positions using section splitter (HTML length: ${html.length})`,
      HTMLSectionTextSplitterAdapter.name,
    );
    try {
      const opts: HTMLSectionSplitterParams = {
        ...this.defaultOptions,
        ...(overrideOptions as HTMLSectionSplitterParams),
      };
      this.logger.info(
        `HTML section splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, headers=${opts.headersToSplitOn.map((h) => h[0]).join(', ')}`,
        HTMLSectionTextSplitterAdapter.name,
      );
      const splitter = new HTMLSectionTextSplitter(opts);
      const result = await splitWithPositions(
        html,
        splitter.splitText.bind(splitter),
      );
      this.logger.info(
        `Successfully split HTML with positions into ${result.length} chunks using section splitter`,
        HTMLSectionTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting HTML with positions using section splitter: ${info.message}`,
        info.stack,
        HTMLSectionTextSplitterAdapter.name,
      );
      throw error;
    }
  }
}
