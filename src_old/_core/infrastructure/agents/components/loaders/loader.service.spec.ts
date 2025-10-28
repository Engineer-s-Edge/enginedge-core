import { Test } from '@nestjs/testing';
import { Document } from '@langchain/core/documents';
import { LoaderService } from './loader.service';
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
import VectorStoreService from '../vectorstores/services/vectorstore.service';
import AgentMemory from '../memory/memory.service';
import LLMService from '../llm/llm.service';
import { MyLogger } from '@core/services/logger/logger.service';

// Build trivial fakes for all loaders used in LoaderService
const doc = (text: string) => new Document({ pageContent: text, metadata: {} });

const mk = (text: string) => ({
  loadBlob: jest.fn().mockResolvedValue([doc(text)]),
  load: jest.fn().mockResolvedValue([doc(text)]),
});

describe('LoaderService', () => {
  let service: LoaderService;
  let curl: jest.Mocked<CurlWebLoader>;
  let cheerio: jest.Mocked<CheerioWebLoader>;
  let gh: jest.Mocked<GitHubRepoLoader>;
  let yt: jest.Mocked<YouTubeWebLoader>;
  let notionApi: jest.Mocked<NotionAPIWebLoader>;
  let sitemap: jest.Mocked<SitemapWebLoader>;
  let playwright: jest.Mocked<PlaywrightWebLoader>;
  let s3: jest.Mocked<S3WebLoader>;
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoaderService,
        { provide: CSVDocumentLoader, useValue: mk('csv') },
        { provide: DOCXDocumentLoader, useValue: mk('docx') },
        { provide: EPUBDocumentLoader, useValue: mk('epub') },
        { provide: PDFDocumentLoader, useValue: mk('pdf') },
        { provide: PPTXDocumentLoader, useValue: mk('pptx') },
        { provide: SRTDocumentLoader, useValue: mk('srt') },
        { provide: UnstructuredDocumentLoader, useValue: mk('unstructured') },
        { provide: NotionDocumentLoader, useValue: mk('notion') },
        { provide: ObsidianDocumentLoader, useValue: mk('obsidian') },
        { provide: OpenAIWhisperAudioLoader, useValue: mk('whisper') },

        { provide: CurlWebLoader, useValue: mk('curl') },
        { provide: HTMLWebLoader, useValue: mk('html') },
        { provide: CheerioWebLoader, useValue: mk('cheerio') },
        { provide: GitHubRepoLoader, useValue: mk('github') },
        { provide: NotionAPIWebLoader, useValue: mk('notionapi') },
        { provide: PlaywrightWebLoader, useValue: mk('playwright') },
        { provide: PuppeteerWebLoader, useValue: mk('puppeteer') },
        { provide: RecursiveUrlWebLoader, useValue: mk('recursive') },
        { provide: S3WebLoader, useValue: mk('s3') },
        { provide: SerpAPIWebLoader, useValue: mk('serpapi') },
        { provide: SitemapWebLoader, useValue: mk('sitemap') },
        { provide: TavilySearchLoader, useValue: mk('tavily') },
        { provide: YouTubeWebLoader, useValue: mk('youtube') },

        { provide: VectorStoreService, useValue: {} },
        { provide: AgentMemory, useValue: {} },
        { provide: LLMService, useValue: {} },
        {
          provide: MyLogger,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    // LoaderService is transient-scoped; use resolve() instead of get()
    service = await moduleRef.resolve(LoaderService);
    curl = moduleRef.get(CurlWebLoader) as any;
    cheerio = moduleRef.get(CheerioWebLoader) as any;
    gh = moduleRef.get(GitHubRepoLoader) as any;
    yt = moduleRef.get(YouTubeWebLoader) as any;
    notionApi = moduleRef.get(NotionAPIWebLoader) as any;
    sitemap = moduleRef.get(SitemapWebLoader) as any;
    playwright = moduleRef.get(PlaywrightWebLoader) as any;
    s3 = moduleRef.get(S3WebLoader) as any;
    logger = moduleRef.get(MyLogger) as any;
  });

  describe('loadFile', () => {
    const makeFile = (name: string, content: string, type = 'text/plain') => {
      // Minimal File-like object sufficient for LoaderService logic and mocks
      return {
        name,
        type,
        size: content.length,
        text: () => Promise.resolve(content),
      } as any;
    };

    it('dispatches to csv/docx/pdf/etc by extension', async () => {
      const pdf = await service.loadFile(
        makeFile('a.pdf', 'X', 'application/pdf'),
      );
      expect(pdf[0].pageContent).toBe('pdf');
      const docx = await service.loadFile(
        makeFile(
          'b.docx',
          'X',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      );
      expect(docx[0].pageContent).toBe('docx');
      const csv = await service.loadFile(
        makeFile('c.csv', 'a,b\n1,2', 'text/csv'),
      );
      expect(csv[0].pageContent).toBe('csv');
      const srt = await service.loadFile(makeFile('d.srt', '...'));
      expect(srt[0].pageContent).toBe('srt');
    });

    it('uses whisper for audio extensions', async () => {
      const mp3 = await service.loadFile(
        makeFile('audio.mp3', 'bin', 'audio/mpeg'),
      );
      expect(mp3[0].pageContent).toBe('whisper');
    });

    it('falls back to plain text and does not throw on error', async () => {
      // Force csv loader to throw
      (service as any).csvLoader.loadBlob.mockRejectedValueOnce(
        new Error('bad'),
      );
      const csv = await service.loadFile(
        makeFile('broken.csv', 'plain text', 'text/csv'),
      );
      expect(csv[0].pageContent).toContain('plain text');
    });

    it('handles other file types: epub and pptx', async () => {
      const epub = await service.loadFile(
        makeFile('book.epub', 'epub-bytes', 'application/epub+zip'),
      );
      expect(epub[0].pageContent).toBe('epub');
      const pptx = await service.loadFile(
        makeFile(
          'slides.pptx',
          'pptx-bytes',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ),
      );
      expect(pptx[0].pageContent).toBe('pptx');
    });

    it('treats txt as plain text and preserves metadata.fileName', async () => {
      const text = await service.loadFile(
        makeFile('notes.txt', 'hello world', 'text/plain'),
      );
      expect(text[0].pageContent).toBe('hello world');
      expect(text[0].metadata).toMatchObject({ fileName: 'notes.txt' });
    });

    it('falls back for unknown extension to plain text with fileName metadata', async () => {
      const docs = await service.loadFile(
        makeFile('data.xyz', 'mystery content', 'application/octet-stream'),
      );
      expect(docs[0].pageContent).toBe('mystery content');
      expect(docs[0].metadata).toMatchObject({ fileName: 'data.xyz' });
    });
  });

  describe('loadWebPage', () => {
    it('routes GitHub URLs to GitHubRepoLoader', async () => {
      const docs = await service.loadWebPage('https://github.com/org/repo');
      expect(gh.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('github');
    });

    it('routes YouTube URLs to YouTubeWebLoader', async () => {
      const docs = await service.loadWebPage('https://youtu.be/abc');
      expect(yt.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('youtube');
    });

    it('routes Notion URLs to NotionAPIWebLoader', async () => {
      const docs = await service.loadWebPage('https://example.notion.so/page');
      expect(notionApi.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('notionapi');
    });

    it('routes sitemap URLs to SitemapWebLoader', async () => {
      const docs = await service.loadWebPage('https://site.com/sitemap.xml');
      expect(sitemap.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('sitemap');
    });

    it('routes JS-heavy sites to Playwright', async () => {
      const docs = await service.loadWebPage('https://react.dev/');
      expect(playwright.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('playwright');
    });

    it('falls back to CurlWebLoader when specialized fails', async () => {
      cheerio.load.mockRejectedValueOnce(new Error('boom'));
      const docs = await service.loadWebPage('https://stackoverflow.com/q/123');
      expect(curl.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('curl');
    });

    it('routes S3 URLs to S3WebLoader', async () => {
      const docs = await service.loadWebPage(
        'https://my-bucket.s3.amazonaws.com/file',
      );
      expect(s3.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('s3');
    });

    it('uses Cheerio for eligible sites when successful', async () => {
      const docs = await service.loadWebPage(
        'https://stackoverflow.com/questions/1',
      );
      expect(cheerio.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('cheerio');
      expect(curl.load).not.toHaveBeenCalled();
    });

    it('defaults to CurlWebLoader for standard sites', async () => {
      const docs = await service.loadWebPage('https://example.com');
      expect(curl.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('curl');
    });

    it('falls back to Curl when specialized returns empty results and emits a warning', async () => {
      gh.load.mockResolvedValueOnce([] as any);
      const docs = await service.loadWebPage('https://github.com/org/repo');
      expect(curl.load).toHaveBeenCalled();
      expect(docs[0].pageContent).toBe('curl');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns an empty array if both specialized and Curl fail', async () => {
      cheerio.load.mockRejectedValueOnce(new Error('specialized-down'));
      curl.load.mockRejectedValueOnce(new Error('curl-down'));
      const docs = await service.loadWebPage('https://stackoverflow.com/q/999');
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
