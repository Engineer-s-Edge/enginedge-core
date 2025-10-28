import { SRTLoader } from '@langchain/community/document_loaders/fs/srt';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * SRTDocumentLoader - A service for loading and parsing SRT subtitle files
 *
 * This class uses LangChain's SRTLoader to extract text from SRT subtitle files
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class SRTDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('SRTDocumentLoader initializing', SRTDocumentLoader.name);
  }
  /**
   * Load an SRT subtitle file directly from a Blob object
   *
   * @param blob - Blob containing SRT data
   * @param options - Optional configuration for SRT loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      shouldParseInformation?: boolean;
    } = { shouldParseInformation: true },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading SRT blob (${blob.size} bytes, parseInfo: ${options.shouldParseInformation})`,
      SRTDocumentLoader.name,
    );
    try {
      // Create an SRTLoader instance
      const loader = new SRTLoader(blob);

      // Load and parse the SRT content
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded SRT, generated ${docs.length} documents`,
        SRTDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading SRT from blob\n' + (info.stack || ''),
        SRTDocumentLoader.name,
      );
      throw new Error(`Error loading SRT from blob: ${info.message}`);
    }
  }
}
