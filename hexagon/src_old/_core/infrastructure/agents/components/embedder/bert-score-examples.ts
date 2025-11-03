/**
 * BERT-Score Usage Examples
 * 
 * This file demonstrates practical usage patterns for the BERT-score enhancement.
 * Copy these examples into your service/controller code as needed.
 * 
 * NOTE: This is a reference/example file. Type checking is disabled for clarity.
 *       When copying into production code, ensure proper types are used.
 */

// @ts-nocheck

import EmbeddingHandler from './embedder.service';
import VectorStoreService from '../vectorstores/services/vectorstore.service';
import { UserIdType, ConversationIdType } from '@core/infrastructure/database/utils/custom_types';

/**
 * Example 1: Basic BERT-Score Search (Documents)
 */
export async function example1_basicBertScore(
  vectorStore: VectorStoreService,
  userId: UserIdType,
) {
  // Standard cosine search (baseline)
  const cosineResults = await vectorStore.semanticSearchDocs(
    "What are the best practices for API design?",
    10,
    userId
  );
  console.log('Cosine top result:', cosineResults[0]?.score);

  // BERT-score search (more accurate)
  const bertResults = await vectorStore.semanticSearchDocs(
    "What are the best practices for API design?",
    10,
    userId,
    { useBertScore: true }
  );
  console.log('BERT-score top result:', bertResults[0]?.score);
  console.log('BERT-score value:', bertResults[0]?.bertScore);
}

/**
 * Example 2: Hybrid Search with Custom Weighting
 */
export async function example2_hybridSearch(
  vectorStore: VectorStoreService,
  userId: UserIdType,
) {
  // Balanced hybrid (50/50)
  const balanced = await vectorStore.semanticSearchDocs(
    "machine learning algorithms for time series",
    10,
    userId,
    { 
      useBertScore: true,
      bertScoreAlpha: 0.5
    }
  );

  // Favor BERT-score (30% cosine, 70% BERT)
  const contextual = await vectorStore.semanticSearchDocs(
    "machine learning algorithms for time series",
    10,
    userId,
    { 
      useBertScore: true,
      bertScoreAlpha: 0.3  // More weight on BERT-score
    }
  );

  // Favor cosine (70% cosine, 30% BERT)
  const fast = await vectorStore.semanticSearchDocs(
    "machine learning algorithms for time series",
    10,
    userId,
    { 
      useBertScore: true,
      bertScoreAlpha: 0.7  // More weight on cosine
    }
  );

  console.log('Balanced:', balanced[0]?.combinedScore);
  console.log('Contextual:', contextual[0]?.combinedScore);
  console.log('Fast:', fast[0]?.combinedScore);
}

/**
 * Example 3: Conversation-Scoped Search
 */
export async function example3_conversationSearch(
  vectorStore: VectorStoreService,
  userId: UserIdType,
  conversationId: ConversationIdType,
) {
  // Search within specific conversation with BERT-score
  const results = await vectorStore.semanticSearchDocs(
    "authentication implementation details",
    5,
    userId,
    { 
      conversationId,
      global: false,
      useBertScore: true,
      bertScoreAlpha: 0.5
    }
  );

  results.forEach((result, i) => {
    console.log(`Result ${i + 1}:`, {
      documentName: result.document.documentName,
      score: result.score,
      bertScore: result.bertScore,
      combinedScore: result.combinedScore,
    });
  });
}

/**
 * Example 4: Conversation Message Search
 */
export async function example4_messageSearch(
  vectorStore: VectorStoreService,
  userId: UserIdType,
) {
  // Search conversation messages (not snippets) with BERT-score
  const messages = await vectorStore.semanticSearchConvo(
    "database optimization strategies",
    10,
    userId,
    false,      // use messages, not snippets
    undefined,  // default embedder config
    true,       // enable BERT-score
  );

  messages.forEach((msg, i) => {
    console.log(`Message ${i + 1}:`, {
      score: msg.score,
      bertScore: msg.bertScore,
      preview: (msg.document as any).content?.slice(0, 100),
    });
  });
}

