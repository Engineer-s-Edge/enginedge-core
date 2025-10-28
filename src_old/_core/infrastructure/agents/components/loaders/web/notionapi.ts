import { NotionAPILoader } from '@langchain/community/document_loaders/web/notionapi';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * NotionAPIWebLoader - A service for loading content from Notion via API
 *
 * This class uses LangChain's NotionAPILoader to extract content from Notion
 * via the official API and convert it into Document objects.
 */
@Injectable()
export class NotionAPIWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'NotionAPIWebLoader initializing',
      NotionAPIWebLoader.name,
    );
  }
  /**
   * Load content from Notion via the API
   *
   * @param options - Configuration for Notion API loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing Notion content
   */
  async load(
    options: {
      integrationToken?: string;
      pageId?: string;
      databaseId?: string;
      notionApiVersion?: string;
    },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading Notion content (type: ${options.pageId ? 'page' : 'database'}, id: ${options.pageId || options.databaseId})`,
      NotionAPIWebLoader.name,
    );
    try {
      const integrationToken =
        options.integrationToken || process.env.NOTION_INTEGRATION_TOKEN;

      if (!integrationToken) {
        throw new Error(
          'Notion integration token is required. Provide it in options or set NOTION_INTEGRATION_TOKEN environment variable.',
        );
      }

      if (!options.pageId && !options.databaseId) {
        throw new Error('Either pageId or databaseId must be provided.');
      }

      // Create loader options
      const loaderOptions: {
        clientOptions: {
          auth: string;
          notionVersion?: string;
        };
        id: string;
        type?: 'page' | 'database';
      } = {
        clientOptions: {
          auth: integrationToken,
        },
        id: options.pageId || options.databaseId || '',
        type: options.pageId ? 'page' : 'database',
      };

      // Add API version if provided
      if (options.notionApiVersion) {
        loaderOptions.clientOptions.notionVersion = options.notionApiVersion;
      }

      // Create a NotionAPILoader instance
      const loader = new NotionAPILoader(loaderOptions);

      // Load the content from Notion
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded Notion content, generated ${docs.length} documents`,
        NotionAPIWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading content from Notion API\n' + (info.stack || ''),
        NotionAPIWebLoader.name,
      );
      throw new Error(`Error loading content from Notion API: ${info.message}`);
    }
  }
}
