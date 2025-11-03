import { UnstructuredLoader } from '@langchain/community/document_loaders/fs/unstructured';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * UnstructuredDocumentLoader - A service for loading and parsing files using the Unstructured API
 *
 * This class uses LangChain's UnstructuredLoader to extract text from various file formats
 * through the Unstructured.io API and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class UnstructuredDocumentLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'UnstructuredDocumentLoader initializing',
      UnstructuredDocumentLoader.name,
    );
  }
  /**
   * Load a file directly from a Blob object using the Unstructured API
   *
   * @param blob - Blob containing file data
   * @param options - Configuration for Unstructured API
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      apiKey?: string;
      apiUrl?: string;
      strategy?: string;
      encoding?: string;
      ocrLanguages?: string[];
      coordinates?: boolean;
      pdfInferTableStructure?: boolean;
      xmlKeepTags?: boolean;
    },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading file with Unstructured API (${blob.size} bytes, type: ${blob.type})`,
      UnstructuredDocumentLoader.name,
    );
    try {
      // Convert blob to ArrayBuffer and then to Buffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create a temporary file
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const { v4: uuidv4 } = require('uuid');

      const tempDir = path.join(os.tmpdir(), `unstructured-import-${uuidv4()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Determine file extension from mime type if available
      const mimeTypeToExtension: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          '.docx',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation':
          '.pptx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'text/plain': '.txt',
        'text/html': '.html',
        'application/json': '.json',
        'application/xml': '.xml',
        'text/xml': '.xml',
        'image/jpeg': '.jpg',
        'image/png': '.png',
      };

      let fileExtension = '.bin'; // Default
      if (blob.type && mimeTypeToExtension[blob.type]) {
        fileExtension = mimeTypeToExtension[blob.type];
      }

      const tempFilePath = path.join(tempDir, `file${fileExtension}`);
      fs.writeFileSync(tempFilePath, buffer);

      this.logger.info(
        `Created temporary file: ${tempFilePath}`,
        UnstructuredDocumentLoader.name,
      );

      // Configure the Unstructured loader
      const unstructuredOptions: any = {
        apiKey: options.apiKey || process.env.UNSTRUCTURED_API_KEY,
        apiUrl:
          options.apiUrl || 'https://api.unstructured.io/general/v0/general',
      };

      // Add optional parameters if provided
      if (options.strategy) unstructuredOptions.strategy = options.strategy;
      if (options.encoding) unstructuredOptions.encoding = options.encoding;
      if (options.ocrLanguages)
        unstructuredOptions.ocrLanguages = options.ocrLanguages;
      if (options.coordinates !== undefined)
        unstructuredOptions.coordinates = options.coordinates;
      if (options.pdfInferTableStructure !== undefined)
        unstructuredOptions.pdfInferTableStructure =
          options.pdfInferTableStructure;
      if (options.xmlKeepTags !== undefined)
        unstructuredOptions.xmlKeepTags = options.xmlKeepTags;

      this.logger.info(
        `Processing file with Unstructured API: ${unstructuredOptions.apiUrl}`,
        UnstructuredDocumentLoader.name,
      );

      // Process the file with Unstructured
      const loader = new UnstructuredLoader(tempFilePath, unstructuredOptions);
      const docs = await loader.load();

      // Cleanup temporary files
      fs.rm(tempDir, { recursive: true, force: true }, (err: Error) => {
        if (err) {
          this.logger.error(
            `Error removing temporary file: ${err.message}`,
            UnstructuredDocumentLoader.name,
          );
        } else {
          this.logger.info(
            'Successfully cleaned up temporary Unstructured files',
            UnstructuredDocumentLoader.name,
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
        `Successfully processed file with Unstructured API, generated ${docs.length} documents`,
        UnstructuredDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error processing file with Unstructured API\n' + (info.stack || ''),
        UnstructuredDocumentLoader.name,
      );
      throw new Error(
        `Error processing file with Unstructured API: ${info.message}`,
      );
    }
  }
}
