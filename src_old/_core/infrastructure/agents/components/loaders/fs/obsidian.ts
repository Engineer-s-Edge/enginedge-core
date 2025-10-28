import { ObsidianLoader } from '@langchain/community/document_loaders/fs/obsidian';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * ObsidianDocumentLoader - A service for loading and parsing Obsidian vault files
 *
 * This class uses LangChain's ObsidianLoader to extract text from Obsidian vault
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class ObsidianDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'ObsidianDocumentLoader initializing',
      ObsidianDocumentLoader.name,
    );
  }
  /**
   * Load an Obsidian vault directly from a Blob object
   * Note: This expects a zip file containing an Obsidian vault
   *
   * @param blob - Blob containing Obsidian vault data (ZIP format)
   * @param options - Optional configuration for Obsidian loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      // Currently no specific options for Obsidian loader
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading Obsidian vault blob (${blob.size} bytes)`,
      ObsidianDocumentLoader.name,
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

      const tempDir = path.join(os.tmpdir(), `obsidian-import-${uuidv4()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Write the zip file to the temp directory
      const zipPath = path.join(tempDir, 'obsidian-vault.zip');
      fs.writeFileSync(zipPath, buffer);

      this.logger.info(
        `Created temporary Obsidian vault directory: ${tempDir}`,
        ObsidianDocumentLoader.name,
      );

      // Extract the zip file
      const extract = require('extract-zip');
      await extract(zipPath, { dir: tempDir });

      this.logger.info(
        'Extracted Obsidian vault files',
        ObsidianDocumentLoader.name,
      );

      // Use ObsidianLoader to load the extracted files
      const loader = new ObsidianLoader(tempDir);
      const docs = await loader.load();

      // Cleanup temporary files
      fs.rm(tempDir, { recursive: true, force: true }, (err: Error) => {
        if (err) {
          this.logger.error(
            `Error removing temporary directory: ${err.message}`,
            ObsidianDocumentLoader.name,
          );
        } else {
          this.logger.info(
            'Successfully cleaned up temporary Obsidian files',
            ObsidianDocumentLoader.name,
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
        `Successfully loaded Obsidian vault, generated ${docs.length} documents`,
        ObsidianDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading Obsidian vault from blob\n' + (info.stack || ''),
        ObsidianDocumentLoader.name,
      );
      throw new Error(
        `Error loading Obsidian vault from blob: ${info.message}`,
      );
    }
  }
}
