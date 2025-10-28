import {
  Browser,
  Page,
  PuppeteerWebBaseLoader,
} from '@langchain/community/document_loaders/web/puppeteer';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * PuppeteerWebLoader - A service for loading web content using Puppeteer
 *
 * This class uses LangChain's PuppeteerWebBaseLoader to load web pages
 * with a headless browser and convert them into Document objects.
 * Useful for JavaScript-heavy websites that require rendering.
 */
@Injectable()
export class PuppeteerWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'PuppeteerWebLoader initializing',
      PuppeteerWebLoader.name,
    );
  }
  /**
   * Load content from a URL using Puppeteer headless browser
   *
   * @param url - URL to fetch
   * @param options - Optional configuration for Puppeteer
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing web content
   */
  async load(
    url: string,
    options: {
      gotoOptions?: {
        timeout?: number;
        waitUntil?:
          | 'load'
          | 'domcontentloaded'
          | 'networkidle0'
          | 'networkidle2';
      };
      evaluatePage?: (page: Page, browser: Browser) => Promise<string>;
      waitForSelector?: string;
      launchOptions?: {
        headless?: boolean | 'new';
        args?: string[];
      };
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading web content with Puppeteer from URL: ${url}`,
      PuppeteerWebLoader.name,
    );
    try {
      // Create a PuppeteerWebBaseLoader instance
      const loader = new PuppeteerWebBaseLoader(url, {
        gotoOptions: options.gotoOptions || {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        },
        evaluate: options.evaluatePage,
        launchOptions: options.launchOptions || {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
        `Successfully loaded web content with Puppeteer from ${url}, generated ${docs.length} documents`,
        PuppeteerWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading web content with Puppeteer\n' + (info.stack || ''),
        PuppeteerWebLoader.name,
      );
      throw new Error(
        `Error loading web content with Puppeteer: ${info.message}`,
      );
    }
  }
}
