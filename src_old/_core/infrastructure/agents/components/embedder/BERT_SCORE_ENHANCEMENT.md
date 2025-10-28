# BERT-Score Enhancement for Semantic Retrieval

## Overview

This enhancement adds BERT-score-inspired similarity metrics to improve the accuracy of semantic search and retrieval operations. While traditional cosine similarity only measures the angle between embedding vectors, BERT-score incorporates additional contextual factors like length normalization and magnitude confidence.

## What is BERT-Score?

BERT-score is a metric originally designed for evaluating text generation quality by computing token-level similarities using contextual embeddings. Our implementation adapts these principles to improve vector search:

1. **Contextual Similarity**: Uses the same embedding space as cosine similarity but adds context-aware adjustments
2. **Length Penalty**: Accounts for the length mismatch between query and document
3. **Magnitude Confidence**: Adjusts scores based on embedding vector magnitudes

## Implementation

### Core Methods (EmbeddingHandler)

#### 1. `bertScoreSimilarity()`
Computes BERT-score-inspired similarity with contextual adjustments:

```typescript
static bertScoreSimilarity(
  queryEmbed: Embed,
  docEmbed: Embed,
  queryText?: string,
  docText?: string,
): number
```

**Formula:**
```
bertScore = cosineSimilarity × lengthPenalty × magnitudeConfidence
```

**Components:**
- **Base Cosine Similarity**: Standard dot product / (norm1 × norm2)
- **Length Penalty**: `0.8 + (0.2 × min(len1, len2) / max(len1, len2))`
  - Penalizes large length mismatches
  - Range: [0.8, 1.0]
  - Requires query/doc text; defaults to 1.0 if not provided
- **Magnitude Confidence**: `min(avgMagnitude, 1.0)`
  - Higher magnitudes indicate more confident embeddings
  - Prevents over-confident low-magnitude embeddings
  - Range: [0, 1.0]

**Example:**
```typescript
const bertScore = EmbeddingHandler.bertScoreSimilarity(
  queryEmbed,
  docEmbed,
  "What is machine learning?",
  "Machine learning is a branch of artificial intelligence..."
);
// Returns: 0.89 (high similarity, similar lengths)
```

#### 2. `hybridSimilarity()`
Combines cosine similarity with BERT-score using configurable weighting:

```typescript
static hybridSimilarity(
  queryEmbed: Embed,
  docEmbed: Embed,
  queryText?: string,
  docText?: string,
  alpha: number = 0.5,
): number
```

**Formula:**
```
hybridScore = (alpha × cosineSimilarity) + ((1 - alpha) × bertScore)
```

**Parameters:**
- `alpha = 0.5` (default): Equal weight to both metrics
- `alpha = 0.7`: Favor cosine similarity (faster, good for similar length docs)
- `alpha = 0.3`: Favor BERT-score (better for varied length docs)

**Example:**
```typescript
// Balanced hybrid
const hybrid = EmbeddingHandler.hybridSimilarity(
  queryEmbed, docEmbed, queryText, docText, 0.5
);

// Favor BERT-score for better context matching
const contextual = EmbeddingHandler.hybridSimilarity(
  queryEmbed, docEmbed, queryText, docText, 0.3
);
```

### Search Methods

#### 3. `searchByBertScore()`
Primary search using only BERT-score:

```typescript
static searchByBertScore<T>(
  query: Embed,
  items: T[],
  k: number = 10,
  embeddingAccessor: (item: T) => Embed,
  textAccessor?: (item: T) => string,
  queryText?: string,
): SearchResult<T>[]
```

**Best for:**
- Documents with varying lengths
- When context and semantic understanding is critical
- Research papers, articles, long-form content

**Example:**
```typescript
const results = EmbeddingHandler.searchByBertScore(
  queryEmbed,
  documents,
  10,
  (doc) => doc.embedding,
  (doc) => doc.content,
  "quantum computing applications"
);
```

#### 4. `searchByHybridScore()`
Search using hybrid cosine + BERT-score:

```typescript
static searchByHybridScore<T>(
  query: Embed,
  items: T[],
  k: number = 10,
  embeddingAccessor: (item: T) => Embed,
  textAccessor?: (item: T) => string,
  queryText?: string,
  alpha: number = 0.5,
): SearchResult<T>[]
```

**Best for:**
- Production environments (balanced performance/accuracy)
- Mixed content types
- When you want "best of both worlds"

**Example:**
```typescript
// Balanced search
const results = EmbeddingHandler.searchByHybridScore(
  queryEmbed,
  documents,
  10,
  (doc) => doc.embedding,
  (doc) => doc.content,
  "machine learning algorithms",
  0.5 // Equal weight
);

// Favor contextual matching
const contextual = EmbeddingHandler.searchByHybridScore(
  queryEmbed,
  documents,
  10,
  (doc) => doc.embedding,
  (doc) => doc.content,
  "explain neural networks",
  0.3 // 30% cosine, 70% BERT-score
);
```

