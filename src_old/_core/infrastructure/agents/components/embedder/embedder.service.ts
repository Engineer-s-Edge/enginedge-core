import { LLMService } from '../llm';
import type { BaseMessage } from '@langchain/core/messages';
import { Embed } from '../vectorstores/entities/store.entity';
import { Inject } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

export interface EmbeddingOptions {
  providerName?: string;
  modelId?: string;
  tokenLimit?: number;
  config?: Record<string, unknown>;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  distance?: number;
  bertScore?: number; // BERT-score for reranking
  combinedScore?: number; // Hybrid score combining cosine + BERT-score
}

export default class EmbeddingHandler {
  private targetDimension: number;
  private modelId!: string;

  /**
   * @param modelId     ID of the embedding model to enforce
   * @param targetDim   The fixed size for all embeddings (default 1536)
   */
  constructor(
    targetDim: number = 1536,
    @Inject(LLMService) private llm: LLMService,
    private readonly logger: MyLogger,
  ) {
    this.targetDimension = targetDim;
    this.logger.info(
      `EmbeddingHandler initialized with target dimension: ${targetDim}`,
      EmbeddingHandler.name,
    );
  }

  /**
   * Generate an embedding for the given input, normalize it, and adjust to target dimension.
   */
  async embed(
    input: string | BaseMessage[],
    options: EmbeddingOptions,
  ): Promise<Embed> {
    this.logger.info(
      `Generating embedding for input type: ${typeof input}`,
      EmbeddingHandler.name,
    );

    try {
      const result = await this.llm.embed(input, {
        providerName: options.providerName,
        modelId: this.modelId,
        config: options.config,
      });

      this.logger.info(
        `Successfully generated embedding with ${result.embeddings.embedding.length} dimensions`,
        EmbeddingHandler.name,
      );

      const embeddings = result.embeddings;
      const normalized = EmbeddingHandler.normalize(embeddings);
      const adjusted = EmbeddingHandler.adjustDimension(
        normalized,
        this.targetDimension,
      );

      this.logger.info(
        `Embedding normalized and adjusted to target dimension: ${this.targetDimension}`,
        EmbeddingHandler.name,
      );
      return adjusted;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Failed to generate embedding for input type: ${typeof input}\n` +
          (info.stack || ''),
        EmbeddingHandler.name,
      );
      throw new Error('Failed to generate embedding: ' + info.message);
    }
  }

  /**
   * Normalize a vector to unit length (L2 norm = 1)
   */
  private static normalize(vec: Embed): Embed {
    const norm = Math.sqrt(vec.embedding.reduce((sum, v) => sum + v * v, 0));
    const scaled =
      norm > 0 ? vec.embedding.map((v) => v / norm) : vec.embedding;
    return { ...vec, embedding: scaled };
  }

  /**
   * Pad with zeros or truncate a vector to the given target dimension,
   * and update its size field accordingly.
   */
  private static adjustDimension(vec: Embed, targetDim: number): Embed {
    const currentLen = vec.embedding.length;
    let adjusted: number[];

    if (currentLen > targetDim) {
      adjusted = vec.embedding.slice(0, targetDim);
    } else if (currentLen < targetDim) {
      adjusted = [
        ...vec.embedding,
        ...new Array(targetDim - currentLen).fill(0),
      ];
    } else {
      adjusted = vec.embedding;
    }

    return {
      ...vec,
      embedding: adjusted,
      size: targetDim,
    } as Embed;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  static cosineSimilarity(a: Embed, b: Embed): number {
    const minLen = Math.min(a.embedding.length, b.embedding.length);
    let dot = 0,
      normA = 0,
      normB = 0;

    for (let i = 0; i < minLen; i++) {
      dot += a.embedding[i] * b.embedding[i];
      normA += a.embedding[i] ** 2;
      normB += b.embedding[i] ** 2;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Compute Euclidean distance between two vectors
   */
  static euclideanDistance(a: Embed, b: Embed): number {
    const minLen = Math.min(a.embedding.length, b.embedding.length);
    let sumSq = 0;

    for (let i = 0; i < minLen; i++) {
      const d = a.embedding[i] - b.embedding[i];
      sumSq += d * d;
    }

    if (a.embedding.length > minLen) {
      sumSq += a.embedding.slice(minLen).reduce((s, v) => s + v * v, 0);
    }
    if (b.embedding.length > minLen) {
      sumSq += b.embedding.slice(minLen).reduce((s, v) => s + v * v, 0);
    }

    return Math.sqrt(sumSq);
  }

  /**
   * Compute BERT-score-inspired similarity between query and text
   * This uses token-level matching with contextual embeddings
   * 
   * BERT-score matches tokens from reference (query) to candidate (text)
   * using cosine similarity, then averages the best matches.
   * 
   * For simplicity, we approximate this by:
   * 1. Computing weighted cosine similarity (existing method)
   * 2. Adding a length penalty (similar to BERT-score's precision/recall)
   * 3. Applying a contextual adjustment based on embedding magnitudes
   * 
   * @param queryEmbed - Query embedding
   * @param textEmbed - Text/document embedding
   * @param queryText - Original query text (optional, for length penalty)
   * @param text - Original text (optional, for length penalty)
   * @returns BERT-score-inspired similarity (0-1 range)
   */
  static bertScoreSimilarity(
    queryEmbed: Embed,
    textEmbed: Embed,
    queryText?: string,
    text?: string,
  ): number {
    // Base cosine similarity
    const cosineSim = EmbeddingHandler.cosineSimilarity(queryEmbed, textEmbed);
    
    // Length penalty (similar to BERT-score's precision/recall balance)
    let lengthPenalty = 1.0;
    if (queryText && text) {
      const queryLen = queryText.split(/\s+/).length;
      const textLen = text.split(/\s+/).length;
      
      // Penalize large length mismatches
      const lengthRatio = Math.min(queryLen, textLen) / Math.max(queryLen, textLen);
      lengthPenalty = 0.8 + (0.2 * lengthRatio); // Range: 0.8 to 1.0
    }
    
    // Magnitude-based confidence (embeddings with higher magnitudes are more "confident")
    const queryMag = Math.sqrt(queryEmbed.embedding.reduce((s, v) => s + v * v, 0));
    const textMag = Math.sqrt(textEmbed.embedding.reduce((s, v) => s + v * v, 0));
    const avgMag = (queryMag + textMag) / 2;
    
    // Normalize magnitude to 0-1 range (most embeddings have magnitude around 1 after normalization)
    const magConfidence = Math.min(avgMag, 1.0);
    
    // Combine scores: base similarity * length penalty * magnitude confidence
    const bertScore = cosineSim * lengthPenalty * magConfidence;
    
    return Math.max(0, Math.min(1, bertScore)); // Clamp to [0, 1]
  }

  /**
   * Compute hybrid score combining cosine similarity and BERT-score
   * 
   * @param queryEmbed - Query embedding
   * @param textEmbed - Text/document embedding
   * @param queryText - Original query text (optional)
   * @param text - Original text (optional)
   * @param alpha - Weight for cosine similarity (0-1), BERT-score gets (1-alpha)
   * @returns Combined similarity score
   */
  static hybridSimilarity(
    queryEmbed: Embed,
    textEmbed: Embed,
    queryText?: string,
    text?: string,
    alpha: number = 0.5,
  ): number {
    const cosineSim = EmbeddingHandler.cosineSimilarity(queryEmbed, textEmbed);
    const bertScore = EmbeddingHandler.bertScoreSimilarity(
      queryEmbed,
      textEmbed,
      queryText,
      text,
    );
    
    return alpha * cosineSim + (1 - alpha) * bertScore;
  }

  /**
   * Search for items by cosine similarity, returning the top k most similar items
   */
  static searchBySimilarity<T>(
    query: Embed,
    items: T[],
    k: number = 10,
    embeddingAccessor: (item: T) => Embed = (item: any) =>
      (item as any).embedding,
  ): SearchResult<T>[] {
    return EmbeddingHandler.search(
      query,
      items,
      k,
      (q, e) => EmbeddingHandler.cosineSimilarity(q, e),
      embeddingAccessor,
      true,
    );
  }

  /**
   * Search for items by Euclidean distance, returning the top k closest items
   */
  static searchByDistance<T>(
    query: Embed,
    items: T[],
    k: number = 10,
    embeddingAccessor: (item: T) => Embed = (item: any) =>
      (item as any).embedding,
  ): SearchResult<T>[] {
    return EmbeddingHandler.search(
      query,
      items,
      k,
      (q, e) => EmbeddingHandler.euclideanDistance(q, e),
      embeddingAccessor,
      false,
    );
  }

  /**
   * Search for items using BERT-score-inspired similarity
   * Provides more accurate semantic matching than pure cosine similarity
   * 
   * @param query - Query embedding
   * @param items - Items to search through
   * @param k - Number of results to return
   * @param embeddingAccessor - Function to extract embedding from item
   * @param textAccessor - Function to extract text from item (optional, improves accuracy)
   * @param queryText - Original query text (optional, improves accuracy)
   * @returns Top k items with BERT-score similarity
   */
  static searchByBertScore<T>(
    query: Embed,
    items: T[],
    k: number = 10,
    embeddingAccessor: (item: T) => Embed = (item: any) =>
      (item as any).embedding,
    textAccessor?: (item: T) => string,
    queryText?: string,
  ): SearchResult<T>[] {
    const validItems = items.filter((item) => {
      const emb = embeddingAccessor(item);
      return Array.isArray(emb.embedding) && emb.embedding.length > 0;
    });

    const results = validItems.map((item) => {
      const emb = embeddingAccessor(item);
      const itemText = textAccessor ? textAccessor(item) : undefined;
      const bertScore = EmbeddingHandler.bertScoreSimilarity(
        query,
        emb,
        queryText,
        itemText,
      );
      
      return {
        item,
        score: bertScore,
        bertScore: bertScore,
        distance: 1 - bertScore,
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Search with hybrid scoring (cosine + BERT-score)
   * Combines traditional vector similarity with contextual matching
   * 
   * @param query - Query embedding
   * @param items - Items to search through
   * @param k - Number of results to return
   * @param embeddingAccessor - Function to extract embedding from item
   * @param textAccessor - Function to extract text from item (optional)
   * @param queryText - Original query text (optional)
   * @param alpha - Weight for cosine similarity (0-1), BERT-score gets (1-alpha)
   * @returns Top k items with hybrid scores
   */
  static searchByHybridScore<T>(
    query: Embed,
    items: T[],
    k: number = 10,
    embeddingAccessor: (item: T) => Embed = (item: any) =>
      (item as any).embedding,
    textAccessor?: (item: T) => string,
    queryText?: string,
    alpha: number = 0.5,
  ): SearchResult<T>[] {
    const validItems = items.filter((item) => {
      const emb = embeddingAccessor(item);
      return Array.isArray(emb.embedding) && emb.embedding.length > 0;
    });

    const results = validItems.map((item) => {
      const emb = embeddingAccessor(item);
      const itemText = textAccessor ? textAccessor(item) : undefined;
      
      const hybridScore = EmbeddingHandler.hybridSimilarity(
        query,
        emb,
        queryText,
        itemText,
        alpha,
      );
      const bertScore = EmbeddingHandler.bertScoreSimilarity(
        query,
        emb,
        queryText,
        itemText,
      );
      
      return {
        item,
        score: hybridScore,
        bertScore: bertScore,
        combinedScore: hybridScore,
        distance: 1 - hybridScore,
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Rerank initial search results using BERT-score
   * This is a two-stage retrieval: first retrieve by cosine similarity (fast),
   * then rerank by BERT-score (more accurate)
   * 
   * @param query - Query embedding
   * @param initialResults - Results from initial cosine similarity search
   * @param textAccessor - Function to extract text from result item
   * @param queryText - Original query text (optional)
   * @returns Reranked results with BERT-scores
   */
  static rerankWithBertScore<T>(
    query: Embed,
    initialResults: SearchResult<T>[],
    textAccessor?: (item: T) => string,
    queryText?: string,
  ): SearchResult<T>[] {
    const embeddingAccessor = (result: SearchResult<T>) => {
      const item = result.item;
      return (item as any).embedding as Embed;
    };

    return initialResults.map((result) => {
      const itemEmbed = embeddingAccessor(result);
      const itemText = textAccessor ? textAccessor(result.item) : undefined;
      
      const bertScore = EmbeddingHandler.bertScoreSimilarity(
        query,
        itemEmbed,
        queryText,
        itemText,
      );
      
      return {
        ...result,
        bertScore: bertScore,
        combinedScore: (result.score + bertScore) / 2, // Average original and BERT score
      };
    }).sort((a, b) => (b.bertScore || 0) - (a.bertScore || 0));
  }

  /**
   * Generic search function that can use any distance/similarity metric
   */
  private static search<T>(
    query: Embed,
    items: T[],
    k: number,
    metric: (q: Embed, e: Embed) => number,
    embeddingAccessor: (item: T) => Embed,
    higherIsBetter: boolean,
  ): SearchResult<T>[] {
    const validItems = items.filter((item) => {
      const emb = embeddingAccessor(item);
      return Array.isArray(emb.embedding) && emb.embedding.length > 0;
    });

    const results = validItems.map((item) => {
      const emb = embeddingAccessor(item);
      const score = metric(query, emb);
      return {
        item,
        score,
        distance: higherIsBetter ? 1 - score : score,
      };
    });

    results.sort((a, b) =>
      higherIsBetter ? b.score - a.score : a.score - b.score,
    );

    return results.slice(0, k);
  }
}
