import { SerpAPILoader } from '@langchain/community/document_loaders/web/serpapi';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * SerpAPIWebLoader - A service for fetching search results using SerpAPI
 *
 * This class uses LangChain's SerpAPILoader to fetch search results
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class SerpAPIWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('SerpAPIWebLoader initializing', SerpAPIWebLoader.name);
  }
  /**
   * Load search results from SerpAPI
   *
   * @param query - Search query to execute
   * @param options - Optional configuration for SerpAPI
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing search results
   */
  async load(
    query: string,
    options: {
      apiKey?: string;
      params?: Record<string, any>;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading search results from SerpAPI for query: ${query}`,
      SerpAPIWebLoader.name,
    );
    try {
      const apiKey = options.apiKey || process.env.SERPAPI_API_KEY;

      if (!apiKey) {
        throw new Error(
          'SerpAPI API key is required. Provide it in options or set SERPAPI_API_KEY environment variable.',
        );
      }

      // Prepare SerpAPI parameters
      const params = {
        q: query,
        ...options.params,
      };

      // Create a SerpAPILoader instance
      const loader = new SerpAPILoader({
        apiKey,
        q: query,
      });

      // Load search results
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded search results from SerpAPI for query: ${query}, generated ${docs.length} documents`,
        SerpAPIWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading search results from SerpAPI\n' + (info.stack || ''),
        SerpAPIWebLoader.name,
      );
      throw new Error(
        `Error loading search results from SerpAPI: ${info.message}`,
      );
    }
  }
}