#### 5. `rerankWithBertScore()`
Two-stage retrieval: fast cosine search → accurate BERT-score reranking:

```typescript
static rerankWithBertScore<T>(
  query: Embed,
  initialResults: SearchResult<T>[],
  textAccessor?: (item: T) => string,
  queryText?: string,
): SearchResult<T>[]
```

**Strategy:**
1. Retrieve top-K (e.g., 50) candidates using fast cosine similarity
2. Rerank using BERT-score for better accuracy
3. Return reranked results

**Best for:**
- Large datasets where full BERT-score search is too slow
- Two-stage retrieval pipelines
- Production systems with performance constraints

**Example:**
```typescript
// Stage 1: Fast cosine search (top 50)
const candidates = EmbeddingHandler.searchBySimilarity(
  queryEmbed,
  allDocuments,
  50,
  (doc) => doc.embedding
);

// Stage 2: Rerank with BERT-score (select best 10)
const finalResults = EmbeddingHandler.rerankWithBertScore(
  queryEmbed,
  candidates,
  (result) => result.item.content,
  "quantum entanglement experiments"
).slice(0, 10);
```

## VectorStoreService Integration

### Document Search with BERT-Score

```typescript
async semanticSearchDocs(
  query: string,
  topK: number,
  userId: UserIdType,
  options?: { 
    conversationId: ConversationIdType; 
    global: boolean;
    useBertScore?: boolean;     // Enable BERT-score
    bertScoreAlpha?: number;    // Hybrid weight (0-1)
  },
  embedderConfig?: EmbeddingOptions,
): Promise<DocumentSearchResult[]>
```

**Usage Examples:**

```typescript
// Standard cosine similarity (default, fastest)
const results = await vectorStore.semanticSearchDocs(
  "machine learning algorithms",
  10,
  userId
);

// Pure BERT-score (most accurate)
const bertResults = await vectorStore.semanticSearchDocs(
  "machine learning algorithms",
  10,
  userId,
  { useBertScore: true }
);

// Hybrid with custom weighting
const hybridResults = await vectorStore.semanticSearchDocs(
  "machine learning algorithms",
  10,
  userId,
  { 
    useBertScore: true,
    bertScoreAlpha: 0.3  // 30% cosine, 70% BERT-score
  }
);

// Conversation-scoped with BERT-score
const convoResults = await vectorStore.semanticSearchDocs(
  "API design patterns",
  5,
  userId,
  { 
    conversationId: convoId,
    global: false,
    useBertScore: true,
    bertScoreAlpha: 0.5
  }
);
```

### Conversation Search with BERT-Score

```typescript
async semanticSearchConvo(
  query: string,
  topK: number,
  userId: UserIdType,
  useSnippets: boolean = false,
  embedderConfig?: EmbeddingOptions,
  useBertScore: boolean = false,      // Enable BERT-score
  bertScoreAlpha?: number,            // Hybrid weight (0-1)
): Promise<ConvoSearchResult[]>
```

**Usage Examples:**

```typescript
// Search messages with BERT-score
const messages = await vectorStore.semanticSearchConvo(
  "database optimization strategies",
  10,
  userId,
  false,  // use messages, not snippets
  undefined,  // use default embedder config
  true,   // enable BERT-score
);

// Search snippets with hybrid scoring
const snippets = await vectorStore.semanticSearchConvo(
  "authentication implementation",
  5,
  userId,
  true,   // use snippets
  undefined,
  true,   // enable BERT-score
  0.4,    // 40% cosine, 60% BERT-score
);
```

## Performance Considerations

### Speed Comparison

| Method | Speed | Accuracy | Best Use Case |
|--------|-------|----------|---------------|
| Cosine Similarity | ⚡⚡⚡ Fastest | ⭐⭐ Good | Large datasets, similar lengths |
| BERT-Score | ⚡ Slower | ⭐⭐⭐ Best | Varied lengths, research |
| Hybrid (α=0.5) | ⚡⚡ Moderate | ⭐⭐⭐ Excellent | Production systems |
| Two-Stage Reranking | ⚡⚡ Moderate | ⭐⭐⭐ Excellent | Large datasets |

### Computational Cost

**Cosine Similarity:**
- O(d) per comparison (d = embedding dimension)
- ~1536 floating point operations for default embeddings

**BERT-Score:**
- O(d + w) per comparison (w = word count operations)
- Additional ~50-100 operations for length penalty & confidence
- ~1600-1700 total operations

**Recommendation:**
- Use **Cosine** for: Real-time search, >10k documents, similar content types
- Use **BERT-Score** for: Research, mixed content, accuracy-critical tasks
- Use **Hybrid** for: Production (balanced), most general use cases
- Use **Reranking** for: Large datasets with two-stage pipelines

