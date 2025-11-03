import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parse } from 'node-html-parser';
import * as sanitizeHtml from 'sanitize-html';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * CurlWebLoader - A service for loading web content using HTTP requests
 *
 * This class extends LangChain's web loader functionality with more
 * customizable request options, similar to what curl provides.
 * It fetches web pages and converts them into Document objects.
 */
@Injectable()
export class CurlWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('CurlWebLoader initializing', CurlWebLoader.name);
  }
  // Supported content types for processing
  private supportedContentTypes = {
    html: ['text/html', 'application/xhtml+xml'],
    json: ['application/json'],
    text: ['text/plain'],
    xml: ['application/xml', 'text/xml'],
  };

  /**
   * Load content from a URL with customizable request options
   *
   * @param url - URL to fetch
   * @param options - Request options similar to curl parameters
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing the web content
   */
  async load(
    url: string,
    options: {
      headers?: Record<string, string>;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
      timeout?: number;
      data?: any;
      followRedirects?: boolean;
      removeSelectors?: string[];
      includeSelectors?: string[];
      extractMetadata?: boolean;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading web content from URL: ${url}`,
      CurlWebLoader.name,
    );
    try {
      const {
        headers = {},
        method = 'GET',
        timeout = 10000,
        data = undefined,
        followRedirects = true,
        removeSelectors = [],
        includeSelectors = [],
        extractMetadata = true,
      } = options;

      // Set up axios request config
      const axiosConfig = {
        method,
        url,
        timeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...headers,
        },
        maxRedirects: followRedirects ? 5 : 0,
        validateStatus: (status: number) => status < 500,
        data: data,
      }; // Make the request
      const response = await axios(axiosConfig);

      // Return empty array if response is not successful
      if (response.status >= 400) {
        this.logger.warn(
          `Failed to load ${url}, status code: ${response.status}`,
          CurlWebLoader.name,
        );
        return [];
      }

      // Get the content and content type
      const content = response.data;
      const contentType = response.headers['content-type'] || '';
      const contentTypeBase = contentType.split(';')[0].toLowerCase().trim();

      // Process content based on its type
      let processedContent = '';

      this.logger.info(
        `Processing content type: ${contentTypeBase}`,
        CurlWebLoader.name,
      );

      if (
        this.isContentType(contentTypeBase, this.supportedContentTypes.html)
      ) {
        // Process HTML content
        this.logger.info('Processing as HTML content', CurlWebLoader.name);
        processedContent = this.processHtml(
          content,
          url,
          removeSelectors,
          includeSelectors,
        );
      } else if (
        this.isContentType(contentTypeBase, this.supportedContentTypes.json)
      ) {
        // Process JSON content
        this.logger.info('Processing as JSON content', CurlWebLoader.name);
        processedContent = this.processJson(content);
      } else if (
        this.isContentType(contentTypeBase, this.supportedContentTypes.xml)
      ) {
        // Process XML content
        this.logger.info('Processing as XML content', CurlWebLoader.name);
        processedContent = this.processXml(content);
      } else if (
        this.isContentType(contentTypeBase, this.supportedContentTypes.text)
      ) {
        // Process plain text
        this.logger.info(
          'Processing as plain text content',
          CurlWebLoader.name,
        );
        processedContent =
          typeof content === 'string' ? content : JSON.stringify(content);
      } else {
        // Default processing for unsupported content types
        this.logger.info(
          'Processing as default content type',
          CurlWebLoader.name,
        );
        processedContent =
          typeof content === 'string' ? content : JSON.stringify(content);
      }

      // Extract metadata if requested
      const pageMetadata = extractMetadata
        ? this.isContentType(contentTypeBase, this.supportedContentTypes.html)
          ? this.extractMetadata(content, url)
          : {}
        : {};

      // Create a document with the processed content
      const doc = new Document({
        pageContent: processedContent,
        metadata: {
          source: url,
          statusCode: response.status,
          contentType: response.headers['content-type'],
          ...pageMetadata,
          ...metadata,
        },
      });

      this.logger.info(
        `Successfully loaded web content from ${url} (${processedContent.length} characters)`,
        CurlWebLoader.name,
      );
      return [doc];
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(`Error loading ${url}`, CurlWebLoader.name, info.stack);
      return [];
    }
  }

  /**
   * Load content from multiple URLs in parallel
   *
   * @param urls - Array of URLs to fetch
   * @param options - Request options similar to curl parameters
   * @param metadata - Optional metadata to include with all documents
   * @returns Promise<Document[]> - Array of Document objects
   */
  async loadBatch(
    urls: string[],
    options: {
      headers?: Record<string, string>;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
      timeout?: number;
      concurrency?: number;
      removeSelectors?: string[];
      includeSelectors?: string[];
      extractMetadata?: boolean;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    const { concurrency = 5, ...requestOptions } = options;

    this.logger.info(
      `Starting batch load for ${urls.length} URLs with concurrency ${concurrency}`,
      CurlWebLoader.name,
    );

    // Process URLs in batches to control concurrency
    const documents: Document[] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      this.logger.info(
        `Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(urls.length / concurrency)} (${batch.length} URLs)`,
        CurlWebLoader.name,
      );

      const batchPromises = batch.map(
        (url) => this.load(url, requestOptions, metadata).catch(() => []), // Catch errors for individual URLs
      );

      const batchResults = await Promise.all(batchPromises);
      documents.push(...batchResults.flat());
    }

    this.logger.info(
      `Batch load completed, loaded ${documents.length} documents from ${urls.length} URLs`,
      CurlWebLoader.name,
    );
    return documents;
  }

  /**
   * Process HTML content by applying selectors and cleaning
   *
   * @param html - Raw HTML content
   * @param url - Source URL
   * @param removeSelectors - CSS selectors to remove
   * @param includeSelectors - CSS selectors to include (if empty, include everything)
   * @returns string - Processed text content
   */ private processHtml(
    html: string,
    url: string,
    removeSelectors: string[] = [],
    includeSelectors: string[] = [],
  ): string {
    try {
      // Define sanitize options
      const sanitizeOptions = {
        allowedTags: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'a',
          'ul',
          'ol',
          'li',
          'b',
          'i',
          'strong',
          'em',
          'strike',
          'code',
          'hr',
          'br',
          'div',
          'table',
          'thead',
          'caption',
          'tbody',
          'tr',
          'th',
          'td',
          'pre',
          'img',
        ],
        allowedAttributes: {
          a: ['href', 'name', 'target', 'title'],
          img: ['src', 'alt', 'title', 'width', 'height'],
          '*': ['class', 'id', 'title'],
        },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      };

      // First sanitize HTML to remove potentially harmful content
      const sanitizedHtml = sanitizeHtml(html, sanitizeOptions);

      // Parse the sanitized HTML
      const $ = cheerio.load(sanitizedHtml);

      // Remove unwanted elements
      removeSelectors.forEach((selector) => {
        $(selector).remove();
      });

      // Remove script and style tags
      $('script, style, meta, link, noscript').remove();

      // If includeSelectors is provided, keep only those elements
      if (includeSelectors.length > 0) {
        // Create a temporary div to hold matched content
        const tempDiv = $('<div></div>');

        // Add all matched elements to the temp div
        includeSelectors.forEach((selector) => {
          $(selector).each((_, elem) => {
            tempDiv.append($(elem).clone());
          });
        });

        // Replace the body with just the matched elements
        $('body').html(tempDiv.html() || '');
      }

      // Get the text and clean it
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      return text;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.warn(
        `Error processing HTML from ${url}: ${info.message}`,
        CurlWebLoader.name,
      );
      return html; // Return raw HTML if processing fails
    }
  }

  /**
   * Extract metadata from HTML content
   *
   * @param html - Raw HTML content
   * @param url - Source URL
   * @returns Record<string, any> - Extracted metadata
   */
  private extractMetadata(html: string, url: string): Record<string, any> {
    try {
      const $ = cheerio.load(html);
      const metadata: Record<string, any> = {};

      // Extract title
      metadata.title = $('title').text().trim();

      // Extract meta description
      metadata.description =
        $('meta[name="description"]').attr('content') || '';

      // Extract meta keywords
      metadata.keywords = $('meta[name="keywords"]').attr('content') || '';

      // Extract OpenGraph metadata
      metadata.ogTitle = $('meta[property="og:title"]').attr('content') || '';
      metadata.ogDescription =
        $('meta[property="og:description"]').attr('content') || '';
      metadata.ogImage = $('meta[property="og:image"]').attr('content') || '';

      // Parse URL for domain info
      try {
        const urlObj = new URL(url);
        metadata.domain = urlObj.hostname;
        metadata.path = urlObj.pathname;
      } catch (e) {
        // Ignore URL parsing errors
      }

      return metadata;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.warn(
        `Error extracting metadata from ${url}: ${info.message}`,
        CurlWebLoader.name,
      );
      return {};
    }
  }

  /**
   * Fetch raw HTML content from a URL
   *
   * @param url - URL to fetch
   * @param options - Request options
   * @returns Promise<string> - Raw HTML content
   */
  async fetchRawHtml(
    url: string,
    options: {
      headers?: Record<string, string>;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
      timeout?: number;
      data?: any;
    } = {},
  ): Promise<string> {
    try {
      const {
        headers = {},
        method = 'GET',
        timeout = 10000,
        data = undefined,
      } = options;

      const response = await axios({
        method,
        url,
        timeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...headers,
        },
        data,
      });

      return response.data;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error fetching raw HTML from ${url}`,
        CurlWebLoader.name,
        info.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a content type matches one of the supported types
   *
   * @param contentType - Content type to check
   * @param supportedTypes - Array of supported content types to match against
   * @returns boolean - True if the content type is supported
   */
  private isContentType(
    contentType: string,
    supportedTypes: string[],
  ): boolean {
    return supportedTypes.some((type) => contentType.includes(type));
  }

  /**
   * Process JSON content into a readable format
   *
   * @param jsonData - JSON data to process
   * @returns string - Readable string representation of the JSON
   */
  private processJson(jsonData: any): string {
    try {
      // Ensure we're working with a parsed object
      const data =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      // Convert to a formatted string
      return JSON.stringify(data, null, 2);
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.warn(
        `Error processing JSON: ${info.message}`,
        CurlWebLoader.name,
      );
      return typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
    }
  }

  /**
   * Process XML content into a readable format
   *
   * @param xmlData - XML data to process
   * @returns string - Extracted text from the XML
   */
  private processXml(xmlData: string): string {
    try {
      // Parse XML using cheerio
      const $ = cheerio.load(xmlData, {
        xmlMode: true,
      });

      // Remove processing instructions and comments
      $('*')
        .contents()
        .each((_, elem) => {
          const t = (elem as any).type;
          if (t === 'comment' || t === 'directive') {
            $(elem).remove();
          }
        });

      // Get text and clean it up
      return $('*').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.warn(
        `Error processing XML: ${info.message}`,
        CurlWebLoader.name,
      );
      return xmlData;
    }
  }
}
