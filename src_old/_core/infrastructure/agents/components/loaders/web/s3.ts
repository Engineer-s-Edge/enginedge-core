import { S3Loader } from '@langchain/community/document_loaders/web/s3';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * S3WebLoader - A service for loading documents from AWS S3
 *
 * This class uses LangChain's S3Loader to fetch files from S3 buckets
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class S3WebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('S3WebLoader initializing', S3WebLoader.name);
  }
  /**
   * Load documents from an S3 bucket
   *
   * @param bucket - S3 bucket name
   * @param key - S3 object key
   * @param options - Optional configuration for S3 loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing content from S3
   */
  async load(
    bucket: string,
    key: string,
    options: {
      region?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
      unstructuredAPIURL?: string;
      unstructuredAPIKey?: string;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading S3 content from bucket: ${bucket}, key: ${key}`,
      S3WebLoader.name,
    );
    try {
      // Set up AWS credentials
      const credentials: {
        region?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
      } = {};

      if (options.region) credentials.region = options.region;
      if (options.accessKeyId) credentials.accessKeyId = options.accessKeyId;
      if (options.secretAccessKey)
        credentials.secretAccessKey = options.secretAccessKey;
      if (options.sessionToken) credentials.sessionToken = options.sessionToken;

      // Create an S3Loader instance
      const loader = new S3Loader({
        bucket,
        key,
        ...credentials,
        unstructuredAPIURL: options.unstructuredAPIURL!,
        unstructuredAPIKey: options.unstructuredAPIKey!,
      });

      // Load the content from S3
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded S3 content from ${bucket}/${key}, generated ${docs.length} documents`,
        S3WebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading content from S3\n' + (info.stack || ''),
        S3WebLoader.name,
      );
      throw new Error(`Error loading content from S3: ${info.message}`);
    }
  }
}
