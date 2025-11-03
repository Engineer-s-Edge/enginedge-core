import { SitemapLoader } from '@langchain/community/document_loaders/web/sitemap';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * SitemapWebLoader - A service for loading web pages from a sitemap
 *
 * This class uses LangChain's SitemapLoader to extract URLs from a sitemap
 * and load their content into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class SitemapWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('SitemapWebLoader initializing', SitemapWebLoader.name);
  }
  /**
   * Load content from a sitemap
   *
   * @param url - URL of the sitemap
   * @param options - Optional configuration for sitemap loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing web content
   */
  async load(
    url: string,
    options: {
      filterUrls?: string[];
      excludeUrls?: string[];
      parallelRequests?: number;
      timeout?: number;
      headers?: Record<string, string>;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading content from sitemap: ${url}`,
      SitemapWebLoader.name,
    );
    try {
      // Create a SitemapLoader instance
      const loader = new SitemapLoader(url, {
        filterUrls: options.filterUrls,
        chunkSize: 1,
        maxConcurrency: options.parallelRequests || 5,
        maxRetries: 3,
        onFailedAttempt: (error) => {
          // console.error(`Failed attempt: ${error.message}`);
        },
        timeout: options.timeout || 10000,
        headers: options.headers || {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      // Load the content from the sitemap
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded content from sitemap ${url}, generated ${docs.length} documents`,
        SitemapWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading content from sitemap',
        SitemapWebLoader.name,
        info.stack,
      );
      throw new Error(`Error loading content from sitemap: ${info.message}`);
    }
  }
}
