import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * DOCXDocumentLoader - A service for loading and parsing DOCX files
 *
 * This class uses LangChain's DocxLoader to extract text from DOCX files and
 * convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class DOCXDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'DOCXDocumentLoader initializing',
      DOCXDocumentLoader.name,
    );
  }
  /**
   * Load a DOCX file directly from a Blob object
   *
   * @param blob - Blob containing DOCX data
   * @param options - Optional configuration for DOCX loading
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
      `Loading DOCX blob (${blob.size} bytes, splitPages: ${options.splitPages})`,
      DOCXDocumentLoader.name,
    );
    try {
      // Create a DocxLoader instance directly with the blob
      const loader = new DocxLoader(blob);

      // Load and parse the DOCX
      let docs = await loader.load();

      // Handle page splitting
      if (!options.splitPages && docs.length > 1) {
        this.logger.info(
          `Combining ${docs.length} pages into single document`,
          DOCXDocumentLoader.name,
        );
        // Combine all pages into a single document if splitPages is false
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
        `Successfully loaded DOCX, generated ${docs.length} documents`,
        DOCXDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading DOCX from blob\n' + (info.stack || ''),
        DOCXDocumentLoader.name,
      );
      throw new Error(`Error loading DOCX from blob: ${info.message}`);
    }
  }
}
