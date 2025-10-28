import { Injectable } from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { DataLakeConfig, StorageObject, FilterCriteria } from '../types';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

@Injectable()
export class S3StorageService {
  private s3Client!: S3Client;

  constructor(
    private readonly logger: MyLogger,
    config?: DataLakeConfig,
  ) {
    this.initialize(config);
  }

  private initialize(config?: DataLakeConfig) {
    const defaultConfig: DataLakeConfig = {
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      region: 'us-east-1',
      forcePathStyle: true,
    };

    const finalConfig = { ...defaultConfig, ...config };

    this.s3Client = new S3Client({
      endpoint: finalConfig.endpoint,
      credentials: {
        accessKeyId: finalConfig.accessKeyId,
        secretAccessKey: finalConfig.secretAccessKey,
      },
      forcePathStyle: finalConfig.forcePathStyle,
      region: finalConfig.region,
    });

    this.logger.info(
      `S3 Storage Service initialized with endpoint: ${finalConfig.endpoint}`,
      S3StorageService.name,
    );
  }

  /**
   * List objects in a bucket with optional filtering
   */
  async listObjects(
    bucketName: string,
    criteria: FilterCriteria = {},
  ): Promise<StorageObject[]> {
    try {
      const objects: StorageObject[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: criteria.prefix,
          MaxKeys: criteria.maxResults || 1000,
          ContinuationToken: continuationToken,
        });

        const response: ListObjectsV2CommandOutput =
          await this.s3Client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key) {
              // Apply additional filters
              if (this.matchesFilter(object, criteria)) {
                objects.push({
                  key: object.Key,
                  lastModified: object.LastModified,
                  size: object.Size,
                  etag: object.ETag,
                });
              }
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (
        continuationToken &&
        (!criteria.maxResults || objects.length < criteria.maxResults)
      );

      // Sort by last modified (newest first)
      objects.sort((a, b) => {
        if (!a.lastModified || !b.lastModified) return 0;
        return b.lastModified.getTime() - a.lastModified.getTime();
      });

      return criteria.maxResults
        ? objects.slice(0, criteria.maxResults)
        : objects;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error listing objects in bucket ${bucketName}: ${info.message}`,
        info.stack,
        S3StorageService.name,
      );
      throw error;
    }
  }

  /**
   * Get object content from storage
   */
  async getObject(bucketName: string, objectKey: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error(`Object ${objectKey} has no content`);
      }

      const content = await response.Body.transformToString();
      return content;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error getting object ${objectKey} from bucket ${bucketName}: ${info.message}`,
        info.stack,
        S3StorageService.name,
      );
      throw error;
    }
  }

  /**
   * Put object content to storage
   */
  async putObject(
    bucketName: string,
    objectKey: string,
    content: string,
    contentType: string = 'text/plain',
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: content,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.info(
        `Successfully uploaded object ${objectKey} to bucket ${bucketName}`,
        S3StorageService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error uploading object ${objectKey} to bucket ${bucketName}: ${info.message}`,
        info.stack,
        S3StorageService.name,
      );
      throw error;
    }
  }

  /**
   * Check if object matches filter criteria
   */
  private matchesFilter(object: any, criteria: FilterCriteria): boolean {
    // Date range filter
    if (criteria.dateFrom && object.LastModified) {
      const objectDate = new Date(object.LastModified);
      const fromDate = new Date(criteria.dateFrom);
      if (objectDate < fromDate) return false;
    }

    if (criteria.dateTo && object.LastModified) {
      const objectDate = new Date(object.LastModified);
      const toDate = new Date(criteria.dateTo);
      if (objectDate > toDate) return false;
    }

    // Extension filter
    if (criteria.extensions && criteria.extensions.length > 0) {
      const hasMatchingExtension = criteria.extensions.some((ext) =>
        object.Key.toLowerCase().endsWith(ext.toLowerCase()),
      );
      if (!hasMatchingExtension) return false;
    }

    return true;
  }

  /**
   * Get the underlying S3 client for advanced operations
   */
  getClient(): S3Client {
    return this.s3Client;
  }

  /**
   * Delete objects with a given prefix from storage
   */
  async deleteObjectsWithPrefix(
    bucketName: string,
    prefix: string,
  ): Promise<void> {
    try {
      this.logger.info(
        `Starting deletion of objects with prefix '${prefix}' from bucket '${bucketName}'`,
        S3StorageService.name,
      );

      // First, list all objects with the given prefix
      const objects = await this.listObjects(bucketName, { prefix });

      if (objects.length === 0) {
        this.logger.info(
          `No objects found with prefix '${prefix}' in bucket '${bucketName}'`,
          S3StorageService.name,
        );
        return;
      }

      // Delete objects in batches (S3 supports up to 1000 objects per batch)
      const batchSize = 1000;
      for (let i = 0; i < objects.length; i += batchSize) {
        const batch = objects.slice(i, i + batchSize);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: batch.map((obj) => ({ Key: obj.key })),
            Quiet: true,
          },
        });

        await this.s3Client.send(deleteCommand);
        this.logger.info(
          `Deleted batch of ${batch.length} objects`,
          S3StorageService.name,
        );
      }

      this.logger.info(
        `Successfully deleted ${objects.length} objects with prefix '${prefix}' from bucket '${bucketName}'`,
        S3StorageService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting objects with prefix '${prefix}' from bucket '${bucketName}': ${info.message}`,
        info.stack,
        S3StorageService.name,
      );
      throw error;
    }
  }
}