/**
 * Example 5: Conversation Snippet Search with Hybrid
 */
export async function example5_snippetSearch(
  vectorStore: VectorStoreService,
  userId: UserIdType,
) {
  // Search conversation snippets with hybrid scoring
  const snippets = await vectorStore.semanticSearchConvo(
    "error handling patterns",
    5,
    userId,
    true,       // use snippets, not full messages
    undefined,  // default embedder config
    true,       // enable BERT-score
    0.4,        // 40% cosine, 60% BERT-score
  );

  console.log(`Found ${snippets.length} relevant snippets`);
  snippets.forEach((snippet, i) => {
    console.log(`Snippet ${i + 1}:`, snippet.score);
  });
}

/**
 * Example 6: Direct EmbeddingHandler Usage (Low-Level)
 */
export async function example6_lowLevelAPI(
  queryEmbed: any,
  documents: any[],
) {
  // Pure BERT-score search
  const bertResults = EmbeddingHandler.searchByBertScore(
    queryEmbed,
    documents,
    10,
    (doc) => doc.embedding,
    (doc) => doc.content,
    "What is quantum computing?"
  );

  // Hybrid search
  const hybridResults = EmbeddingHandler.searchByHybridScore(
    queryEmbed,
    documents,
    10,
    (doc) => doc.embedding,
    (doc) => doc.content,
    "What is quantum computing?",
    0.5  // balanced
  );

  console.log('BERT-score results:', bertResults.length);
  console.log('Hybrid results:', hybridResults.length);
}

/**
 * Example 7: Two-Stage Retrieval (Optimal for Large Datasets)
 */
export async function example7_twoStageRetrieval(
  queryEmbed: any,
  allDocuments: any[],  // e.g., 100k documents
) {
  // Stage 1: Fast cosine similarity retrieval (top 50)
  const candidates = EmbeddingHandler.searchBySimilarity(
    queryEmbed,
    allDocuments,
    50,
    (doc) => doc.embedding
  );

  console.log(`Stage 1: Retrieved ${candidates.length} candidates`);

  // Stage 2: BERT-score reranking (select top 10)
  const finalResults = EmbeddingHandler.rerankWithBertScore(
    queryEmbed,
    candidates,
    (result) => result.item.content,
    "deep learning architectures"
  ).slice(0, 10);

  console.log(`Stage 2: Reranked to ${finalResults.length} results`);

  finalResults.forEach((result, i) => {
    console.log(`Result ${i + 1}:`, {
      originalScore: result.score,
      bertScore: result.bertScore,
      combinedScore: result.combinedScore,
    });
  });
}

/**
 * Example 8: Comparing Similarity Metrics
 */
export function example8_comparingMetrics(
  queryEmbed: any,
  docEmbed: any,
  queryText: string,
  docText: string,
) {
  // Compute all three similarity metrics
  const cosineSim = EmbeddingHandler.cosineSimilarity(queryEmbed, docEmbed);
  const bertScore = EmbeddingHandler.bertScoreSimilarity(
    queryEmbed,
    docEmbed,
    queryText,
    docText
  );
  const hybridScore = EmbeddingHandler.hybridSimilarity(
    queryEmbed,
    docEmbed,
    queryText,
    docText,
    0.5
  );

  console.log('Similarity Metrics:');
  console.log('  Cosine:', cosineSim.toFixed(4));
  console.log('  BERT-score:', bertScore.toFixed(4));
  console.log('  Hybrid (α=0.5):', hybridScore.toFixed(4));

  return { cosineSim, bertScore, hybridScore };
}

/**
 * Example 9: Adaptive Alpha Selection
 * 
 * Choose alpha based on query/document characteristics
 */
