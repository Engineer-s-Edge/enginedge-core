import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { UnknownHandling } from 'langchain/document_loaders/fs/directory';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * GitHubRepoLoader - A service for loading content from GitHub repositories
 *
 * This class uses LangChain's GithubRepoLoader to fetch and process files
 * from GitHub repositories and convert them into Document objects.
 */
@Injectable()
export class GitHubRepoLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('GitHubRepoLoader initializing', GitHubRepoLoader.name);
  }
  /**
   * Load content from a GitHub repository
   *
   * @param repoLink - GitHub repository URL or org/repo format
   * @param options - Optional configuration for GitHub repo loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing repository content
   */
  async load(
    repoLink: string,
    options: {
      branch?: string;
      recursive?: boolean;
      unknown?: UnknownHandling;
      accessToken?: string;
      ignoreFiles?: string[];
      ignorePaths?: string[];
      includePaths?: string[];
      maxConcurrency?: number;
      maxRetries?: number;
      apiUrl?: string;
      baseUrl?: string;
      processSubmodules?: boolean;
      verbose?: boolean;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading GitHub repository: ${repoLink} (branch: ${options.branch || 'main'})`,
      GitHubRepoLoader.name,
    );
    try {
      // Create a GithubRepoLoader instance
      const loader = new GithubRepoLoader(repoLink, {
        branch: options.branch || 'main',
        recursive: options.recursive !== undefined ? options.recursive : true,
        unknown: options.unknown || 'warn',
        accessToken: options.accessToken || process.env.GITHUB_ACCESS_TOKEN,
        ignoreFiles: options.ignoreFiles,
        ignorePaths: options.ignorePaths,
        apiUrl: options.apiUrl,
        baseUrl: options.baseUrl,
        onFailedAttempt: (error: Error) => {
          this.logger.warn(
            `Failed to load file: ${error.message}`,
            GitHubRepoLoader.name,
          );
        },
        processSubmodules: options.processSubmodules,
        verbose: options.verbose,
        maxConcurrency: options.maxConcurrency || 5,
        maxRetries: options.maxRetries || 2,
      });

      // Load the repository content
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded GitHub repository ${repoLink}, generated ${docs.length} documents`,
        GitHubRepoLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading GitHub repository',
        GitHubRepoLoader.name,
        info.stack,
      );
      throw new Error(`Error loading GitHub repository: ${info.message}`);
    }
  }
}
