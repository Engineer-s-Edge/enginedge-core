import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { SelectorType } from 'cheerio/dist/commonjs/types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * CheerioWebLoader - A service for loading and parsing web content using Cheerio
 *
 * This class uses LangChain's CheerioWebBaseLoader to extract content from web pages
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class CheerioWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('CheerioWebLoader initializing', CheerioWebLoader.name);
  }
  /**
   * Load content from a URL using Cheerio
   *
   * @param url - URL to fetch
   * @param options - Optional configuration for Cheerio loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing web content
   */
  async load(
    url: string,
    options: {
      selector?: string;
      textDecoder?: TextDecoder;
      headers?: Record<string, string>;
      timeout?: number;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading web content with Cheerio from URL: ${url}`,
      CheerioWebLoader.name,
    );
    try {
      // Create a CheerioWebBaseLoader instance
      const loader = new CheerioWebBaseLoader(url, {
        selector: options.selector as SelectorType,
        textDecoder: options.textDecoder,
        headers: options.headers || {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: options.timeout || 10000,
      });

      // Load the web content
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded web content with Cheerio from ${url}, generated ${docs.length} documents`,
        CheerioWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading web content with Cheerio',
        CheerioWebLoader.name,
        info.stack,
      );
      throw new Error(
        `Error loading web content with Cheerio: ${info.message}`,
      );
    }
  }
}
