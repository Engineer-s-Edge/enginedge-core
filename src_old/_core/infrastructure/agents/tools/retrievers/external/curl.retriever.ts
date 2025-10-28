import { BaseRetriever } from '../../base/BaseRetriever';
import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { ToolOutput, RAGConfig, ToolCall } from '../../toolkit.interface';
import { CurlWebLoader } from '@core/infrastructure/agents/components/loaders/web/curl';
import { MyLogger } from '@core/services/logger/logger.service';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface CurlArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  data?: any;
  timeoutMs?: number;
  crawl?: {
    enabled: boolean;
    maxDepth?: number;
    maxPages?: number;
    sameDomainOnly?: boolean;
  };
}

interface CurlOutput extends ToolOutput {
  data: any;
}

export class CurlRetriever extends BaseRetriever<CurlArgs, CurlOutput> {
  _id: ToolIdType = 't_000000000000000000000310' as unknown as ToolIdType;
  name = 'curl.retrieve';
  description =
    'Fetch a webpage (and optionally crawl links to limited depth).';
  useCase = 'Retrieve web content for analysis/RAG.';

  constructor(
    logger: MyLogger,
    private loader = new CurlWebLoader(logger),
  ) {
    super({
      similarity: 0.5,
      similarityModifiable: false,
      top_k: 10,
      top_kModifiable: true,
      optimize: true,
    });
  }

  inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['url'],
    properties: {
      url: { type: 'string' },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
      },
      headers: { type: 'object' },
      data: {},
      timeoutMs: { type: 'number' },
      ragConfig: { type: 'object' },
      crawl: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          maxDepth: { type: 'number' },
          maxPages: { type: 'number' },
          sameDomainOnly: { type: 'boolean' },
        },
      },
    },
  };
  outputSchema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, data: {} },
  };
  invocationExample = [
    { name: 'curl.retrieve', args: { url: 'https://example.com' } } as ToolCall,
  ];
  retries = 0;
  errorEvent = [];
  parallel = true;
  concatenate = (r: string | any[]) => r[r.length - 1];
  maxIterations = 1;
  pauseBeforeUse = false;
  userModifyQuery = false;

  private async fetchOne(url: string, headers?: Record<string, string>) {
    this.logger.info(`Fetching one webpage: ${url}`, this.constructor.name);
    this.logger.debug(
      `Headers: ${JSON.stringify(headers)}`,
      this.constructor.name,
    );
    const docs = await this.loader.load(url, {
      headers,
      method: 'GET',
      timeout: 10000,
      extractMetadata: true,
    });
    return docs.map((d) => ({ content: d.pageContent, metadata: d.metadata }));
  }

  private extractLinks(
    html: string,
    baseUrl: string,
    sameDomainOnly: boolean,
  ): string[] {
    this.logger.info(
      `Extracting links from HTML: ${html}`,
      this.constructor.name,
    );
    this.logger.debug(`Base URL: ${baseUrl}`, this.constructor.name);
    this.logger.debug(
      `Same domain only: ${sameDomainOnly}`,
      this.constructor.name,
    );
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);
    const links = new Set<string>();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = new URL(href, baseUrl);
        if (sameDomainOnly && abs.hostname !== base.hostname) return;
        if (abs.protocol.startsWith('http')) links.add(abs.toString());
      } catch {}
    });
    return Array.from(links);
  }

  protected async retrieve(
    args: CurlArgs & { ragConfig: RAGConfig },
  ): Promise<CurlOutput> {
    this.logger.info(`Retrieving webpage: ${args.url}`, this.constructor.name);
    this.logger.debug(`Args: ${JSON.stringify(args)}`, this.constructor.name);
    const crawl = args.crawl?.enabled;
    if (!crawl) {
      const items = await this.fetchOne(args.url, args.headers);
      return {
        data: { ok: true, data: items } as any,
        mimeType: 'application/json' as any,
      };
    }

    // Shallow crawler
    const maxDepth = args.crawl?.maxDepth ?? 1;
    const maxPages = args.crawl?.maxPages ?? (args.ragConfig.top_k || 10);
    const sameDomainOnly = args.crawl?.sameDomainOnly ?? true;

    // Fetch seed raw HTML for link extraction
    const res = await axios.get(args.url, {
      headers: args.headers,
      timeout: args.timeoutMs || 10000,
    });
    const seedHtml =
      typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const seedLinks = this.extractLinks(seedHtml, args.url, sameDomainOnly);

    const queue: Array<{ url: string; depth: number }> = seedLinks.map((u) => ({
      url: u,
      depth: 1,
    }));
    const visited = new Set<string>([args.url]);
    const results: any[] = [];

    // Include the seed page content as well
    try {
      const seedDocs = await this.fetchOne(args.url, args.headers);
      results.push(...seedDocs);
      this.logger.info(
        `Seed page content fetched: ${seedDocs.length} documents`,
        this.constructor.name,
      );
      this.logger.debug(
        `Seed docs: ${JSON.stringify(seedDocs)}`,
        this.constructor.name,
      );
    } catch {}

    while (queue.length > 0 && results.length < maxPages) {
      const { url, depth } = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      this.logger.info(`Fetching webpage: ${url}`, this.constructor.name);
      this.logger.debug(
        `Headers: ${JSON.stringify(args.headers)}`,
        this.constructor.name,
      );
      try {
        const docs = await this.fetchOne(url, args.headers);
        results.push(...docs);
        this.logger.info(`Webpage fetched: ${url}`, this.constructor.name);
        this.logger.debug(
          `Docs: ${JSON.stringify(docs)}`,
          this.constructor.name,
        );
        if (depth < maxDepth) {
          const raw = await axios.get(url, {
            headers: args.headers,
            timeout: args.timeoutMs || 10000,
          });
          const html =
            typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data);
          const more = this.extractLinks(html, url, sameDomainOnly);
          this.logger.info(
            `Extracted links: ${more.length}`,
            this.constructor.name,
          );
          this.logger.debug(
            `Links: ${JSON.stringify(more)}`,
            this.constructor.name,
          );
          for (const link of more) {
            if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
          }
        }
      } catch {}
    }

    return {
      data: { ok: true, data: results.slice(0, maxPages) } as any,
      mimeType: 'application/json' as any,
    };
  }
}

export default CurlRetriever;
