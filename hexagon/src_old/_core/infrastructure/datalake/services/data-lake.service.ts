import { Injectable } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service';
import { FilterCriteria, PaginatedResult } from '../types';
import { MyLogger } from '../../../services/logger/logger.service';
import { getErrorInfo } from '../../../../common/error-assertions';

export interface DataRecord {
  id: string;
  [key: string]: any;
}

export interface DataFilter {
  [key: string]: any;
}

@Injectable()
export class DataLakeService {
  constructor(
    private readonly storageService: S3StorageService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('DataLakeService initialized', DataLakeService.name);
  }

  /**
   * Load and parse records from JSONL files in the data lake
   */
  async loadRecords<T extends DataRecord>(
    bucketName: string,
    criteria: FilterCriteria = {},
  ): Promise<T[]> {
    this.logger.info(
      `Loading records from bucket: ${bucketName}`,
      DataLakeService.name,
    );
    try {
      // Get list of files matching criteria
      const files = await this.storageService.listObjects(bucketName, {
        ...criteria,
        extensions: criteria.extensions || ['.jsonl', '.json'],
      });

      this.logger.info(
        `Found ${files.length} files in bucket: ${bucketName}`,
        DataLakeService.name,
      );

      const records: T[] = [];

      // Limit to recent files to avoid loading too much data
      const filesToLoad = files.slice(0, 10);
      this.logger.info(
        `Loading ${filesToLoad.length} files (limited to 10)`,
        DataLakeService.name,
      );

      for (const file of filesToLoad) {
        try {
          const content = await this.storageService.getObject(
            bucketName,
            file.key,
          );

          // Handle both JSONL (JSON Lines) and regular JSON
          if (file.key.endsWith('.jsonl')) {
            const lines = content.trim().split('\n');
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const record = JSON.parse(line) as T;
                  records.push(record);
                } catch (parseError) {
                  this.logger.warn(
                    `Failed to parse line in ${file.key}:`,
                    DataLakeService.name,
                  );
                }
              }
            }
          } else if (file.key.endsWith('.json')) {
            try {
              const data = JSON.parse(content);
              if (Array.isArray(data)) {
                records.push(...data);
              } else {
                records.push(data);
              }
            } catch (parseError) {
              this.logger.warn(
                `Failed to parse JSON file ${file.key}:`,
                DataLakeService.name,
              );
            }
          }
        } catch (error) {
          const info = getErrorInfo(error);
          this.logger.warn(
            `Failed to load file ${file.key}: ${info.message}\n${info.stack || ''}`,
            DataLakeService.name,
          );
        }
      }

      this.logger.info(
        `Loaded ${records.length} records from ${filesToLoad.length} files`,
        DataLakeService.name,
      );
      return records;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error loading records from bucket ${bucketName}: ${info.message}\n${info.stack || ''}`,
        DataLakeService.name,
      );
      throw error;
    }
  }

  /**
   * Apply filters to a collection of records
   */
  applyFilters<T extends DataRecord>(records: T[], filters: DataFilter): T[] {
    let filtered = [...records];

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'searchQuery') {
          // Text search across multiple fields
          const query = value.toLowerCase();
          filtered = filtered.filter((record) => {
            const searchableFields = [
              'title',
              'description',
              'content',
              'author',
            ];
            return searchableFields.some(
              (field) =>
                record[field] &&
                String(record[field]).toLowerCase().includes(query),
            );
          });
        } else if (key === 'dateFrom') {
          const fromDate = new Date(value);
          filtered = filtered.filter((record) => {
            const recordDate = new Date(
              record.published_date || record.created_date || record.date,
            );
            return recordDate >= fromDate;
          });
        } else if (key === 'dateTo') {
          const toDate = new Date(value);
          filtered = filtered.filter((record) => {
            const recordDate = new Date(
              record.published_date || record.created_date || record.date,
            );
            return recordDate <= toDate;
          });
        } else if (key === 'tags' && Array.isArray(value)) {
          filtered = filtered.filter((record) => {
            if (!record.tags || !Array.isArray(record.tags)) return false;
            return value.some((tag) => record.tags.includes(tag));
          });
        } else {
          // Direct field matching
          filtered = filtered.filter(
            (record) =>
              record[key] &&
              String(record[key]).toLowerCase() === String(value).toLowerCase(),
          );
        }
      }
    });

    return filtered;
  }

  /**
   * Paginate results
   */
  paginate<T>(
    items: T[],
    page: number = 1,
    pageSize: number = 20,
  ): PaginatedResult<T> {
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      totalCount: items.length,
      page,
      pageSize,
      hasMore: startIndex + pageSize < items.length,
    };
  }

  /**
   * Sort records by date (newest first by default)
   */
  sortByDate<T extends DataRecord>(
    records: T[],
    dateField: string = 'published_date',
    ascending: boolean = false,
  ): T[] {
    return records.sort((a, b) => {
      const dateA = new Date(a[dateField] || 0);
      const dateB = new Date(b[dateField] || 0);
      return ascending
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * Extract unique values for metadata
   */
  extractMetadata<T extends DataRecord>(
    records: T[],
    fields: string[],
  ): Record<string, string[]> {
    const metadata: Record<string, string[]> = {};

    fields.forEach((field) => {
      if (field === 'tags') {
        // Handle tags specially as they're arrays
        const allTags = records
          .flatMap((record) => record.tags || [])
          .filter((tag, index, array) => array.indexOf(tag) === index)
          .sort();
        metadata[field] = allTags;
      } else {
        const uniqueValues = [
          ...new Set(
            records
              .map((record) => record[field])
              .filter(
                (value) =>
                  value !== undefined && value !== null && value !== '',
              )
              .map((value) => String(value)),
          ),
        ].sort();
        metadata[field] = uniqueValues;
      }
    });

    return metadata;
  }

  /**
   * Remove duplicate records based on ID
   */
  deduplicateRecords<T extends DataRecord>(records: T[]): T[] {
    const seen = new Set<string>();
    const deduplicated: T[] = [];

    for (const record of records) {
      if (!seen.has(record.id)) {
        seen.add(record.id);
        deduplicated.push(record);
      }
    }

    this.logger.info(
      `Deduplicated ${records.length} records to ${deduplicated.length} unique records`,
      DataLakeService.name,
    );
    return deduplicated;
  }

  /**
   * Filter new records by comparing against existing records
   */
  filterNewRecords<T extends DataRecord>(
    newRecords: T[],
    existingRecords: T[],
  ): T[] {
    const existingIds = new Set(existingRecords.map((record) => record.id));
    const filteredRecords = newRecords.filter(
      (record) => !existingIds.has(record.id),
    );

    this.logger.info(
      `Filtered ${newRecords.length} records to ${filteredRecords.length} new records (${newRecords.length - filteredRecords.length} duplicates removed)`,
      DataLakeService.name,
    );
    return filteredRecords;
  }

  /**
   * Store content as a record in the data lake
   */
  async storeRecord(
    bucketName: string,
    objectKey: string,
    content: string,
    contentType: string = 'application/jsonl',
  ): Promise<void> {
    this.logger.info(
      `Storing record to ${objectKey} in bucket ${bucketName}`,
      DataLakeService.name,
    );
    try {
      await this.storageService.putObject(
        bucketName,
        objectKey,
        content,
        contentType,
      );
      this.logger.info(
        `Successfully stored record to ${objectKey} in bucket ${bucketName}`,
        DataLakeService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error storing record to ${objectKey} in bucket ${bucketName}: ${info.message}\n${info.stack || ''}`,
        DataLakeService.name,
      );
      throw error;
    }
  }

  /**
   * Delete all objects with a given prefix from a bucket
   */
  async deleteObjectsWithPrefix(
    bucketName: string,
    prefix: string,
  ): Promise<void> {
    this.logger.info(
      `Deleting all objects with prefix '${prefix}' from bucket '${bucketName}'`,
      DataLakeService.name,
    );
    try {
      await this.storageService.deleteObjectsWithPrefix(bucketName, prefix);
      this.logger.info(
        `Successfully deleted all objects with prefix '${prefix}' from bucket '${bucketName}'`,
        DataLakeService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting objects with prefix '${prefix}' from bucket '${bucketName}': ${info.message}\n${info.stack || ''}`,
        DataLakeService.name,
      );
      throw error;
    }
  }
}
