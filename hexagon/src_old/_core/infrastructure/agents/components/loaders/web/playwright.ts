import {
  Browser,
  Page,
  PlaywrightWebBaseLoader,
  PlaywrightEvaluate,
} from '@langchain/community/document_loaders/web/playwright';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { Response } from 'playwright-core';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * PlaywrightWebLoader - A service for loading web content using Playwright
 *
 * This class uses LangChain's PlaywrightWebBaseLoader to load web pages
 * with a headless browser and convert them into Document objects.
 * Useful for JavaScript-heavy websites that require rendering.
 */
@Injectable()
export class PlaywrightWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'PlaywrightWebLoader initializing',
      PlaywrightWebLoader.name,
    );
  }
  /**
   * Load content from a URL using Playwright headless browser
   *
   * @param url - URL to fetch
   * @param options - Optional configuration for Playwright
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing web content
   */
  async load(
    url: string,
    options: {
      gotoOptions?: {
        timeout?: number;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      };
      evaluatePage?: (
        page: Page,
        browser: Browser,
        response: Response | null,
      ) => Promise<string>;
      waitForSelector?: string;
      launchOptions?: {
        headless?: boolean;
        chromiumSandbox?: boolean;
      };
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading web content with Playwright from URL: ${url}`,
      PlaywrightWebLoader.name,
    );
    try {
      // Create a PlaywrightWebBaseLoader instance
      const loader = new PlaywrightWebBaseLoader(url, {
        gotoOptions: options.gotoOptions || {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        },
        evaluate: options.evaluatePage,
        launchOptions: options.launchOptions || {
          headless: true,
        },
      });

      // Load the web content
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded web content with Playwright from ${url}, generated ${docs.length} documents`,
        PlaywrightWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading web content with Playwright\n' + (info.stack || ''),
        PlaywrightWebLoader.name,
      );
      throw new Error(
        `Error loading web content with Playwright: ${info.message}`,
      );
    }
  }
}
