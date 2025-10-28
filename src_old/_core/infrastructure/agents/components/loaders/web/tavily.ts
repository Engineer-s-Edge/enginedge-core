import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * TavilySearchLoader - A service for loading search results from Tavily AI search API
 *
 * This class implements a custom loader for the Tavily AI search API, which provides
 * high-quality search results with content extraction.
 */
@Injectable()
export class TavilySearchLoader {
  private apiBase = 'https://api.tavily.com/search';

  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'TavilySearchLoader initializing',
      TavilySearchLoader.name,
    );
  }

  /**
   * Load search results from Tavily search API
   *
   * @param query - Search query to execute
   * @param options - Optional configuration for Tavily API
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing search results
   */
  async load(
    query: string,
    options: {
      apiKey?: string;
      maxResults?: number;
      searchDepth?: 'basic' | 'advanced';
      includeRawContent?: boolean;
      includeImages?: boolean;
      filterDomains?: string[];
      excludeDomains?: string[];
      safeSearch?: boolean;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading search results from Tavily for query: ${query}`,
      TavilySearchLoader.name,
    );
    try {
      const apiKey = options.apiKey || process.env.TAVILY_API_KEY;

      if (!apiKey) {
        throw new Error(
          'Tavily API key is required. Provide it in options or set TAVILY_API_KEY environment variable.',
        );
      }

      // Prepare Tavily API request parameters
      const params: {
        query: string;
        max_results: number;
        search_depth: 'basic' | 'advanced';
        include_answer: boolean;
        include_raw_content: boolean;
        include_images: boolean;
        [key: string]: any;
      } = {
        query: query,
        max_results: options.maxResults || 10,
        search_depth: options.searchDepth || 'advanced',
        include_answer: false,
        include_raw_content:
          options.includeRawContent !== undefined
            ? options.includeRawContent
            : true,
        include_images: options.includeImages || false,
      };

      // Add optional parameters if provided
      if (options.filterDomains && options.filterDomains.length > 0) {
        params['filter_domains'] = options.filterDomains;
      }

      if (options.excludeDomains && options.excludeDomains.length > 0) {
        params['exclude_domains'] = options.excludeDomains;
      }

      if (options.safeSearch !== undefined) {
        params['safe_search'] = options.safeSearch;
      }

      // Call Tavily API
      const response = await axios.post(this.apiBase, params, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
      });

      // Check if the request was successful
      if (response.status !== 200) {
        throw new Error(`Tavily API returned status code ${response.status}`);
      }

      const searchResults = response.data.results || [];

      // Transform API response into Document objects
      const docs: Document[] = searchResults.map(
        (
          result: {
            raw_content: any;
            title: any;
            url: any;
            content: any;
            score: any;
          },
          index: number,
        ) => {
          const content =
            options.includeRawContent && result.raw_content
              ? `Title: ${result.title}\nURL: ${result.url}\n\nContent:\n${result.raw_content}`
              : `Title: ${result.title}\nURL: ${result.url}\n\nContent:\n${result.content}`;

          return new Document({
            pageContent: content,
            metadata: {
              ...metadata,
              source: result.url,
              title: result.title,
              score: result.score,
              rank: index + 1,
              searchQuery: query,
              searchTime: new Date().toISOString(),
            },
          });
        },
      );

      this.logger.info(
        `Successfully loaded search results from Tavily for query: ${query}, generated ${docs.length} documents`,
        TavilySearchLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading search results from Tavily\n' + (info.stack || ''),
        TavilySearchLoader.name,
      );
      throw new Error(
        `Error loading search results from Tavily: ${info.message}`,
      );
    }
  }
}