export function example9_adaptiveAlpha(queryText: string, docText: string): number {
  const queryLen = queryText.split(/\s+/).length;
  const docLen = docText.split(/\s+/).length;
  const lengthRatio = Math.min(queryLen, docLen) / Math.max(queryLen, docLen);

  // Similar lengths → favor cosine (faster)
  if (lengthRatio > 0.8) {
    return 0.7;  // 70% cosine, 30% BERT
  }
  
  // Very different lengths → favor BERT-score (more accurate)
  if (lengthRatio < 0.4) {
    return 0.3;  // 30% cosine, 70% BERT
  }
  
  // Moderate difference → balanced
  return 0.5;  // 50% cosine, 50% BERT
}

/**
 * Example 10: Production Use Case - RAG System
 */
export async function example10_productionRAG(
  vectorStore: VectorStoreService,
  userId: UserIdType,
  userQuery: string,
) {
  console.log('User query:', userQuery);

  // Retrieve context with hybrid scoring
  const context = await vectorStore.semanticSearchDocs(
    userQuery,
    5,  // top 5 most relevant docs
    userId,
    { 
      useBertScore: true,
      bertScoreAlpha: 0.5  // balanced approach
    }
  );

  // Log retrieval quality metrics
  console.log('Retrieval Results:');
  context.forEach((result, i) => {
    console.log(`  Doc ${i + 1}:`, {
      name: result.document.documentName,
      score: result.score?.toFixed(3),
      bertScore: result.bertScore?.toFixed(3),
      combined: result.combinedScore?.toFixed(3),
    });
  });

  // Convert to context strings for LLM
  const contextStrings = context.map((result) => 
    result.document.data.toString('utf-8')
  );

  // Use in prompt (pseudo-code)
  // const prompt = buildPrompt(userQuery, contextStrings);
  // const response = await llm.generate(prompt);

  return contextStrings;
}

/**
 * Example 11: A/B Testing Different Methods
 */
export async function example11_abTesting(
  vectorStore: VectorStoreService,
  userId: UserIdType,
  testQueries: string[],
) {
  const results = {
    cosine: [] as any[],
    bert: [] as any[],
    hybrid: [] as any[],
  };

  for (const query of testQueries) {
    // Cosine baseline
    const cosineResults = await vectorStore.semanticSearchDocs(
      query, 10, userId
    );
    results.cosine.push(cosineResults[0]?.score || 0);

    // BERT-score
    const bertResults = await vectorStore.semanticSearchDocs(
      query, 10, userId, { useBertScore: true }
    );
    results.bert.push(bertResults[0]?.score || 0);

    // Hybrid
    const hybridResults = await vectorStore.semanticSearchDocs(
      query, 10, userId, { useBertScore: true, bertScoreAlpha: 0.5 }
    );
    results.hybrid.push(hybridResults[0]?.score || 0);
  }

  // Compute average scores
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  
  console.log('Average Top-1 Scores:');
  console.log('  Cosine:', avg(results.cosine).toFixed(3));
  console.log('  BERT-score:', avg(results.bert).toFixed(3));
  console.log('  Hybrid:', avg(results.hybrid).toFixed(3));

  return results;
}

/**
 * Example 12: Error Handling
 */
export async function example12_errorHandling(
  vectorStore: VectorStoreService,
  userId: UserIdType,
) {
  try {
    const results = await vectorStore.semanticSearchDocs(
      "test query",
      10,
      userId,
      { 
        useBertScore: true,
        bertScoreAlpha: 0.5
      }
    );

    if (results.length === 0) {
      console.log('No results found');
      return [];
    }

    // Check if BERT-scores were computed
    const hasBertScores = results.every((r) => r.bertScore !== undefined);
    console.log('BERT-scores computed:', hasBertScores);

    return results;
  } catch (error) {
    console.error('Search failed:', error);
    // Fallback to standard cosine search
    return vectorStore.semanticSearchDocs("test query", 10, userId);
  }
}
