import { getErrorInfo } from '@common/error-assertions';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * EPUBDocumentLoader - A service for loading and parsing EPUB files
 *
 * This class uses LangChain's EPubLoader to extract text from EPUB files and
 * convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class EPUBDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'EPUBDocumentLoader initializing',
      EPUBDocumentLoader.name,
    );
  }
  /**
   * Load an EPUB file directly from a Blob object
   *
   * @param blob - Blob containing EPUB data
   * @param options - Optional configuration for EPUB loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */ async loadBlob(
    blob: Blob,
    options: {
      splitChapters?: boolean;
    } = { splitChapters: true },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading EPUB blob (${blob.size} bytes, splitChapters: ${options.splitChapters})`,
      EPUBDocumentLoader.name,
    );
    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create a temporary directory for the EPUB file
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const { v4: uuidv4 } = require('uuid');

      const tempDir = path.join(os.tmpdir(), `epub-import-${uuidv4()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Write the file to the temp directory
      const tempFilePath = path.join(tempDir, 'document.epub');
      fs.writeFileSync(tempFilePath, buffer);

      this.logger.info(
        `Created temporary EPUB file: ${tempFilePath}`,
        EPUBDocumentLoader.name,
      );

      // Create an EPubLoader instance with the file path
      const loader = new EPubLoader(tempFilePath, {
        splitChapters: options.splitChapters,
      });

      // Load and parse the EPUB
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      // Cleanup temporary files
      fs.rm(tempDir, { recursive: true, force: true }, (err: Error) => {
        if (err) {
          this.logger.error(
            `Error removing temporary EPUB file: ${err.message}`,
            EPUBDocumentLoader.name,
          );
        } else {
          this.logger.info(
            'Successfully cleaned up temporary EPUB files',
            EPUBDocumentLoader.name,
          );
        }
      });

      this.logger.info(
        `Successfully loaded EPUB, generated ${docs.length} documents`,
        EPUBDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading EPUB from blob\n' + (info.stack || ''),
        EPUBDocumentLoader.name,
      );
      throw new Error(`Error loading EPUB from blob: ${info.message}`);
    }
  }
}
