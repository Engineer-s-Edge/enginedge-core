import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { getErrorInfo } from '@common/error-assertions';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * CSVDocumentLoader - A service for loading and parsing CSV files
 *
 * This class uses LangChain's CSVLoader to extract data from CSV files and
 * convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class CSVDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('CSVDocumentLoader initializing', CSVDocumentLoader.name);
  }
  /**
   * Load a CSV file directly from a Blob object
   *
   * @param blob - Blob containing CSV data
   * @param options - Optional configuration for CSV loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      column?: string;
      seperator?: string;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading CSV blob (${blob.size} bytes)`,
      CSVDocumentLoader.name,
    );
    try {
      // Create a CSVLoader instance directly with the blob
      const loader = new CSVLoader(blob, options);

      // Load and parse the CSV
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded CSV, generated ${docs.length} documents`,
        CSVDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading CSV from blob\n' + (info.stack || ''),
        CSVDocumentLoader.name,
      );
      throw new Error(`Error loading CSV from blob: ${info.message}`);
    }
  }
}
