import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * PPTXDocumentLoader - A service for loading and parsing PowerPoint files
 *
 * This class uses LangChain's PPTXLoader to extract text from PowerPoint files
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class PPTXDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'PPTXDocumentLoader initializing',
      PPTXDocumentLoader.name,
    );
  }
  /**
   * Load a PowerPoint file directly from a Blob object
   *
   * @param blob - Blob containing PPTX data
   * @param options - Optional configuration for PPTX loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      splitPages?: boolean;
    } = { splitPages: true },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading PPTX blob (${blob.size} bytes, splitPages: ${options.splitPages})`,
      PPTXDocumentLoader.name,
    );
    try {
      // Create a PPTXLoader instance directly with the blob
      const loader = new PPTXLoader(blob);

      // Load and parse the PPTX
      let docs = await loader.load();

      // Handle page splitting
      if (!options.splitPages && docs.length > 1) {
        this.logger.info(
          `Combining ${docs.length} slides into single document`,
          PPTXDocumentLoader.name,
        );
        // Combine all slides into a single document if splitPages is false
        const combinedText = docs.map((doc) => doc.pageContent).join('\n\n');
        const combinedMetadata = { ...docs[0].metadata };

        docs = [
          new Document({
            pageContent: combinedText,
            metadata: combinedMetadata,
          }),
        ];
      }

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded PPTX, generated ${docs.length} documents`,
        PPTXDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading PowerPoint from blob\n' + (info.stack || ''),
        PPTXDocumentLoader.name,
      );
      throw new Error(`Error loading PowerPoint from blob: ${info.message}`);
    }
  }
}
