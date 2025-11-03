import { parse, HTMLElement } from 'node-html-parser';
import { Injectable } from '@nestjs/common';
import { splitWithPositions } from '../utils/split_position';
import { LineCharPos } from '../../vectorstores/entities/store.entity';
import { TextSplitterAdapter } from '../utils/adapter.interface';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

// define splitter argument interface
export interface HTMLHeaderTextSplitterParams {
  headersToSplitOn: [string, string][];
  chunkSize: number;
  chunkOverlap: number;
}

export interface HTMLHeaderTextSplitterOptions
  extends HTMLHeaderTextSplitterParams {}

// Use Case: Splits HTML by header tags, allowing custom tag levels and sizes.
// Recommendation: Use when you need to extract specific sections of HTML content based on headers.

// implement manual HTMLHeaderTextSplitter
export class HTMLHeaderTextSplitter {
  constructor(private options: HTMLHeaderTextSplitterOptions) {}

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
    const tags = headersToSplitOn.map((h) => h[0]).join(',');
    const levelsMap = new Map(headersToSplitOn);
    const root = parse(html);
    const body = root.querySelector('body') || root;
    const sections: { level: string; header: string; content: string }[] = [];
    let current = { level: 'root', header: '', content: '' };
    for (const node of body.childNodes) {
      if (
        node instanceof HTMLElement &&
        tags.includes(node.tagName.toLowerCase())
      ) {
        if (current.header || current.content) sections.push(current);
        const lvl = levelsMap.get(node.tagName.toLowerCase()) || 'root';
        current = { level: lvl, header: node.textContent.trim(), content: '' };
      } else {
        const text = node.textContent.trim();
        if (text) current.content += text + '\n';
      }
    }
    if (current.header || current.content) sections.push(current);

    // combine header and content and apply chunking
    const results: string[] = [];
    for (const sec of sections) {
      const full =
        (sec.header ? `${sec.level}: ${sec.header}\n` : '') +
        sec.content.trim();
      const textChunks = this.chunkText(full);
      results.push(...textChunks);
    }
    return results;
  }
}

// adapter uses our custom splitter
@Injectable()
export class HTMLHeaderTextSplitterAdapter
  implements TextSplitterAdapter<'html-header', HTMLHeaderTextSplitterOptions>
{
  private defaultOptions: HTMLHeaderTextSplitterParams;
  constructor(private readonly logger: MyLogger) {
    this.defaultOptions = {
      headersToSplitOn: [
        ['h1', 'H1'],
        ['h2', 'H2'],
        ['h3', 'H3'],
      ],
      chunkSize: 800,
      chunkOverlap: 100,
    } as HTMLHeaderTextSplitterParams;
    this.logger.info(
      'HTMLHeaderTextSplitterAdapter initializing',
      HTMLHeaderTextSplitterAdapter.name,
    );
  }

  /**
   * Splits HTML by header tags, allowing custom tag levels and sizes.
   */
  async splitText(
    html: string,
    overrideOptions: Partial<HTMLHeaderTextSplitterParams> = {},
  ): Promise<string[]> {
    this.logger.info(
      `Splitting HTML using header splitter (HTML length: ${html.length})`,
      HTMLHeaderTextSplitterAdapter.name,
    );
    try {
      const opts: HTMLHeaderTextSplitterParams = {
        ...this.defaultOptions,
        ...(overrideOptions as HTMLHeaderTextSplitterParams),
      };
      this.logger.info(
        `HTML header splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, headers=${opts.headersToSplitOn.map((h) => h[0]).join(', ')}`,
        HTMLHeaderTextSplitterAdapter.name,
      );
      const splitter = new HTMLHeaderTextSplitter(opts);
      const result = await splitter.splitText(html);
      this.logger.info(
        `Successfully split HTML into ${result.length} chunks using header splitter`,
        HTMLHeaderTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error splitting HTML with header splitter: ${info.message}\n` +
          (info.stack || ''),
        HTMLHeaderTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }

  /*
   * Splits HTML by header tags, allowing custom tag levels and sizes.
   * Returns the text and line numbers for each chunk.
   */
  async splitTextWithPositions(
    html: string,
    overrideOptions: Partial<HTMLHeaderTextSplitterParams> = {},
  ): Promise<{ text: string; start: LineCharPos; end: LineCharPos }[]> {
    this.logger.info(
      `Splitting HTML with positions using header splitter (HTML length: ${html.length})`,
      HTMLHeaderTextSplitterAdapter.name,
    );
    try {
      const opts: HTMLHeaderTextSplitterParams = {
        ...this.defaultOptions,
        ...(overrideOptions as HTMLHeaderTextSplitterParams),
      };
      this.logger.info(
        `HTML header splitter options: chunkSize=${opts.chunkSize}, chunkOverlap=${opts.chunkOverlap}, headers=${opts.headersToSplitOn.map((h) => h[0]).join(', ')}`,
        HTMLHeaderTextSplitterAdapter.name,
      );
      const splitter = new HTMLHeaderTextSplitter(opts);
      const result = await splitWithPositions(
        html,
        splitter.splitText.bind(splitter),
      );
      this.logger.info(
        `Successfully split HTML with positions into ${result.length} chunks using header splitter`,
        HTMLHeaderTextSplitterAdapter.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error splitting HTML with positions using header splitter\n' +
          (info.stack || ''),
        HTMLHeaderTextSplitterAdapter.name,
      );
      throw new Error(info.message);
    }
  }
}
