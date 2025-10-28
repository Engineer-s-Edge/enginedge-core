import { NotionLoader } from '@langchain/community/document_loaders/fs/notion';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * NotionDocumentLoader - A service for loading and parsing Notion export files
 *
 * This class uses LangChain's NotionLoader to extract text from Notion export files
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class NotionDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'NotionDocumentLoader initializing',
      NotionDocumentLoader.name,
    );
  }
  /**
   * Load a Notion export file directly from a Blob object
   * Note: This expects a zip file containing Notion export data
   *
   * @param blob - Blob containing Notion export data (ZIP format)
   * @param options - Optional configuration for Notion loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      // Currently no specific options for Notion loader
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading Notion export blob (${blob.size} bytes)`,
      NotionDocumentLoader.name,
    );
    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create a temporary directory to extract the zip contents
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const { v4: uuidv4 } = require('uuid');

      const tempDir = path.join(os.tmpdir(), `notion-import-${uuidv4()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Write the zip file to the temp directory
      const zipPath = path.join(tempDir, 'notion-export.zip');
      fs.writeFileSync(zipPath, buffer);

      this.logger.info(
        `Created temporary Notion export directory: ${tempDir}`,
        NotionDocumentLoader.name,
      );

      // Extract the zip file
      const extract = require('extract-zip');
      await extract(zipPath, { dir: tempDir });

      this.logger.info(
        'Extracted Notion export files',
        NotionDocumentLoader.name,
      );

      // Use NotionLoader to load the extracted files
      const loader = new NotionLoader(tempDir);
      const docs = await loader.load();

      // Cleanup temporary files
      fs.rm(tempDir, { recursive: true, force: true }, (err: Error) => {
        if (err) {
          this.logger.error(
            `Error removing temporary directory: ${err.message}`,
            NotionDocumentLoader.name,
          );
        } else {
          this.logger.info(
            'Successfully cleaned up temporary Notion files',
            NotionDocumentLoader.name,
          );
        }
      });

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded Notion export, generated ${docs.length} documents`,
        NotionDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading Notion export from blob\n' + (info.stack || ''),
        NotionDocumentLoader.name,
      );
      throw new Error(`Error loading Notion export from blob: ${info.message}`);
    }
  }
}