## Configuration Guidelines

### Alpha Values for Hybrid Search

```typescript
// Cosine-heavy (fast, good for uniform content)
alpha = 0.7  // 70% cosine, 30% BERT-score

// Balanced (recommended default)
alpha = 0.5  // 50% cosine, 50% BERT-score

// BERT-score-heavy (accurate, good for varied content)
alpha = 0.3  // 30% cosine, 70% BERT-score
```

### When to Use Each Method

#### Use Pure Cosine Similarity When:
- Search speed is critical
- Documents have similar lengths
- Content is uniform (e.g., all code snippets, all short answers)
- Dataset is very large (>100k documents)

#### Use Pure BERT-Score When:
- Accuracy is paramount
- Documents have varying lengths
- Mixed content types (short/long, technical/conversational)
- Dataset is moderate (<10k documents)

#### Use Hybrid Scoring When:
- Production environment with balanced needs
- Uncertain about content characteristics
- Want the best of both worlds
- Most common use case

#### Use Two-Stage Reranking When:
- Large dataset (>50k documents)
- Need accuracy but also speed
- Can tolerate slightly more latency
- Want optimal cost/benefit ratio

## Result Structure

```typescript
interface SearchResult<T> {
  item: T;                    // Original document/message
  score: number;              // Primary similarity score (0-1)
  distance?: number;          // Euclidean distance (optional)
  bertScore?: number;         // BERT-score value (0-1)
  combinedScore?: number;     // Hybrid score (0-1)
}
```

**Score Interpretation:**
- `score`: The primary ranking metric (cosine, BERT, or hybrid)
- `bertScore`: Pure BERT-score value (available when using BERT methods)
- `combinedScore`: Hybrid combination (available when using hybrid method)
- All scores range from 0 (no similarity) to 1 (perfect match)

## Migration Guide

### Existing Code (Cosine Similarity)

```typescript
const results = await vectorStore.semanticSearchDocs(
  query,
  10,
  userId
);
```

### Updated Code (BERT-Score)

```typescript
// Option 1: Pure BERT-score
const results = await vectorStore.semanticSearchDocs(
  query,
  10,
  userId,
  { useBertScore: true }
);

// Option 2: Hybrid (recommended)
const results = await vectorStore.semanticSearchDocs(
  query,
  10,
  userId,
  { 
    useBertScore: true,
    bertScoreAlpha: 0.5  // Balanced
  }
);
```

**Backward Compatibility:** All existing code continues to work unchanged. BERT-score is opt-in via parameters.

## Testing

### Unit Tests

Test file location: `main-node/test/embedder.service.spec.ts`

```typescript
describe('BERT-Score', () => {
  it('should compute BERT-score with length penalty', () => {
    const score = EmbeddingHandler.bertScoreSimilarity(
      queryEmbed,
      docEmbed,
      "short query",
      "This is a much longer document with more content"
    );
    expect(score).toBeLessThan(cosineSimilarity); // Length penalty applied
  });

  it('should combine cosine and BERT-score in hybrid', () => {
    const hybrid = EmbeddingHandler.hybridSimilarity(
      queryEmbed, docEmbed, queryText, docText, 0.5
    );
    const cosine = EmbeddingHandler.cosineSimilarity(queryEmbed, docEmbed);
    const bert = EmbeddingHandler.bertScoreSimilarity(
      queryEmbed, docEmbed, queryText, docText
    );
    expect(hybrid).toBeCloseTo((cosine + bert) / 2);
  });
});
```

### Integration Tests

Test file location: `main-node/test/vectorstore.integration.spec.ts`

```typescript
describe('VectorStore BERT-Score Integration', () => {
  it('should return different results with BERT-score', async () => {
    const cosineResults = await vectorStore.semanticSearchDocs(
      query, 10, userId
    );
    const bertResults = await vectorStore.semanticSearchDocs(
      query, 10, userId, { useBertScore: true }
    );
    
    // Rankings should differ
    expect(cosineResults[0]._id).not.toBe(bertResults[0]._id);
  });
});
```

## Future Enhancements

1. **Token-level BERT-Score**: Implement full token-by-token matching
2. **Learned Weights**: Train optimal alpha values per domain
3. **Dynamic Alpha**: Automatically adjust alpha based on query/doc characteristics
4. **Caching**: Cache BERT-scores for frequently accessed documents
5. **Batch Processing**: Optimize for batch similarity computations
6. **Model-specific Scoring**: Adapt scoring based on embedding model used

## References

- [BERTScore: Evaluating Text Generation with BERT](https://arxiv.org/abs/1904.09675)
- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks](https://arxiv.org/abs/1908.10084)
- [Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2004.04906)

## Support

For questions or issues:
1. Check this documentation
2. Review unit tests in `test/embedder.service.spec.ts`
3. Examine implementation in `embedder.service.ts`
4. Open an issue in the project repository
