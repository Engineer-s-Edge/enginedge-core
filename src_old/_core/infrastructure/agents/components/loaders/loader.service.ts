import { Injectable, Inject, Scope } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import {
  SystemMessage,
  HumanMessage,
  BaseMessage,
} from '@langchain/core/messages';
import {
  CSVDocumentLoader,
  DOCXDocumentLoader,
  EPUBDocumentLoader,
  PDFDocumentLoader,
  PPTXDocumentLoader,
  SRTDocumentLoader,
  UnstructuredDocumentLoader,
  NotionDocumentLoader,
  ObsidianDocumentLoader,
  OpenAIWhisperAudioLoader,
} from './fs';
import {
  CurlWebLoader,
  HTMLWebLoader,
  CheerioWebLoader,
  GitHubRepoLoader,
  NotionAPIWebLoader,
  PlaywrightWebLoader,
  PuppeteerWebLoader,
  RecursiveUrlWebLoader,
  S3WebLoader,
  SerpAPIWebLoader,
  SitemapWebLoader,
  TavilySearchLoader,
  YouTubeWebLoader,
} from './web';
import {
  ParsingConfig,
  DefaultParsingConfig,
} from '../../core/agents/types/agent.entity';
import VectorStoreService, {
  StoreDocumentInput,
} from '../vectorstores/services/vectorstore.service';
import AgentMemory from '../memory/memory.service';
import LLMService from '../llm/llm.service';
import {
  UserIdType,
  ConversationIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MIMEType } from 'util';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable({ scope: Scope.TRANSIENT })
