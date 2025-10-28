import { VectorStoreRepository } from '../repos/store.repository';
import { Embed, VectorStore } from '../entities/store.entity';
import EmbeddingHandler, {
  EmbeddingOptions,
} from '../../embedder/embedder.service';
import {
  ConversationIdType,
  GraphAgentIdType,
  MessageId,
  MessageIdType,
  NodeIdType,
  ReActAgentIdType,
  SnippetId,
  SnippetIdType,
  UserIdType,
  VectorStoreIdType,
} from '@core/infrastructure/database/utils/custom_types';
import {
  TextSplitterConfig,
  TextSplitterType,
} from '../../textsplitters/textsplitter.factory';
import { TextSplitterService } from '../../textsplitters';
import { ConversationRepository } from '../repos/conversation.repository';
import {
  ConversationMessage,
  ConversationSnippet,
} from '../entities/conversation.entity';
import { LLMService } from '../../llm';
import { resourceLoader } from '@common/resources';

import { Inject, Injectable } from '@nestjs/common';
import { MIMEType } from 'util';
import * as crypto from 'crypto';
import BM25 = require('wink-bm25-text-search');
import nlpUtils from 'wink-nlp-utils';
import mongoose from 'mongoose';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface StoreDocumentInput {
  text: string;
  type: MIMEType;
  line?: { start: number; end: number };
  metadata?: Record<string, any>;
}

export interface DocumentSearchResult {
  _id: string;
  score: number;
  document?: VectorStore;
}

export interface ConvoSearchResult {
  _id: string;
  score: number;
  data?: ConversationMessage | ConversationSnippet;
}

@Injectable()
export default class VectorStoreService {
  private bm25Engine: BM25.BM25Engine;
  private embedderConfig!: EmbeddingOptions;
  constructor(
    @Inject(VectorStoreRepository) private readonly repo: VectorStoreRepository,
    @Inject(ConversationRepository)
    private readonly convos: ConversationRepository,
    @Inject(TextSplitterService)
    private readonly textsplitter: TextSplitterService,
    @Inject(LLMService) private readonly llm: LLMService,
    @Inject(EmbeddingHandler) private readonly embedder: EmbeddingHandler,
    private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'VectorStoreService initializing with BM25 engine',
      VectorStoreService.name,
    );

    // initialize BM25 text engine
    this.bm25Engine = BM25();
    this.bm25Engine.defineConfig({ fldWeights: { text: 1 } });
    const tokenizeAndStem = (input: string) =>
      nlpUtils.tokens.stem(nlpUtils.string.tokenize0(input));
    this.bm25Engine.definePrepTasks([tokenizeAndStem]);

