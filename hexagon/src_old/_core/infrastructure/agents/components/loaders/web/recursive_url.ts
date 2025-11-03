import { RecursiveUrlLoader } from '@langchain/community/document_loaders/web/recursive_url';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * RecursiveUrlWebLoader - A service for recursively loading web pages from a root URL
 *
 * This class uses LangChain's RecursiveUrlLoader to crawl web pages starting from
 * a root URL and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class RecursiveUrlWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'RecursiveUrlWebLoader initializing',
      RecursiveUrlWebLoader.name,
    );
  }
  /**
   * Recursively load content from a root URL and its linked pages
   *
   * @param url - Root URL to start crawling from
   * @param options - Optional configuration for recursive URL loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing web content
   */
  async load(
    url: string,
    options: {
      excludePatterns?: string[];
      maxDepth?: number;
      timeout?: number;
      preventOutlinks?: boolean;
      extractor?: (html: string) => string;
      maxRequestsPerMinute?: number;
      headers?: Record<string, string>;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Starting recursive URL loading from: ${url} (maxDepth: ${options.maxDepth || 2})`,
      RecursiveUrlWebLoader.name,
    );
    try {
      // Create a RecursiveUrlLoader instance
      const loader = new RecursiveUrlLoader(url, {
        maxDepth: options.maxDepth !== undefined ? options.maxDepth : 2,
        timeout: options.timeout || 10000,
        extractor: options.extractor,
        callerOptions: {
          maxConcurrency: 5,
          maxRetries: 3,
          onFailedAttempt: (error) => {
            // console.error(`Failed attempt: ${error.message}`);
          },
        },
        excludeDirs: options.excludePatterns || [],
        preventOutside: options.preventOutlinks || false,
      });

      // Load the content recursively
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully completed recursive URL loading from ${url}, generated ${docs.length} documents`,
        RecursiveUrlWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error recursively loading content from URL\n' + (info.stack || ''),
        RecursiveUrlWebLoader.name,
      );
      throw new Error(
        `Error recursively loading content from URL: ${info.message}`,
      );
    }
  }
}