export class LoaderService {
  constructor(
    // File system loaders
    private pdfLoader: PDFDocumentLoader,
    private docxLoader: DOCXDocumentLoader,
    private csvLoader: CSVDocumentLoader,
    private epubLoader: EPUBDocumentLoader,
    private pptxLoader: PPTXDocumentLoader,
    private srtLoader: SRTDocumentLoader,
    private unstructuredLoader: UnstructuredDocumentLoader,
    private notionLoader: NotionDocumentLoader,
    private obsidianLoader: ObsidianDocumentLoader,
    private whisperLoader: OpenAIWhisperAudioLoader,

    // Web loaders
    private curlWebLoader: CurlWebLoader,
    private htmlWebLoader: HTMLWebLoader,
    private cheerioWebLoader: CheerioWebLoader,
    private githubRepoLoader: GitHubRepoLoader,
    private notionAPIWebLoader: NotionAPIWebLoader,
    private playwrightWebLoader: PlaywrightWebLoader,
    private puppeteerWebLoader: PuppeteerWebLoader,
    private recursiveUrlWebLoader: RecursiveUrlWebLoader,
    private s3WebLoader: S3WebLoader,
    private serpAPIWebLoader: SerpAPIWebLoader,
    private sitemapWebLoader: SitemapWebLoader,
    private tavilySearchLoader: TavilySearchLoader,
    private youtubeWebLoader: YouTubeWebLoader,

    // Services
    @Inject(VectorStoreService) private vectorStoreService: VectorStoreService,
    @Inject(AgentMemory) private agentMemory: AgentMemory,
    @Inject(LLMService) private llmService: LLMService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'LoaderService initialized with all document and web loaders',
      LoaderService.name,
    );
  }

  /**
   * Load file content into Document objects based on extension
   */
  async loadFile(file: File): Promise<Document[]> {
    const blob = file as Blob;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    this.logger.info(
      `Loading file: ${file.name} (${ext}, ${file.size} bytes)`,
      LoaderService.name,
    );

    try {
      let documents: Document[];

      switch (ext) {
        case 'pdf':
          this.logger.info(
            `Using PDF loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.pdfLoader.loadBlob(blob);
          break;
        case 'docx':
          this.logger.info(
            `Using DOCX loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.docxLoader.loadBlob(blob);
          break;
        case 'csv':
          this.logger.info(
            `Using CSV loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.csvLoader.loadBlob(blob);
          break;
        case 'epub':
          this.logger.info(
            `Using EPUB loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.epubLoader.loadBlob(blob);
          break;
        case 'pptx':
          this.logger.info(
            `Using PPTX loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.pptxLoader.loadBlob(blob);
          break;
        case 'srt':
          this.logger.info(
            `Using SRT loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.srtLoader.loadBlob(blob);
          break;
        case 'mp3':
        case 'wav':
        case 'm4a':
          this.logger.info(
            `Using Whisper audio loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = await this.whisperLoader.loadBlob(blob);
          break;
        case 'txt':
        case 'md':
        case 'markdown':
          this.logger.info(
            `Using plain text loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = [
            new Document({
              pageContent: await file.text(),
              metadata: { fileName: file.name },
            }),
          ];
          break;
        default:
          this.logger.info(
            `Using fallback plain text loader for file: ${file.name}`,
            LoaderService.name,
          );
          documents = [
            new Document({
              pageContent: await file.text(),
              metadata: { fileName: file.name },
            }),
          ];
          break;
      }

      this.logger.info(
        `Successfully loaded file: ${file.name}, generated ${documents.length} documents`,
        LoaderService.name,
      );
      return documents;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error loading file ${file.name}: ${info.message}`,
        info.stack,
        LoaderService.name,
      );
      // Fallback to plain text
      const fallbackDocuments = [
        new Document({
          pageContent: await file.text(),
          metadata: { fileName: file.name },
        }),
      ];
      this.logger.info(
        `Using fallback text extraction for file: ${file.name}`,
        LoaderService.name,
      );
      return fallbackDocuments;
    }
  }

  /**
   * Intelligently load web page content using the most appropriate loader
   * based on URL patterns and website types
   */
  async loadWebPage(url: string): Promise<Document[]> {
    this.logger.info(`Loading web page: ${url}`, LoaderService.name);

    try {
      // Detect URL pattern and choose appropriate loader
      const loader = this.detectWebLoader(url);
      const loaderName = this.getLoaderName(loader);

      this.logger.info(
        `Using ${loaderName} for URL: ${url}`,
        LoaderService.name,
      );

      try {
        // Try the specialized loader first
        const result = await loader.load(url);
        if (result && result.length > 0) {
          this.logger.info(
            `Successfully loaded web page with ${loaderName}: ${url}, generated ${result.length} documents`,
            LoaderService.name,
          );
          return result;
        } else {
          this.logger.warn(
            `${loaderName} returned empty result for ${url}, falling back to CurlWebLoader`,
            LoaderService.name,
          );
        }
      } catch (specializedError) {
        const info = getErrorInfo(specializedError);
        this.logger.warn(
          `${loaderName} failed for ${url}, falling back to CurlWebLoader: ${info.message}`,
          LoaderService.name,
        );
      }

      // Fallback to CurlWebLoader if specialized loader fails or returns empty
      this.logger.info(
        `Using CurlWebLoader fallback for URL: ${url}`,
        LoaderService.name,
      );
      const fallbackResult = await this.curlWebLoader.load(url);
      this.logger.info(
        `CurlWebLoader fallback completed for ${url}, generated ${fallbackResult.length} documents`,
        LoaderService.name,
      );
      return fallbackResult;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error loading web page ${url}: ${info.message}`,
        info.stack,
        LoaderService.name,
      );
      return [];
    }
  }

  /**
   * Detect the most appropriate web loader based on URL patterns
   */
  private detectWebLoader(url: string): any {
    const urlLower = url.toLowerCase();

    // GitHub repositories
    if (
      urlLower.includes('github.com') &&
      (urlLower.includes('/tree/') ||
        urlLower.includes('/blob/') ||
        urlLower.match(/github\.com\/[^\/]+\/[^\/]+\/?$/))
    ) {
      return this.githubRepoLoader;
    }

    // YouTube videos
    if (
      urlLower.includes('youtube.com/watch') ||
      urlLower.includes('youtu.be/') ||
      urlLower.includes('youtube.com/embed/')
    ) {
      return this.youtubeWebLoader;
    }

    // Notion pages
    if (urlLower.includes('notion.so') || urlLower.includes('notion.site')) {
      return this.notionAPIWebLoader;
    }

    // S3 buckets
    if (
      urlLower.includes('s3.amazonaws.com') ||
      urlLower.includes('.s3.') ||
      urlLower.match(/s3-[a-z0-9-]+\.amazonaws\.com/)
    ) {
      return this.s3WebLoader;
    }

    // Sitemaps
    if (
      urlLower.includes('sitemap.xml') ||
      urlLower.includes('sitemap_index.xml') ||
      (urlLower.endsWith('.xml') && urlLower.includes('sitemap'))
    ) {
      return this.sitemapWebLoader;
    }

    // Check for JavaScript-heavy sites that might need browser rendering
    if (this.requiresBrowserRendering(urlLower)) {
      return this.playwrightWebLoader;
    }

    // For sites that might have complex DOM structures, use Cheerio for better parsing
    if (this.benefitsFromCheerio(urlLower)) {
      return this.cheerioWebLoader;
    }

    // Default to CurlWebLoader for standard websites
    return this.curlWebLoader;
  }

  /**
   * Check if URL likely requires browser rendering (SPA, heavy JS)
   */
  private requiresBrowserRendering(urlLower: string): boolean {
    const jsHeavySites = [
      'angular.io',
      'react.dev',
      'vue.js.org',
      'svelte.dev',
      'nextjs.org',
      'vercel.app',
      'netlify.app',
      'herokuapp.com',
      'discord.com',
      'slack.com',
      'figma.com',
      'miro.com',
      'trello.com',
      'asana.com',
    ];

    return jsHeavySites.some((site) => urlLower.includes(site));
  }

  /**
   * Check if URL would benefit from Cheerio's advanced CSS selector parsing
   */
  private benefitsFromCheerio(urlLower: string): boolean {
    const cheerioSites = [
      'stackoverflow.com',
      'stackexchange.com',
      'reddit.com',
      'medium.com',
      'dev.to',
      'hashnode.com',
      'wikipedia.org',
      'docs.microsoft.com',
      'developer.mozilla.org',
      'w3schools.com',
    ];

    return cheerioSites.some((site) => urlLower.includes(site));
  }

  /**
   * Get human-readable loader name for logging
   */
  private getLoaderName(loader: any): string {
    if (loader === this.githubRepoLoader) return 'GitHubRepoLoader';
    if (loader === this.youtubeWebLoader) return 'YouTubeWebLoader';
    if (loader === this.notionAPIWebLoader) return 'NotionAPIWebLoader';
    if (loader === this.s3WebLoader) return 'S3WebLoader';
    if (loader === this.sitemapWebLoader) return 'SitemapWebLoader';
    if (loader === this.playwrightWebLoader) return 'PlaywrightWebLoader';
    if (loader === this.cheerioWebLoader) return 'CheerioWebLoader';
    if (loader === this.curlWebLoader) return 'CurlWebLoader';
    return 'UnknownLoader';
  }

  public async preload(
    userprompt: string,
    attachments?: { files: File[]; action: 'deliver' | 'vstore' | 'parse' }[],
    options?: {
      userId?: UserIdType;
      conversationId?: ConversationIdType;
      maxTokens?: number;
      shorteningStrategy?: 'vstore' | 'summarize' | 'drop';
    },
    parsingConfig: ParsingConfig = DefaultParsingConfig,
  ): Promise<
    AsyncGenerator<
      { preloadInjection: string; deliverFiles: File[] },
      { preloadInjection: string; deliverFiles: File[] },
      unknown
    > & { cleanup: () => void }
  > {
    const cleanupFns: Array<() => void> = [];
    const self = this;
    const {
      userId,
      conversationId,
      maxTokens = 8000,
      shorteningStrategy = 'vstore',
    } = options || {};

    const gen = (async function* () {
      // Initial result with full content
      let currentContent = '';
      let deliverFiles: File[] = [];
      let contentSections: {
        title: string;
        content: string;
        priority: number;
      }[] = [];

      try {
        // Step 1: Process attachments based on their action
        if (attachments) {
          for (const attachment of attachments) {
            for (const file of attachment.files) {
              switch (attachment.action) {
                case 'deliver':
                  deliverFiles.push(file);
                  break;
                case 'parse':
                  try {
                    const documents = await self.loadFile(file);
                    const content = documents
                      .map((doc) => doc.pageContent)
                      .join('\n\n');
                    contentSections.push({
                      title: `File: ${file.name}`,
                      content: content,
                      priority: 1, // High priority - explicitly requested files
                    });
                  } catch (error) {
                    const info = getErrorInfo(error);
                    self.logger.error(
                      `Error processing file ${file.name}: ${info.message}`,
                      info.stack,
                      LoaderService.name,
                    );
                  }
                  break;
                case 'vstore':
                  if (userId) {
                    try {
                      const documents = await self.loadFile(file);
                      const content = documents
                        .map((doc) => doc.pageContent)
                        .join('\n\n');

                      // Upload to vector store
                      const docInput: StoreDocumentInput = {
                        text: content,
                        type: self.getMimeType(file),
                        metadata: {
                          name: file.name,
                          originalSize: file.size,
                          uploadDate: new Date().toISOString(),
                        },
                      };

                      await self.vectorStoreService.uploadDocument(
                        docInput,
                        { ownerId: userId },
                        {
                          type: 'recursive',
                          options: { chunkSize: 1000, chunkOverlap: 200 },
                        },
                      );

                      contentSections.push({
                        title: `Vector Store Upload`,
                        content: `File "${file.name}" has been stored in vector store and is available for semantic search.`,
                        priority: 3, // Lower priority - just notification
                      });
                    } catch (error) {
                      const info = getErrorInfo(error);
                      self.logger.error(
                        `Error storing file ${file.name} in vector store: ${info.message}`,
                        info.stack,
                        LoaderService.name,
                      );
                      // Fallback to parse action
                      try {
                        const documents = await self.loadFile(file);
                        const content = documents
                          .map((doc) => doc.pageContent)
                          .join('\n\n');
                        contentSections.push({
                          title: `File: ${file.name} (fallback)`,
                          content: content,
                          priority: 1,
                        });
                      } catch (parseError) {
                        const info2 = getErrorInfo(parseError);
                        self.logger.error(
                          `Error parsing fallback for file ${file.name}: ${info2.message}`,
                          info2.stack,
                          LoaderService.name,
                        );
                      }
                    }
                  }
                  break;
              }
            }
          }
        }

        // Step 2: Detect and process URLs in user prompt
        const urls = await self.detectUrls(userprompt);
        if (urls.length > 0) {
          for (const url of urls) {
            try {
              const webDocs = await self.loadWebPage(url);
              const webContent = webDocs
                .map((doc) => doc.pageContent)
                .join('\n\n');

              if (userId && shorteningStrategy === 'vstore') {
                // Store web content in vector store for semantic retrieval
                const docInput: StoreDocumentInput = {
                  text: webContent,
                  type: new MIMEType('text/html'),
                  metadata: {
                    url,
                    title: self.extractTitle(webContent),
                    fetchDate: new Date().toISOString(),
                  },
                };

                await self.vectorStoreService.uploadDocument(
                  docInput,
                  { ownerId: userId },
                  {
                    type: 'recursive',
                    options: { chunkSize: 800, chunkOverlap: 100 },
                  },
                );

                contentSections.push({
                  title: `Web Content Storage`,
                  content: `Web content from ${url} has been stored for semantic search.`,
                  priority: 3,
                });
              } else {
                contentSections.push({
                  title: `Web Content from ${url}`,
                  content: webContent,
                  priority: 2, // Medium priority - contextual web content
                });
              }
            } catch (error) {
              const info = getErrorInfo(error);
              self.logger.error(
                `Error loading web page ${url}: ${info.message}`,
                info.stack,
                LoaderService.name,
              );
              contentSections.push({
                title: `Web Load Error`,
                content: `Note: Unable to load content from ${url}`,
                priority: 3,
              });
            }
          }
        }

        // Step 3: Process vector store references using regex patterns
        const vectorStoreRefs = await self.extractVectorStoreRefs(
          userprompt,
          parsingConfig,
          userId,
        );
        if (vectorStoreRefs.length > 0) {
          contentSections.push({
            title: `Vector Store References`,
            content: vectorStoreRefs.join('\n'),
            priority: 1, // High priority - explicitly requested
          });
        }

        // Step 4: Process conversation references
        const conversationRefs = await self.extractConversationRefs(
          userprompt,
          parsingConfig,
          userId,
        );
        if (conversationRefs.length > 0) {
          contentSections.push({
            title: `Conversation References`,
            content: conversationRefs.join('\n'),
            priority: 1, // High priority - explicitly requested
          });
        }

        // Step 5: Process link references
        const linkRefs = await self.extractLinkRefs(userprompt, parsingConfig);
        if (linkRefs.length > 0) {
          contentSections.push({
            title: `Link References`,
            content: linkRefs.join('\n'),
            priority: 2, // Medium priority - contextual links
          });
        }

        // Sort sections by priority (lower number = higher priority)
        contentSections.sort((a, b) => a.priority - b.priority);

        // First yield: Full content (maximum length)
        currentContent = contentSections
          .map((section) => `--- ${section.title} ---\n${section.content}`)
          .join('\n\n');

        yield { preloadInjection: currentContent, deliverFiles };

        // Progressive shortening: Keep yielding shorter versions when called again
        let shorteningLevel = 0;
        const maxShorteningLevels = 5;

        while (shorteningLevel < maxShorteningLevels) {
          const targetLength = Math.max(
            maxTokens * 4 * (1 - (shorteningLevel + 1) * 0.2), // Reduce by 20% each level
            maxTokens * 0.5, // Never go below 50% of maxTokens
          );

          if (currentContent.length <= targetLength) {
            // Content is already short enough
            yield { preloadInjection: currentContent, deliverFiles };
            break;
          } // Strategy for shortening based on level - now using intelligent LLM-based shortening
          switch (shorteningLevel) {
            case 0:
              // Level 1: Remove lowest priority sections
              contentSections = contentSections.filter(
                (section) => section.priority <= 2,
              );
              break;
            case 1:
              // Level 2: Keep only highest priority sections
              contentSections = contentSections.filter(
                (section) => section.priority === 1,
              );
              break;
            case 2:
              // Level 3: Intelligent compression - rewrite to be more concise
              try {
                contentSections = await self.intelligentContentShortening(
                  contentSections,
                  Math.floor(targetLength * 0.8), // Target 80% of desired length
                  'compress',
                );
              } catch (error) {
                const info = getErrorInfo(error);
                self.logger.warn(
                  'LLM compression failed, falling back to truncation\n' +
                    (info.stack || ''),
                  LoaderService.name,
                );
                // Fallback to truncation if LLM fails
                contentSections = contentSections.map((section) => ({
                  ...section,
                  content:
                    section.content.length > 500
                      ? section.content.substring(0, 500) + '... [truncated]'
                      : section.content,
                }));
              }
              break;
            case 3:
              // Level 4: Intelligent summarization - preserve key information
              try {
                contentSections = await self.intelligentContentShortening(
                  contentSections,
                  Math.floor(targetLength * 0.6), // Target 60% of desired length
                  'summarize',
                );
              } catch (error) {
                const info = getErrorInfo(error);
                self.logger.warn(
                  'LLM summarization failed, falling back to paragraph extraction\n' +
                    (info.stack || ''),
                  LoaderService.name,
                );
                // Fallback to first paragraph extraction
                contentSections = contentSections.map((section) => ({
                  ...section,
                  content:
                    section.content.split('\n\n')[0] +
                    (section.content.includes('\n\n')
                      ? '... [first paragraph only]'
                      : ''),
                }));
              }
              break;
            case 4:
              // Level 5: Extract key points - structured information
              try {
                contentSections = await self.intelligentContentShortening(
                  contentSections,
                  Math.floor(targetLength * 0.4), // Target 40% of desired length
                  'extract_key_points',
                );
              } catch (error) {
                const info = getErrorInfo(error);
                self.logger.warn(
                  'LLM key point extraction failed, falling back to brief summary\n' +
                    (info.stack || ''),
                  LoaderService.name,
                );
                // Fallback to brief summary
                contentSections = contentSections.map((section) => ({
                  ...section,
                  content:
                    section.content.substring(0, 100) +
                    (section.content.length > 100 ? '... [summary]' : ''),
                }));
              }
              break;
          }

          currentContent = contentSections
            .map((section) => `--- ${section.title} ---\n${section.content}`)
            .join('\n\n');

          // Add metadata about shortening level
          currentContent =
            `[Content shortened to level ${shorteningLevel + 1}/${maxShorteningLevels}]\n\n` +
            currentContent;

          shorteningLevel++;
          yield { preloadInjection: currentContent, deliverFiles };
        }

        // Return final result
        return { preloadInjection: currentContent, deliverFiles };
      } catch (error) {
        const info = getErrorInfo(error);
        self.logger.error(
          `Error in preload generator: ${info.message}\n${info.stack || ''}`,
          LoaderService.name,
        );
        return { preloadInjection: '', deliverFiles };
      }
    })();

    // Add cleanup function to the generator
    (gen as any).cleanup = () => {
      cleanupFns.forEach((fn) => fn());
    };

    return gen as AsyncGenerator<
      { preloadInjection: string; deliverFiles: File[] },
      { preloadInjection: string; deliverFiles: File[] },
      unknown
    > & { cleanup: () => void };
  }

  /**
   * Detect URLs in text using pattern matching
   */
  private async detectUrls(text: string): Promise<string[]> {
    const urlRegex =
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const matches = text.match(urlRegex);
    return matches || [];
  }

  /**
   * Get MIME type for a file
   */
  private getMimeType(file: File): MIMEType {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      csv: 'text/csv',
      txt: 'text/plain',
      md: 'text/markdown',
      html: 'text/html',
      json: 'application/json',
    };
    return new MIMEType(mimeMap[ext] || 'text/plain');
  }

  /**
   * Extract title from HTML content
   */
  private extractTitle(content: string): string {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Web Content';
  } /**
   * Summarize content using LLM if it exceeds maxLength, otherwise truncate
   */
  private async summarizeIfNeeded(
    content: string,
    maxLength: number,
    useLLM: boolean = true,
  ): Promise<string> {
    if (content.length <= maxLength) {
      return content;
    }

    // If content is too long and LLM summarization is enabled
    if (useLLM && content.length > maxLength * 2) {
      // Only use LLM for significantly long content
      try {
        const payload: BaseMessage[] = [
          new SystemMessage({
            content: `You are a content summarizer. Create a concise summary of the following content that captures the key information and main points. The summary should be approximately ${Math.floor(maxLength * 0.8)} characters or less. Preserve important details, names, dates, and key concepts while removing redundant information.`,
          }),
          new HumanMessage({
            content: `Summarize this content:\n\n${content}`,
          }),
        ];

        const result = await this.llmService.chat(payload, {
          providerName: 'groq', // Use a fast, cost-effective model
          modelId: 'llama-3.3-70b-versatile',
        });

        const summary = result.response.toString();

        // If the LLM summary is still too long, truncate it
        if (summary.length > maxLength) {
          return (
            summary.substring(0, maxLength) +
            '\n\n... (summarized and truncated)'
          );
        }

        return summary + '\n\n... (summarized by AI)';
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          'Error in LLM summarization\n' + (info.stack || ''),
          LoaderService.name,
        );
        // Fallback to truncation if LLM fails
        return (
          content.substring(0, maxLength) +
          '\n\n... (content truncated - summarization failed)'
        );
      }
    }

    // Fallback to simple truncation for shorter content or when LLM is disabled
    return (
      content.substring(0, maxLength) +
      '\n\n... (content truncated for brevity)'
    );
  }

  /**
   * Extract vector store references from user prompt
   */
  private async extractVectorStoreRefs(
    text: string,
    parsingConfig: ParsingConfig,
    userId?: UserIdType,
  ): Promise<string[]> {
    const matches = text.match(parsingConfig.vectorStoreRefRegex);
    if (!matches || !userId) return [];

    const results: string[] = [];
    for (const match of matches) {
      const query = match.replace(/<\/?vectorstore>/g, '').trim();
      try {
        const searchResults = await this.vectorStoreService.semanticSearchDocs(
          query,
          3, // Top 3 results
          userId,
        );
        for (const result of searchResults) {
          if (result.document) {
            const content = result.document.data.toString();
            const summary = await this.summarizeIfNeeded(content, 300);
            results.push(
              `Vector Store Document (${result.document.documentName}): ${summary}`,
            );
          }
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          'Error searching vector store\n' + (info.stack || ''),
          LoaderService.name,
        );
        results.push(
          `Vector Store Search Error: Unable to retrieve documents for "${query}"`,
        );
      }
    }
    return results;
  }

  /**
   * Extract conversation references from user prompt
   */
  private async extractConversationRefs(
    text: string,
    parsingConfig: ParsingConfig,
    userId?: UserIdType,
  ): Promise<string[]> {
    const matches = text.match(parsingConfig.conversationsRefRegex);
    if (!matches || !userId) return [];

    const results: string[] = [];
    for (const match of matches) {
      const query = match.replace(/<\/?conversations>/g, '').trim();
      try {
        const searchResults = await this.vectorStoreService.semanticSearchConvo(
          query,
          3, // Top 3 results
          userId,
          false, // Use messages, not snippets
        );
        for (const result of searchResults) {
          if (result.data) {
            const summary = await this.summarizeIfNeeded(result.data.text, 200);
            results.push(`Conversation Message: ${summary}`);
          }
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          'Error searching conversations\n' + (info.stack || ''),
          LoaderService.name,
        );
        results.push(
          `Conversation Search Error: Unable to retrieve messages for "${query}"`,
        );
      }
    }
    return results;
  }

  /**
   * Extract link references from user prompt and load content
   */
  private async extractLinkRefs(
    text: string,
    parsingConfig: ParsingConfig,
  ): Promise<string[]> {
    const matches = text.match(parsingConfig.linkRegex);
    if (!matches) return [];

    const results: string[] = [];
    for (const match of matches) {
      const url = match.replace(/<\/?link>/g, '').trim();
      try {
        const webDocs = await this.loadWebPage(url);
        const content = webDocs.map((doc) => doc.pageContent).join('\n\n');
        const summary = await this.summarizeIfNeeded(content, 400);
        results.push(`Link Content (${url}): ${summary}`);
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Error loading link ${url}\n` + (info.stack || ''),
          LoaderService.name,
        );
        results.push(`Link Load Error: Unable to load content from ${url}`);
      }
    }
    return results;
  }

  /**
   * Intelligently shorten content sections using LLM-based summarization
   */
  private async intelligentContentShortening(
    contentSections: Array<{
      title: string;
      content: string;
      priority: number;
    }>,
    targetLength: number,
    strategy: 'summarize' | 'compress' | 'extract_key_points',
  ): Promise<Array<{ title: string; content: string; priority: number }>> {
    const currentLength = contentSections
      .map((section) => `--- ${section.title} ---\n${section.content}`)
      .join('\n\n').length;

    if (currentLength <= targetLength) {
      return contentSections;
    }

    // Calculate how much we need to reduce each section
    const reductionFactor = targetLength / currentLength;
    const minSectionLength = 100; // Minimum length to preserve meaning

    const shortendSections = await Promise.all(
      contentSections.map(async (section) => {
        const targetSectionLength = Math.max(
          Math.floor(section.content.length * reductionFactor),
          minSectionLength,
        );

        if (section.content.length <= targetSectionLength) {
          return section;
        }

        try {
          let systemPrompt: string;
          switch (strategy) {
            case 'summarize':
              systemPrompt = `You are a content summarizer. Create a concise summary of the following content that preserves the key information and main points. Target length: approximately ${targetSectionLength} characters. Maintain the essential facts, names, and important details.`;
              break;
            case 'compress':
              systemPrompt = `You are a content compressor. Rewrite the following content to be more concise while preserving all important information. Target length: approximately ${targetSectionLength} characters. Remove redundancy and unnecessary words but keep all key facts.`;
              break;
            case 'extract_key_points':
              systemPrompt = `You are an information extractor. Extract and list the key points from the following content in a bullet-point or structured format. Target length: approximately ${targetSectionLength} characters. Focus on actionable information and important facts.`;
              break;
          }

          const payload: BaseMessage[] = [
            new SystemMessage({ content: systemPrompt }),
            new HumanMessage({
              content: `Content to process:\n\n${section.content}`,
            }),
          ];

          const result = await this.llmService.chat(payload, {
            providerName: 'groq',
            modelId: 'llama-3.3-70b-versatile', // Fast and cost-effective
          });

          const processedContent = result.response.toString();

          return {
            ...section,
            content: processedContent + ` [${strategy}d by AI]`,
          };
        } catch (error) {
          const info = getErrorInfo(error);
          this.logger.error(
            `Error in LLM content processing for section "${section.title}"\n` +
              (info.stack || ''),
            LoaderService.name,
          );
          // Fallback to simple truncation
          return {
            ...section,
            content:
              section.content.substring(0, targetSectionLength) +
              '... [truncated due to processing error]',
          };
        }
      }),
    );

    return shortendSections;
  }
}