    this.logger.info(
      'VectorStoreService initialized with BM25 engine and text processing',
      VectorStoreService.name,
    );
    // Note: defineField and defineExtractor methods don't exist in wink-bm25-text-search v3.1.2
    // Documents are expected to have a 'text' field as specified in the config
  }

  changeEmbedder(embedderConfig: EmbeddingOptions): this {
    this.logger.info(
      `Changing embedder configuration to provider: ${embedderConfig.providerName}, model: ${embedderConfig.modelId}`,
      VectorStoreService.name,
    );
    this.embedderConfig = embedderConfig;
    return this;
  }

  /**
   * Persist the document embedding and raw text, and index text for BM25
   */
  async uploadDocument(
    doc: StoreDocumentInput,
    permissions: { ownerId?: UserIdType; userIds?: UserIdType[] },
    textsplit?: TextSplitterConfig,
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Uploading document: ${doc.metadata?.name || 'unnamed'}, text length: ${doc.text.length}`,
      VectorStoreService.name,
    );

    if (textsplit) {
      this.logger.info(
        `Document will be split using ${textsplit.type} splitter`,
        VectorStoreService.name,
      );
      const splitDocsText = await this.textsplitter.split(
        doc.text,
        textsplit.type,
        textsplit.options,
      );
      const splitDocs: StoreDocumentInput[] = splitDocsText.map(
        (text, _index) => ({
          text: text,
          type: doc.type,
          line: { start: 0, end: 0 },
          metadata: doc.metadata,
        }),
      );
      this.logger.info(
        `Document split into ${splitDocs.length} chunks, creating documents`,
        VectorStoreService.name,
      );
      await this.createDocuments(splitDocs, permissions);
      return;
    }

    // Create a hash of the current date and time and the document name
    const fullHash = crypto
      .createHash('sha256')
      .update(Date.now().toString() + doc.metadata?.name)
      .digest('hex');
    const hash = fullHash.slice(0, 24);

    this.logger.info(
      `Generating embedding for document: ${doc.metadata?.name || 'unnamed'}`,
      VectorStoreService.name,
    );
    const embed = await this.embedder.embed(
      doc.text,
      embedderConfig || this.embedderConfig,
    );

    this.logger.info(
      `Creating document in repository: ${doc.metadata?.name || 'unnamed'}`,
      VectorStoreService.name,
    );
    await this.repo.create({
      embed: embed,
      documentId: hash,
      documentName: doc.metadata?.name || '',
      data: Buffer.from(doc.text),
      mimeType: doc.type,
      metadata: doc.metadata,
      ownerId: permissions.ownerId,
      allowedUserIds: permissions.userIds,
      lines: { start: doc.line?.start || 0, end: doc.line?.end || 0 },
    });

    this.logger.info(
      `Successfully uploaded document: ${doc.metadata?.name || 'unnamed'}`,
      VectorStoreService.name,
    );
  }

  /**
   * Batch create documents, useful for loading text split documents
   */
  async createDocuments(
    docs: StoreDocumentInput[],
    permissions: { ownerId?: UserIdType; userIds?: UserIdType[] },
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    if (docs.length === 0) {
      this.logger.info(
        'No documents to create, skipping batch creation',
        VectorStoreService.name,
      );
      return;
    }

    this.logger.info(
      `Creating batch of ${docs.length} documents`,
      VectorStoreService.name,
    );

    // Validate all documents have the same name
    const docName = docs[0].metadata?.name || '';
    if (docs.some((doc) => (doc.metadata?.name || '') !== docName)) {
      this.logger.error(
        'All documents in batch must have the same name',
        undefined,
        VectorStoreService.name,
      );
      throw new Error('All documents in batch must have the same name');
    }

    const fullHash = crypto
      .createHash('sha256')
      .update(Date.now().toString() + docs[0].metadata?.name)
      .digest('hex');
    const hash = fullHash.slice(0, 24);

    this.logger.info(
      `Generating embeddings for ${docs.length} documents`,
      VectorStoreService.name,
    );
    const embeds = await Promise.all(
      docs.map((doc) =>
        this.embedder.embed(doc.text, embedderConfig || this.embedderConfig),
      ),
    );

    const documents = docs.map((doc, index) => ({
      embed: embeds[index],
      documentId: hash,
      documentName: docName || '',
      data: Buffer.from(doc.text),
      mimeType: doc.type,
      metadata: doc.metadata,
      ownerId: permissions.ownerId,
      allowedUserIds: permissions.userIds,
      lines: { start: doc.line?.start || 0, end: doc.line?.end || 0 },
    }));

    this.logger.info(
      `Creating ${documents.length} documents in repository`,
      VectorStoreService.name,
    );
    documents.forEach((doc) => this.repo.create(doc));

    this.logger.info(
      `Successfully created batch of ${documents.length} documents`,
      VectorStoreService.name,
    );
  }

  /**
   * Update the document embedding and raw text, and index text for BM25
   */
  async updateDocument(
    doc: StoreDocumentInput & { id: VectorStoreIdType },
    permissions: { ownerId?: UserIdType; userIds?: UserIdType[] },
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Updating document ${doc.id}: ${doc.metadata?.name || 'unnamed'}, text length: ${doc.text.length}`,
      VectorStoreService.name,
    );
    try {
      this.logger.info(
        `Generating embedding for document update: ${doc.metadata?.name || 'unnamed'}`,
        VectorStoreService.name,
      );
      const embed = await this.embedder.embed(
        doc.text,
        embedderConfig || this.embedderConfig,
      );

      this.logger.info(
        `Updating document in repository: ${doc.metadata?.name || 'unnamed'}`,
        VectorStoreService.name,
      );
      await this.repo.update(doc.id, {
        _id: doc.id,
        embed: embed,
        documentId: doc.id,
        documentName: doc.metadata?.name || '',
        data: Buffer.from(doc.text),
        mimeType: doc.type,
        metadata: doc.metadata,
        ownerId: permissions.ownerId,
        allowedUserIds: permissions.userIds,
        lines: { start: 0, end: 0 },
      });

      this.logger.info(
        `Successfully updated document: ${doc.metadata?.name || 'unnamed'}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating document ${doc.id}: ${doc.metadata?.name || 'unnamed'}: ${info.message}`,
        info.stack,
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Delete the document embedding and raw text, and index text for BM25
   */
  async deleteDocument(
    docId: VectorStoreIdType,
    userId: UserIdType,
  ): Promise<void> {
    this.logger.info(
      `Deleting document ${docId} by user ${userId}`,
      VectorStoreService.name,
    );
    try {
      // Get the document first to check ownership
      const doc = await this.repo.findById(docId);
      if (!doc) {
        this.logger.warn(
          `Cannot delete document ${docId} - document not found`,
          VectorStoreService.name,
        );
        throw new Error('Document not found');
      }

      // Only allow deletion if the user is the owner
      if (!doc.ownerId || doc.ownerId.toString() !== userId.toString()) {
        this.logger.warn(
          `Unauthorized deletion attempt - user ${userId} is not owner of document ${docId}`,
          VectorStoreService.name,
        );
        throw new Error(
          'Unauthorized: Only the document owner can delete this document',
        );
      }

      this.logger.info(
        `Deleting document ${docId}: ${doc.documentName}`,
        VectorStoreService.name,
      );
      await this.repo.delete(docId);
      this.logger.info(
        `Successfully deleted document ${docId}: ${doc.documentName}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting document ${docId}: ${info.message}`,
        info.stack,
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Find top-K documents by cosine similarity on embeddings
   */
  async semanticSearchDocs(
    query: string,
    topK: number,
    userId: UserIdType,
    options?: { 
      conversationId: ConversationIdType; 
      global: boolean;
      useBertScore?: boolean;
      bertScoreAlpha?: number;
    },
    embedderConfig?: EmbeddingOptions,
  ): Promise<DocumentSearchResult[]> {
    this.logger.info(
      `Performing semantic search for user ${userId}, query length: ${query.length}, topK: ${topK}${options?.useBertScore ? ' (BERT-score enabled)' : ''}`,
      VectorStoreService.name,
    );
    try {
      this.logger.info(
        `Generating embedding for search query`,
        VectorStoreService.name,
      );
      const qEmbed = await this.embedder.embed(
        query,
        embedderConfig || this.embedderConfig,
      );

      let all = await this.repo.findAllByAccess(userId);
      this.logger.info(
        `Found ${all.length} accessible documents for user ${userId}`,
        VectorStoreService.name,
      );

      if (options?.conversationId && !options?.global) {
        const beforeFilter = all.length;
        all = all.filter(
          (doc) =>
            doc.conversationId.toString() === options.conversationId.toString(),
        );
        this.logger.info(
          `Filtered documents from ${beforeFilter} to ${all.length} for conversation ${options.conversationId}`,
          VectorStoreService.name,
        );
      }

      // Use BERT-score search if enabled
      if (options?.useBertScore) {
        this.logger.info(
          `Computing BERT-score similarity for ${all.length} documents`,
          VectorStoreService.name,
        );
        
        const searchResults = options.bertScoreAlpha !== undefined
          ? EmbeddingHandler.searchByHybridScore(
              qEmbed,
              all,
              topK,
              (doc) => doc.embed,
              (doc) => doc.data.toString('utf-8'),
              query,
              options.bertScoreAlpha,
            )
          : EmbeddingHandler.searchByBertScore(
              qEmbed,
              all,
              topK,
              (doc) => doc.embed,
              (doc) => doc.data.toString('utf-8'),
              query,
            );

        const results = searchResults.map((result) => ({
          _id: result.item._id.toString(),
          score: result.score,
          bertScore: result.bertScore,
          combinedScore: result.combinedScore,
          document: result.item,
        }));

        this.logger.info(
          `BERT-score search completed, returning ${results.length} results`,
          VectorStoreService.name,
        );
        return results;
      }

      // Default: Use standard cosine similarity
      this.logger.info(
        `Computing cosine similarity scores for ${all.length} documents`,
        VectorStoreService.name,
      );
      const scores = all.map((doc) => ({
        _id: doc._id.toString(),
        score: EmbeddingHandler.cosineSimilarity(qEmbed, doc.embed),
        document: doc,
      }));

      const results = scores.sort((a, b) => b.score - a.score).slice(0, topK);
      this.logger.info(
        `Semantic search completed, returning ${results.length} results`,
        VectorStoreService.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing semantic conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Find top-K documents by BM25 text match
   */
  async textSearchDocs(
    query: string,
    topK: number,
    userId: UserIdType,
    options?: { conversationId: ConversationIdType; global: boolean },
  ): Promise<DocumentSearchResult[]> {
    this.logger.info(
      `Performing BM25 text search for user ${userId}, query: "${query}", topK: ${topK}`,
      VectorStoreService.name,
    );
    try {
      let all = await this.repo.findAllByAccess(userId);
      this.logger.info(
        `Found ${all.length} accessible documents for user ${userId}`,
        VectorStoreService.name,
      );

      if (options?.conversationId && !options?.global) {
        const beforeFilter = all.length;
        all = all.filter(
          (doc) =>
            doc.conversationId.toString() === options.conversationId.toString(),
        );
        this.logger.info(
          `Filtered documents from ${beforeFilter} to ${all.length} for conversation ${options.conversationId}`,
          VectorStoreService.name,
        );
      }

      if (all.length === 0) {
        this.logger.warn(
          'BM25 text search requested on empty corpus',
          VectorStoreService.name,
        );
        throw new Error('No documents available for text search');
      }

      // Build a fresh BM25 engine per search to avoid cross-run state issues
      const engine = BM25();
      engine.defineConfig({ fldWeights: { text: 1 } });
      // Normalize: lowercase and strip punctuation before tokenization + stemming
      const tokenizeAndStem = (input: string) => {
        const normalized = String(input)
          .toLowerCase()
          .replace(/[^a-z0-9\s]/gi, ' ');
        const tokens = nlpUtils.string.tokenize0(normalized);
        return nlpUtils.tokens.stem(tokens);
      };
      engine.definePrepTasks([tokenizeAndStem]);

      // Ensure all documents from the database are indexed in BM25 engine
      this.logger.info(
        `Indexing ${all.length} documents in BM25 engine`,
        VectorStoreService.name,
      );
      for (const doc of all) {
        const docId = doc._id.toString();
        engine.addDoc({ text: doc.data.toString() }, docId);
      }

      const MIN_DOCS_FOR_BM25 = 3; // wink-bm25-text-search needs a few docs for stable IDF
      let hits: Array<any> = [];
      if (all.length >= MIN_DOCS_FOR_BM25) {
        // Consolidate and then search
        this.logger.info(
          `Consolidating BM25 engine and performing search`,
          VectorStoreService.name,
        );
        engine.consolidate();
        hits = engine.search(query);
      } else {
        // Fallback lightweight scoring for small corpora: overlap count
        const qTokens = tokenizeAndStem(query).filter(Boolean);
        if (qTokens.length === 0) {
          // No meaningful tokens to search; return empty results
          this.logger.info(
            'BM25 fallback: empty/stopword-only query; returning no results',
            VectorStoreService.name,
          );
          return [];
        }
        const overlapScore = (text: string) => {
          const tks = new Set(tokenizeAndStem(text));
          let c = 0;
          for (const qt of qTokens) if (tks.has(qt)) c++;
          return c;
        };
        hits = all
          .map((d) => ({
            id: d._id.toString(),
            value: overlapScore(d.data.toString()),
          }))
          .filter((h) => h.value > 0)
          .sort((a, b) => b.value - a.value);
      }

      // Rescore results using overlap-based fallback, then sort before slicing
      const qTokensForFallback = tokenizeAndStem(query).filter(Boolean);
      const fallbackOverlap = (text: string) => {
        if (qTokensForFallback.length === 0) return 0;
        const tks = new Set(tokenizeAndStem(text));
        let c = 0;
        for (const qt of qTokensForFallback) if (tks.has(qt)) c++;
        return c;
      };

      const rescored = hits.map((h: any) => {
        const doc = all.find((d) => d._id.toString() === h.id);
        const bm25Score =
          typeof h.value === 'number' ? h.value : (h.score ?? 0);
        const fb = doc ? fallbackOverlap(doc.data.toString()) : 0;
        const score = Math.max(bm25Score, fb);
        return {
          _id:
            (h.id as VectorStoreIdType) ??
            (doc?._id.toString() as unknown as VectorStoreIdType),
          score,
          document: doc,
        } as DocumentSearchResult;
      });

      // Sort by final score descending; if all scores are 0 and we have tokens, try pure-overlap fallback across all docs
      let sorted = rescored.sort((a, b) => b.score - a.score);
      if (sorted.every((r) => r.score === 0) && qTokensForFallback.length > 0) {
        // Compute pure-overlap over entire corpus to surface obvious matches
        const fbAll = all
          .map((d) => ({
            _id: d._id.toString() as unknown as VectorStoreIdType,
            score: fallbackOverlap(d.data.toString()),
            document: d,
          }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);
        if (fbAll.length > 0) sorted = fbAll as DocumentSearchResult[];
      }

      const results = sorted.slice(0, topK);

      this.logger.info(
        `BM25 text search completed, returning ${results.length} results`,
        VectorStoreService.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing BM25 conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Hybrid search combining semantic and text scores
   * alpha weights semantic vs BM25 (0 < alpha < 1)
   */
  async hybridSearchDocs(
    query: string,
    topK: number,
    alpha = 0.5,
    userId: UserIdType,
    options?: { conversationId: ConversationIdType; global: boolean },
  ): Promise<DocumentSearchResult[]> {
    this.logger.info(
      `Performing hybrid search for user ${userId}, query: "${query}", topK: ${topK}, alpha: ${alpha}`,
      VectorStoreService.name,
    );
    try {
      this.logger.info(
        `Running semantic search (topK: ${topK * 2})`,
        VectorStoreService.name,
      );
      const sem = await this.semanticSearchDocs(
        query,
        topK * 2,
        userId,
        options,
      );

      this.logger.info(
        `Running BM25 text search (topK: ${topK * 2})`,
        VectorStoreService.name,
      );
      const txt = await this.textSearchDocs(query, topK * 2, userId);

      this.logger.info(
        `Combining ${sem.length} semantic results with ${txt.length} text results`,
        VectorStoreService.name,
      );
      const combined = new Map<string, DocumentSearchResult>();

      sem.forEach((r) => combined.set(r._id, { ...r }));
      txt.forEach((r) => {
        if (combined.has(r._id)) {
          const base = combined.get(r._id)!;
          base.score = alpha * base.score + (1 - alpha) * r.score;
        } else {
          combined.set(r._id, { ...r });
        }
      });

      const merged = Array.from(combined.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      this.logger.info(
        `Ensuring document payloads are loaded for ${merged.length} results`,
        VectorStoreService.name,
      );
      // ensure document payload is loaded
      const results = await Promise.all(
        merged.map(async (r) => {
          if (!r.document) {
            r.document = (await this.repo.findById(r._id as any)) || undefined;
          }
          return r;
        }),
      );

      this.logger.info(
        `Hybrid search completed, returning ${results.length} results`,
        VectorStoreService.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing hybrid conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Find a document by ID
   */
  async searchDocsById(docId: VectorStoreIdType): Promise<VectorStore | null> {
    this.logger.info(
      `Searching for document by ID ${docId}`,
      VectorStoreService.name,
    );
    try {
      const result = await this.repo.findById(docId);
      if (result) {
        this.logger.info(
          `Found document ${docId}: ${result.documentName}`,
          VectorStoreService.name,
        );
      } else {
        this.logger.warn(
          `Document ${docId} not found`,
          VectorStoreService.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error searching for document ${docId}: ${info.message}`,
        info.stack,
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Create a new conversation with optional initial messages and snippets
   */
  async createConversation(
    ownerId: UserIdType,
    agentId: GraphAgentIdType | ReActAgentIdType,
    currentNode: NodeIdType,
    memoryConfig: any,
    options: {
      initialMessages?: Omit<ConversationMessage, '_id' | 'embedding'>[];
      summary: {
        generate: boolean;
        generateEmbed: boolean;
      };
      messages: {
        generateEmbed: boolean;
      };
      snippets: {
        split: boolean;
        generateEmbed: boolean;
        splitType?: TextSplitterType;
        splitOptions?: any;
      };
    },
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Creating conversation for user ${ownerId} with agent ${agentId}, current node: ${currentNode}`,
      VectorStoreService.name,
    );
    this.logger.info(
      `Conversation options - summary: ${options.summary.generate}, messages embed: ${options.messages.generateEmbed}, snippets: ${options.snippets.split}`,
      VectorStoreService.name,
    );
    try {
      // prepare messages with embeddings
      const messages: ConversationMessage[] = [];
      const snippets: ConversationSnippet[] = [];
      let order = 0;
      const initialMessages = options.initialMessages || [];

      this.logger.info(
        `Processing ${initialMessages.length} initial messages`,
        VectorStoreService.name,
      );

      for (const msg of initialMessages) {
        const embed = options.messages.generateEmbed
          ? await this.embedder.embed(
              msg.text,
              embedderConfig || this.embedderConfig,
            )
          : undefined;
        const timestamp = msg.timestamp || new Date().toISOString();
        const message: ConversationMessage = {
          ...msg,
          _id: MessageId.create(new mongoose.Types.ObjectId()),
          embedding: embed,
          order: order++,
          timestamp,
        };
        messages.push(message);

        // split into snippets if splitter provided
        if (options.snippets.splitType && options.snippets.split) {
          const chunks = await this.textsplitter.splitWithLines(
            msg.text,
            options.snippets.splitType,
            options.snippets.splitOptions,
          );
          for (const chunk of chunks) {
            const emb = options.snippets.generateEmbed
              ? await this.embedder.embed(
                  chunk.text,
                  embedderConfig || this.embedderConfig,
                )
              : undefined;
            snippets.push({
              _id: SnippetId.create(new mongoose.Types.ObjectId()),
              parentId: message._id,
              text: chunk.text,
              sender: message.sender,
              position: {
                start: chunk.start,
                end: chunk.end,
              },
              embedding: emb,
            });
          }
        }
      }

      let summary = '';
      let summaryEmbed: Embed | undefined;
      if (options.summary.generate) {
        // Combine messages into conversation text but limit to avoid token overflow
        const MAX_TOKENS_PER_CHUNK = 4000; // Adjust based on your model's limitations
        const messageGroups: ConversationMessage[][] = [];
        let currentGroup: ConversationMessage[] = [];
        let currentTokenCount = 0;

        // Estimate token count (rough approximation: 4 chars ~= 1 token)
        for (const msg of messages) {
          const estimatedTokens = Math.ceil(msg.text.length / 4);
          if (currentTokenCount + estimatedTokens > MAX_TOKENS_PER_CHUNK) {
            messageGroups.push([...currentGroup]);
            currentGroup = [msg];
            currentTokenCount = estimatedTokens;
          } else {
            currentGroup.push(msg);
            currentTokenCount += estimatedTokens;
          }
        }

        // Add last group if not empty
        if (currentGroup.length > 0) {
          messageGroups.push(currentGroup);
        }

        // Generate summary for each chunk
        let chunkSummaries: string[] = [];

        for (let i = 0; i < messageGroups.length; i++) {
          const group = messageGroups[i];
          const conversationText = group
            .map((msg) => `${msg.sender}: ${msg.text}`)
            .join('\n');

          const payload: BaseMessage[] = [
            new SystemMessage({
              content: `${resourceLoader.getFile<string>('summary.txt', { subDir: 'prompts' })}`,
            }),
            new HumanMessage({
              content: `Write a concise summary of the following conversation section (${i + 1}/${messageGroups.length}): \n\n${conversationText}`,
            }),
          ];

          const chunkSummary = await this.llm
            .chat(payload, {})
            .then((result: any) => result.response.toString());
          chunkSummaries.push(chunkSummary);
        }

        // If there were multiple chunks, create a final combined summary
        if (chunkSummaries.length > 1) {
          const combinedSummariesText = chunkSummaries.join('\n\n');
          const finalPayload: BaseMessage[] = [
            new SystemMessage({
              content: `${resourceLoader.getFile<string>('summary.txt', { subDir: 'prompts' })}`,
            }),
            new HumanMessage({
              content: `Combine these partial summaries into one coherent summary:\n\n${combinedSummariesText}`,
            }),
          ];

          summary = await this.llm
            .chat(finalPayload, {})
            .then((result: any) => result.response.toString());
        } else {
          summary = chunkSummaries[0] || '';
        }

        summaryEmbed = options.summary.generateEmbed
          ? await this.embedder.embed(
              summary,
              embedderConfig || this.embedderConfig,
            )
          : undefined;
      }
      this.logger.info(
        `Creating conversation with ${messages.length} messages, ${snippets.length} snippets, summary length: ${summary.length}`,
        VectorStoreService.name,
      );
      await this.convos.create({
        ownerId,
        agentId,
        currentNode,
        memoryConfig,
        messages,
        snippets,
        summary: { data: summary, embedding: summaryEmbed },
      });

      this.logger.info(
        `Successfully created conversation for user ${ownerId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating conversation for user ${ownerId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Add a new message to an existing conversation, split into snippets and embed
   */
  async addMessage(
    conversationId: ConversationIdType,
    msg: Omit<ConversationMessage, '_id' | 'embedding'>,
    generateMessageEmbed: boolean,
    snippets: boolean,
    generateSnippetEmbeds: boolean,
    snippetSplitType?: TextSplitterType,
    snippetSplitOptions?: any,
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Adding message to conversation ${conversationId}, sender: ${msg.sender}, text length: ${msg.text.length}`,
      VectorStoreService.name,
    );
    this.logger.info(
      `Message options - embed: ${generateMessageEmbed}, snippets: ${snippets}, snippet embeds: ${generateSnippetEmbeds}`,
      VectorStoreService.name,
    );
    try {
      const conv = await this.convos.findById(conversationId);
      if (!conv) {
        this.logger.warn(
          `Cannot add message - conversation ${conversationId} not found`,
          VectorStoreService.name,
        );
        throw new Error('Conversation not found');
      }
      // embed message
      const embed = generateMessageEmbed
        ? await this.embedder.embed(
            msg.text,
            embedderConfig || this.embedderConfig,
          )
        : undefined;
      const timestamp = msg.timestamp || new Date().toISOString();
      const newMsg: ConversationMessage = {
        ...msg,
        _id: MessageId.create(new mongoose.Types.ObjectId()),
        embedding: embed,
        order: conv.messages.length,
        timestamp,
      };
      // build update arrays
      const newSnips: ConversationSnippet[] = [];
      if (snippetSplitType && snippets) {
        const chunks = await this.textsplitter.splitWithLines(
          msg.text,
          snippetSplitType,
          snippetSplitOptions,
        );
        for (const chunk of chunks) {
          const emb = generateSnippetEmbeds
            ? await this.embedder.embed(
                chunk.text,
                embedderConfig || this.embedderConfig,
              )
            : undefined;
          newSnips.push({
            _id: SnippetId.create(new mongoose.Types.ObjectId()),
            parentId: newMsg._id,
            text: chunk.text,
            sender: newMsg.sender,
            position: {
              start: chunk.start,
              end: chunk.end,
            },
            embedding: emb,
          });
        }
      }
      // update conversation
      this.logger.info(
        `Updating conversation ${conversationId} with new message and ${newSnips.length} snippets`,
        VectorStoreService.name,
      );
      await this.convos.update(conversationId, {
        messages: [...conv.messages, newMsg],
        snippets: [...(conv.snippets || []), ...newSnips],
        updatedAt: new Date().toISOString(),
      });

      this.logger.info(
        `Successfully added message to conversation ${conversationId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error adding message to conversation ${conversationId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Generate snippets from existing messages in a conversation
   */
  async generateSnippets(
    conversationId: ConversationIdType,
    snippetSplitType: TextSplitterType,
    generateEmbeds: boolean,
    snippetSplitOptions?: any,
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Generating snippets for conversation ${conversationId} using ${snippetSplitType} splitter, generate embeds: ${generateEmbeds}`,
      VectorStoreService.name,
    );
    try {
      const conv = await this.convos.findById(conversationId);
      if (!conv) {
        this.logger.warn(
          `Cannot generate snippets - conversation ${conversationId} not found`,
          VectorStoreService.name,
        );
        throw new Error('Conversation not found');
      }

      // Create a set of message IDs that already have snippets
      const messagesWithSnippets = new Set(
        (conv.snippets || []).map(
          (snippet: { parentId: { toString: () => any } }) =>
            snippet.parentId.toString(),
        ),
      );

      const snippets: ConversationSnippet[] = [];
      for (const msg of conv.messages) {
        // Skip if this message already has snippets
        if (messagesWithSnippets.has(msg._id.toString())) {
          continue;
        }

        const chunks = await this.textsplitter.splitWithLines(
          msg.text,
          snippetSplitType,
          snippetSplitOptions,
        );
        for (const chunk of chunks) {
          const emb = generateEmbeds
            ? await this.embedder.embed(
                chunk.text,
                embedderConfig || this.embedderConfig,
              )
            : undefined;
          snippets.push({
            _id: SnippetId.create(new mongoose.Types.ObjectId()),
            parentId: msg._id,
            text: chunk.text,
            sender: msg.sender,
            position: {
              start: chunk.start,
              end: chunk.end,
            },
            embedding: emb,
          });
        }
      }

      // update conversation
      this.logger.info(
        `Updating conversation ${conversationId} with ${snippets.length} new snippets`,
        VectorStoreService.name,
      );
      await this.convos.update(conversationId, {
        snippets: [...(conv.snippets || []), ...snippets],
      });

      this.logger.info(
        `Successfully generated ${snippets.length} snippets for conversation ${conversationId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error generating snippets for conversation ${conversationId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Get the document by ID
   */
  async attachEmbeddingsToConversation(
    conversationId: ConversationIdType,
    embedIn: { summary: boolean; messages: boolean; snippets: boolean },
    permissions: { ownerId?: UserIdType; userIds?: UserIdType[] },
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Attaching embeddings to conversation ${conversationId}, embed options: summary=${embedIn.summary}, messages=${embedIn.messages}, snippets=${embedIn.snippets}`,
      VectorStoreService.name,
    );
    try {
      const doc = await this.convos.findById(conversationId);
      if (!doc) {
        this.logger.warn(
          `Cannot attach embeddings - conversation ${conversationId} not found`,
          VectorStoreService.name,
        );
        throw new Error('Document not found');
      }
      if (
        !doc.ownerId ||
        doc.ownerId.toString() !== permissions.ownerId?.toString()
      ) {
        this.logger.warn(
          `Unauthorized embedding attachment attempt - user ${permissions.ownerId} is not owner of conversation ${conversationId}`,
          VectorStoreService.name,
        );
        throw new Error(
          'Unauthorized: Only the document owner can attach embeddings',
        );
      }
      if (!embedIn.summary && !embedIn.messages && !embedIn.snippets) {
        this.logger.warn(
          `No embeddings to attach for conversation ${conversationId}`,
          VectorStoreService.name,
        );
        throw new Error('No embeddings to attach');
      }

      // Summary embedding
      let summaryResult = doc.summary;
      if (embedIn.summary && !doc.summary.embedding) {
        const summaryEmbed = await this.embedder.embed(
          doc.summary.data,
          embedderConfig || this.embedderConfig,
        );
        summaryResult = {
          data: doc.summary.data,
          embedding: summaryEmbed,
        };
      }

      // Message embeddings
      let messagesResult = doc.messages;
      if (embedIn.messages) {
        const updatedMessages: typeof doc.messages = [];
        for (const msg of doc.messages) {
          if (!msg.embedding && msg.text) {
            const embed = await this.embedder.embed(
              msg.text,
              embedderConfig || this.embedderConfig,
            );
            updatedMessages.push({ ...msg, embedding: embed });
          } else {
            updatedMessages.push(msg);
          }
        }
        messagesResult = updatedMessages;
      }

      // Snippet embeddings
      let snippetsResult = doc.snippets;
      if (embedIn.snippets && doc.snippets) {
        const updatedSnippets: typeof doc.snippets = [];
        for (const snip of doc.snippets) {
          if (!snip.embedding && snip.text) {
            const embed = await this.embedder.embed(
              snip.text,
              embedderConfig || this.embedderConfig,
            );
            updatedSnippets.push({ ...snip, embedding: embed });
          } else {
            updatedSnippets.push(snip);
          }
        }
        snippetsResult = updatedSnippets;
      }

      this.logger.info(
        `Updating conversation ${conversationId} with embeddings`,
        VectorStoreService.name,
      );
      await this.convos.update(conversationId, {
        summary: summaryResult,
        messages: messagesResult,
        snippets: snippetsResult,
      });

      this.logger.info(
        `Successfully attached embeddings to conversation ${conversationId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error attaching embeddings to conversation ${conversationId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Update existing conversation metadata or summary
   */
  async updateConversation(
    conversationId: ConversationIdType,
    update: Partial<{
      currentNode: string;
      memoryConfig: any;
      summary: { data: string; embedding?: Embed };
    }>,
    embedderConfig?: EmbeddingOptions,
  ): Promise<void> {
    this.logger.info(
      `Updating conversation ${conversationId}`,
      VectorStoreService.name,
    );
    try {
      // embed summary if provided
      if (update.summary && update.summary.data) {
        this.logger.info(
          `Generating embedding for conversation summary update`,
          VectorStoreService.name,
        );
        const emb = await this.embedder.embed(
          update.summary.data,
          embedderConfig || this.embedderConfig,
        );
        update.summary.embedding = emb;
      }

      this.logger.info(
        `Updating conversation ${conversationId} in repository`,
        VectorStoreService.name,
      );
      await this.convos.update(conversationId, update as any);

      this.logger.info(
        `Successfully updated conversation ${conversationId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating conversation ${conversationId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Delete a conversation by ID
   */
  async deleteConversation(
    conversationId: ConversationIdType,
    ownerId: UserIdType,
  ): Promise<void> {
    this.logger.info(
      `Deleting conversation ${conversationId} by user ${ownerId}`,
      VectorStoreService.name,
    );
    try {
      const conv = await this.convos.findById(conversationId);
      if (!conv) {
        this.logger.warn(
          `Cannot delete conversation ${conversationId} - conversation not found`,
          VectorStoreService.name,
        );
        throw new Error('Conversation not found');
      }
      if (conv.ownerId.toString() !== ownerId.toString()) {
        this.logger.warn(
          `Unauthorized deletion attempt - user ${ownerId} is not owner of conversation ${conversationId}`,
          VectorStoreService.name,
        );
        throw new Error('Unauthorized');
      }

      this.logger.info(
        `Deleting conversation ${conversationId}`,
        VectorStoreService.name,
      );
      await this.convos.delete(conversationId);

      this.logger.info(
        `Successfully deleted conversation ${conversationId}`,
        VectorStoreService.name,
      );
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting conversation ${conversationId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw error;
    }
  }

  /**
   * Find top-K messages by cosine similarity on embeddings
   */
  async semanticSearchConvo(
    query: string,
    topK: number,
    userId: UserIdType,
    useSnippets: boolean = false,
    embedderConfig?: EmbeddingOptions,
    useBertScore: boolean = false,
    bertScoreAlpha?: number,
  ): Promise<ConvoSearchResult[]> {
    this.logger.info(
      `Performing semantic conversation search for user ${userId}, query length: ${query.length}, topK: ${topK}, useSnippets: ${useSnippets}${useBertScore ? ' (BERT-score enabled)' : ''}`,
      VectorStoreService.name,
    );
    try {
      this.logger.info(
        `Generating embedding for conversation search query`,
        VectorStoreService.name,
      );
      const qEmbed = await this.embedder.embed(
        query,
        embedderConfig || this.embedderConfig,
      );

      const all = await this.convos.findAllByUserId(userId);
      this.logger.info(
        `Found ${all.length} conversations for user ${userId}`,
        VectorStoreService.name,
      );

      const data: ConversationSnippet[] | ConversationMessage[] = useSnippets
        ? (all.flatMap((doc) => doc.snippets) as ConversationSnippet[])
        : all.flatMap((doc) => doc.messages);

      this.logger.info(
        `Processing ${data.length} ${useSnippets ? 'snippets' : 'messages'} for semantic search`,
        VectorStoreService.name,
      );

      // Use BERT-score if enabled
      if (useBertScore) {
        this.logger.info(
          `Computing BERT-score similarity for ${data.length} ${useSnippets ? 'snippets' : 'messages'}`,
          VectorStoreService.name,
        );

        const validData = data.filter((chunk) => chunk.embedding);
        
        const searchResults = bertScoreAlpha !== undefined
          ? EmbeddingHandler.searchByHybridScore(
              qEmbed,
              validData,
              topK,
              (chunk) => chunk.embedding!,
              (chunk) => 'content' in chunk ? chunk.content : (chunk as any).text || '',
              query,
              bertScoreAlpha,
            )
          : EmbeddingHandler.searchByBertScore(
              qEmbed,
              validData,
              topK,
              (chunk) => chunk.embedding!,
              (chunk) => 'content' in chunk ? chunk.content : (chunk as any).text || '',
              query,
            );

        const results = searchResults.map((result) => ({
          _id: result.item._id.toString(),
          score: result.score,
          bertScore: result.bertScore,
          combinedScore: result.combinedScore,
          document: result.item,
        }));

        this.logger.info(
          `BERT-score conversation search completed, returning ${results.length} results`,
          VectorStoreService.name,
        );
        return results;
      }

      // Default: Use standard cosine similarity
      const scores = all.flatMap((_doc) =>
        data.map((chunk) => ({
          _id: chunk._id.toString(),
          score: chunk.embedding
            ? EmbeddingHandler.cosineSimilarity(qEmbed, chunk.embedding)
            : -1,
          document: chunk,
        })),
      );

      const results = scores.sort((a, b) => b.score - a.score).slice(0, topK);
      this.logger.info(
        `Semantic conversation search completed, returning ${results.length} results`,
        VectorStoreService.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing semantic conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Find top-K messages by BM25 text match
   */
  async textSearchConvo(
    query: string,
    topK: number,
    userId: UserIdType,
    useSnippets: boolean = false,
  ): Promise<ConvoSearchResult[]> {
    this.logger.info(
      `Performing BM25 conversation search for user ${userId}, query: "${query}", topK: ${topK}, useSnippets: ${useSnippets}`,
      VectorStoreService.name,
    );
    try {
      const all = await this.convos.findAllByUserId(userId);
      this.logger.info(
        `Found ${all.length} conversations for user ${userId}`,
        VectorStoreService.name,
      );

      const results = all.flatMap((doc) => {
        // Ensure all messages from the conversation are indexed in BM25 engine
        const data: ConversationSnippet[] | ConversationMessage[] = useSnippets
          ? doc.snippets!
          : doc.messages;

        this.logger.info(
          `Indexing ${data.length} ${useSnippets ? 'snippets' : 'messages'} from conversation ${doc._id} in BM25 engine`,
          VectorStoreService.name,
        );
        for (const chunk of data) {
          this.bm25Engine.addDoc({ text: chunk.text }, chunk._id.toString());
        }

        this.bm25Engine.consolidate();
        const hits = this.bm25Engine.search(query);
        return hits.slice(0, topK).map((h: any) => ({
          _id: h.id as MessageIdType | SnippetIdType,
          score: h.value as number,
          data: data.find((d) => d._id.toString() === (h.id as string))!,
        }));
      });

      // Clear the BM25 engine after search to prevent duplicate entries
      this.bm25Engine.reset();

      this.logger.info(
        `BM25 conversation search completed, returning ${results.length} results`,
        VectorStoreService.name,
      );
      return results;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing BM25 conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Hybrid search combining semantic and text scores
   * alpha weights semantic vs BM25 (0 < alpha < 1)
   */
  async hybridSearchConvo(
    query: string,
    topK: number,
    alpha = 0.5,
    userId: UserIdType,
    useSnippets: boolean = false,
    embedderConfig?: EmbeddingOptions,
  ): Promise<ConvoSearchResult[]> {
    this.logger.info(
      `Performing hybrid conversation search for user ${userId}, query: "${query}", topK: ${topK}, alpha: ${alpha}, useSnippets: ${useSnippets}`,
      VectorStoreService.name,
    );
    try {
      this.logger.info(
        `Running semantic conversation search (topK: ${topK * 2})`,
        VectorStoreService.name,
      );
      const sem = await this.semanticSearchConvo(
        query,
        topK * 2,
        userId,
        useSnippets,
        embedderConfig,
      );

      this.logger.info(
        `Running BM25 conversation search (topK: ${topK * 2})`,
        VectorStoreService.name,
      );
      const txt = await this.textSearchConvo(
        query,
        topK * 2,
        userId,
        useSnippets,
      );

      this.logger.info(
        `Combining ${sem.length} semantic results with ${txt.length} text results`,
        VectorStoreService.name,
      );
      const combined = new Map<string, ConvoSearchResult>();

      sem.forEach((r) => combined.set(r._id, { ...r }));
      txt.forEach((r) => {
        if (combined.has(r._id)) {
          const base = combined.get(r._id)!;
          base.score = alpha * base.score + (1 - alpha) * r.score;
        } else {
          combined.set(r._id, { ...r });
        }
      });

      const merged = Array.from(combined.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      this.logger.info(
        `Ensuring conversation data payloads are loaded for ${merged.length} results`,
        VectorStoreService.name,
      );
      this.convos.findAllByUserId(userId).then((all) => {
        const allSnippets = all.flatMap((doc) => doc.snippets);
        const allMessages = all.flatMap((doc) => doc.messages);

        merged.forEach((r) => {
          if (useSnippets) {
            const snippet = allSnippets.find(
              (s) => s!._id.toString() === r._id,
            );
            if (snippet) r.data = snippet;
          } else {
            const message = allMessages.find((m) => m._id.toString() === r._id);
            if (message) r.data = message;
          }
        });
      });

      this.logger.info(
        `Hybrid conversation search completed, returning ${merged.length} results`,
        VectorStoreService.name,
      );
      return merged;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error performing hybrid conversation search for user ${userId}: ${info.message}\n` +
          (info.stack || ''),
        VectorStoreService.name,
      );
      throw new Error(info.message);
    }
  }
}
