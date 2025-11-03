import { HTMLWebBaseLoader } from '@langchain/community/document_loaders/web/html';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * HTMLWebLoader - A service for parsing HTML content
 *
 * This class uses LangChain's HtmlLoader to parse HTML content
 * and convert it into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class HTMLWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('HTMLWebLoader initializing', HTMLWebLoader.name);
  }
  /**
   * Load and parse HTML content
   *
   * @param html - Raw HTML content as string
   * @param options - Optional configuration for HTML loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing HTML content
   */
  async load(
    html: string,
    options: {
      selector?: string;
      baseUrl?: string;
      textDecoder?: TextDecoder;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading HTML content (${html.length} characters)`,
      HTMLWebLoader.name,
    );
    try {
      // Set default metadata with source and content type
      const defaultMetadata: Record<string, any> = {
        source: 'html-content',
        contentType: 'text/html',
      };

      // Add base URL to metadata if provided
      if (options.baseUrl) {
        defaultMetadata.source = options.baseUrl;
      }

      // Create a HtmlLoader instance
      const loader = new HTMLWebBaseLoader(html, {
        selector: options.selector,
        textDecoder: options.textDecoder,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        maxConcurrency: 5,
        maxRetries: 3,
        onFailedAttempt: (_error) => {
          // console.error(`Failed attempt: ${error.message}`);
        },
        timeout: 10000,
      });

      // Load and parse the HTML
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded HTML content, generated ${docs.length} documents`,
        HTMLWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading HTML content',
        HTMLWebLoader.name,
        info.stack,
      );
      throw new Error(`Error loading HTML content: ${info.message}`);
    }
  }
}
