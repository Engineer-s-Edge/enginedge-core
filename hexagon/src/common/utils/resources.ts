import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility class for loading resources from the 'res' directory.
 * Singleton pattern with caching for efficient resource loading.
 */
export class ResourceLoader {
  private static instance: ResourceLoader;
  private readonly basePath: string;
  private fileCache: Map<string, any> = new Map();
  public fileIndex: Set<string> = new Set();
  private isIndexed: boolean = false;

  /**
   * Singleton instance getter.
   * @returns The singleton instance of ResourceLoader.
   */
  public static getInstance(): ResourceLoader {
    if (!ResourceLoader.instance) {
      ResourceLoader.instance = new ResourceLoader();
    }
    return ResourceLoader.instance;
  }

  private constructor() {
    // Assuming the execution context is from the src directory
    // Navigate to the parent directory and then to 'res'
    this.basePath = path.resolve(process.cwd(), 'res');
    this.indexFiles();
  }

  /**
   * Indexes all files in the 'res' directory.
   * @param forceReindex Whether to force reindexing even if already indexed
   * @returns Array of all file paths relative to the 'res' directory
   */
  indexFiles(forceReindex: boolean = false): string[] {
    if (this.isIndexed && !forceReindex) {
      return Array.from(this.fileIndex);
    }

    this.fileIndex.clear();

    const indexDirectory = (dirPath: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryRelativePath = path.join(relativePath, entry.name);
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            indexDirectory(fullPath, entryRelativePath);
          } else {
            this.fileIndex.add(entryRelativePath);
          }
        }
      } catch (error) {
        // Directory might not exist, skip silently
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    };

    try {
      if (fs.existsSync(this.basePath)) {
        indexDirectory(this.basePath);
      }
      this.isIndexed = true;
      return Array.from(this.fileIndex);
    } catch (error) {
      throw new Error(`Failed to index resources: ${error}`);
    }
  }

  /**
   * Gets a file from cache or loads it if not cached.
   * @param relativePath The path relative to the 'res' directory
   * @param loader The function to load the file if not cached
   * @returns The cached or loaded file content
   */
  private getFileFromPath<T>(relativePath: string, loader: () => T): T {
    if (this.fileCache.has(relativePath)) {
      return this.fileCache.get(relativePath) as T;
    }

    const content = loader();
    this.fileCache.set(relativePath, content);
    return content;
  }

  /**
   * Gets a file from cache or loads it if not cached.
   * @param fileName The name of the file
   * @param loader The function to load the file if not cached
   * @returns The cached or loaded file content
   */
  private getFileFromName<T>(fileName: string, loader: () => T): T {
    if (this.fileCache.has(fileName)) {
      return this.fileCache.get(fileName) as T;
    }

    const content = loader();
    this.fileCache.set(fileName, content);
    return content;
  }

  /**
   * Creates a default loader function for a given file name.
   * @param fileName The name of the file to load
   * @param options Optional settings for the loader
   * @returns A loader function that can be passed to getFileFromName
   */
  createDefaultLoader<T>(
    fileName: string,
    options: {
      encoding?: BufferEncoding;
      parseJson?: boolean;
      subDir?: string;
    } = {},
  ): () => T {
    const { encoding = 'utf-8', parseJson = false, subDir = '' } = options;

    return () => {
      const filePath = path.join(this.basePath, subDir, fileName);
      try {
        const content = fs.readFileSync(filePath, encoding);
        if (parseJson) {
          return JSON.parse(content as string) as T;
        }
        return content as unknown as T;
      } catch (error) {
        throw new Error(`Failed to load ${fileName}: ${error}`);
      }
    };
  }

  /**
   * Gets a file from cache or loads it by name using the default loader.
   * @param fileName The name of the file to load
   * @param options Optional settings for the loader
   * @returns The cached or loaded file content
   */
  getFile<T>(
    fileName: string,
    options: {
      encoding?: BufferEncoding;
      parseJson?: boolean;
      subDir?: string;
    } = {},
  ): T {
    const loader = this.createDefaultLoader<T>(fileName, options);
    return this.getFileFromName<T>(fileName, loader);
  }

  /**
   * Loads a file as a string.
   * @param relativePath The path relative to the 'res' directory.
   * @returns The file content as a string.
   * @throws Error if the file cannot be read.
   */
  loadAsString(relativePath: string): string {
    return this.getFileFromPath(relativePath, () => {
      const fullPath = path.join(this.basePath, relativePath);
      try {
        return fs.readFileSync(fullPath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to load resource at ${relativePath}: ${error}`);
      }
    });
  }

  /**
   * Loads a file as a binary buffer.
   * @param relativePath The path relative to the 'res' directory.
   * @returns The file content as a buffer.
   * @throws Error if the file cannot be read.
   */
  loadAsBuffer(relativePath: string): Buffer {
    return this.getFileFromPath(relativePath, () => {
      const fullPath = path.join(this.basePath, relativePath);
      try {
        return fs.readFileSync(fullPath);
      } catch (error) {
        throw new Error(`Failed to load resource at ${relativePath}: ${error}`);
      }
    });
  }

  /**
   * Loads a JSON file and parses it.
   * @param relativePath The path relative to the 'res' directory.
   * @returns The parsed JSON content.
   * @throws Error if the file cannot be read or parsed.
   */
  loadAsJson<T>(relativePath: string): T {
    return this.getFileFromPath(relativePath, () => {
      const content = this.loadAsString(relativePath);
      try {
        return JSON.parse(content) as T;
      } catch (error) {
        throw new Error(`Failed to parse JSON from ${relativePath}: ${error}`);
      }
    });
  }

  /**
   * Checks if a file exists.
   * @param relativePath The path relative to the 'res' directory.
   * @returns True if the file exists, false otherwise.
   */
  exists(relativePath: string): boolean {
    const fullPath = path.join(this.basePath, relativePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Clears the file cache.
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}

// Export a singleton instance for easy use
export const resourceLoader = ResourceLoader.getInstance();
