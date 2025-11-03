import { Module } from '@nestjs/common';
import {
  CheerioWebLoader,
  CurlWebLoader,
  GitHubRepoLoader,
  HTMLWebLoader,
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
  CSVDocumentLoader,
  DOCXDocumentLoader,
  EPUBDocumentLoader,
  ImageUtils,
  NotionDocumentLoader,
  ObsidianDocumentLoader,
  OpenAIWhisperAudioLoader,
  PDFDocumentLoader,
  PPTXDocumentLoader,
  SRTDocumentLoader,
  UnstructuredDocumentLoader,
} from './fs';
import { OcrService } from './utils/ocr';
import { LoaderService } from './loader.service';
import VectorStoreModule from '../vectorstores/vectorstore.module';
import { MemoryModule } from '../memory/memory.module';
import { CoreServicesModule } from '@core/services/core-services.module';

/**
 * DocumentLoadersModule - A module providing document loaders for various formats
 *
 * This module makes various document loaders available through dependency injection.
 * These loaders can be used to extract content from files, web pages, and other sources
 * for processing by agents and LLMs.
 */
@Module({
  imports: [VectorStoreModule, MemoryModule, CoreServicesModule],
  providers: [
    // Web loaders
    CheerioWebLoader,
    CurlWebLoader,
    GitHubRepoLoader,
    HTMLWebLoader,
    NotionAPIWebLoader,
    PlaywrightWebLoader,
    PuppeteerWebLoader,
    RecursiveUrlWebLoader,
    S3WebLoader,
    SerpAPIWebLoader,
    SitemapWebLoader,
    TavilySearchLoader,
    YouTubeWebLoader,

    // File system loaders
    CSVDocumentLoader,
    DOCXDocumentLoader,
    EPUBDocumentLoader,
    ImageUtils,
    NotionDocumentLoader,
    ObsidianDocumentLoader,
    OpenAIWhisperAudioLoader,
    PDFDocumentLoader,
    PPTXDocumentLoader,
    SRTDocumentLoader,
    UnstructuredDocumentLoader,

    // Utilities
    OcrService,
    ImageUtils,

    // Services
    LoaderService,
  ],
  exports: [
    // Web loaders
    CheerioWebLoader,
    CurlWebLoader,
    GitHubRepoLoader,
    HTMLWebLoader,
    NotionAPIWebLoader,
    PlaywrightWebLoader,
    PuppeteerWebLoader,
    RecursiveUrlWebLoader,
    S3WebLoader,
    SerpAPIWebLoader,
    SitemapWebLoader,
    TavilySearchLoader,
    YouTubeWebLoader,

    // File system loaders
    CSVDocumentLoader,
    DOCXDocumentLoader,
    EPUBDocumentLoader,
    ImageUtils,
    NotionDocumentLoader,
    ObsidianDocumentLoader,
    OpenAIWhisperAudioLoader,
    PDFDocumentLoader,
    PPTXDocumentLoader,
    SRTDocumentLoader,
    UnstructuredDocumentLoader,

    // Utilities
    OcrService,
    ImageUtils,

    // Services
    LoaderService,
  ],
})
export class DocumentLoadersModule {}
