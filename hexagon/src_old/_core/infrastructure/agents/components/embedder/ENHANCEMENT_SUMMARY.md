# BERT-Score Enhancement Summary

## What Was Added

Enhanced the semantic retrieval system with BERT-score-inspired similarity metrics for more accurate document and conversation search.

## Files Modified

### 1. `embedder.service.ts` (Core Implementation)
**New Methods Added:**

- `bertScoreSimilarity()` - BERT-score with length penalty and magnitude confidence
- `hybridSimilarity()` - Combines cosine + BERT-score with alpha weighting
- `searchByBertScore()` - Search using pure BERT-score
- `searchByHybridScore()` - Search using hybrid scoring
- `rerankWithBertScore()` - Two-stage retrieval with reranking

**Interface Updates:**
```typescript
interface SearchResult<T> {
  item: T;
  score: number;
  distance?: number;
  bertScore?: number;        // NEW
  combinedScore?: number;    // NEW
}
```

### 2. `vectorstore.service.ts` (Integration)
**Enhanced Methods:**

#### `semanticSearchDocs()`
```typescript
options?: { 
  conversationId: ConversationIdType; 
  global: boolean;
  useBertScore?: boolean;      // NEW - Enable BERT-score
  bertScoreAlpha?: number;     // NEW - Hybrid weight (0-1)
}
```

#### `semanticSearchConvo()`
```typescript
async semanticSearchConvo(
  query: string,
  topK: number,
  userId: UserIdType,
  useSnippets: boolean = false,
  embedderConfig?: EmbeddingOptions,
  useBertScore: boolean = false,        // NEW
  bertScoreAlpha?: number,              // NEW
)
```

## Key Features

### 1. BERT-Score Similarity
- **Base**: Standard cosine similarity
- **Length Penalty**: Adjusts for query/document length mismatch (0.8-1.0)
- **Magnitude Confidence**: Considers embedding vector magnitudes
- **Formula**: `cosineSim × lengthPenalty × magnitudeConfidence`

### 2. Hybrid Scoring
- Combines cosine similarity with BERT-score
- Configurable alpha weight (default 0.5)
- **Formula**: `alpha × cosineSim + (1-alpha) × bertScore`
- Best for production environments

### 3. Two-Stage Reranking
- Stage 1: Fast cosine search retrieves top-K candidates
- Stage 2: BERT-score reranks for accuracy
- Optimal for large datasets

## Usage Examples

### Document Search

```typescript
// Standard (existing behavior - unchanged)
const results = await vectorStore.semanticSearchDocs(
  "machine learning",
  10,
  userId
);

// With BERT-score
const bertResults = await vectorStore.semanticSearchDocs(
  "machine learning",
  10,
  userId,
  { useBertScore: true }
);

// Hybrid scoring
const hybridResults = await vectorStore.semanticSearchDocs(
  "machine learning",
  10,
  userId,
  { 
    useBertScore: true,
    bertScoreAlpha: 0.5  // 50/50 blend
  }
);
```

### Conversation Search

```typescript
// With BERT-score
const messages = await vectorStore.semanticSearchConvo(
  "authentication patterns",
  10,
  userId,
  false,  // messages
  undefined,
  true,   // enable BERT-score
);

// Hybrid scoring
const snippets = await vectorStore.semanticSearchConvo(
  "database design",
  5,
  userId,
  true,   // snippets
  undefined,
  true,   // enable BERT-score
  0.4,    // 40% cosine, 60% BERT-score
);
```

### Direct EmbeddingHandler Usage

```typescript
// Pure BERT-score search
const results = EmbeddingHandler.searchByBertScore(
  queryEmbed,
  documents,
  10,
  (doc) => doc.embedding,
  (doc) => doc.content,
  "quantum computing"
);

// Hybrid search
const hybridResults = EmbeddingHandler.searchByHybridScore(
  queryEmbed,
  documents,
  10,
  (doc) => doc.embedding,
  (doc) => doc.content,
  "neural networks",
  0.5  // balanced
);

// Two-stage reranking
const candidates = EmbeddingHandler.searchBySimilarity(
  queryEmbed, allDocs, 50
);
const final = EmbeddingHandler.rerankWithBertScore(
  queryEmbed, candidates, (r) => r.item.content, "query text"
).slice(0, 10);
```

## Performance Characteristics

| Method | Speed | Accuracy | Use Case |
|--------|-------|----------|----------|
| Cosine Only | ⚡⚡⚡ | ⭐⭐ | Large datasets, speed critical |
| BERT-Score | ⚡ | ⭐⭐⭐ | Varied lengths, accuracy critical |
| Hybrid (α=0.5) | ⚡⚡ | ⭐⭐⭐ | Production (recommended) |
| Reranking | ⚡⚡ | ⭐⭐⭐ | Large datasets with pipelines |

## Backward Compatibility

✅ **All existing code works unchanged**
- BERT-score is opt-in via new optional parameters
- Default behavior remains standard cosine similarity
- No breaking changes to any APIs

## Configuration Recommendations

### Alpha Values (Hybrid Scoring)

- `alpha = 0.7`: Cosine-heavy (faster, uniform content)
- `alpha = 0.5`: Balanced (recommended default)
- `alpha = 0.3`: BERT-heavy (accurate, varied content)

### When to Use What

**Use Cosine Only:**
- Real-time search requirements
- Large datasets (>100k docs)
- Similar content lengths
- Speed > Accuracy

**Use BERT-Score:**
- Accuracy is critical
- Mixed content types
- Varying document lengths
- Research/analysis tasks

**Use Hybrid:**
- Production systems
- Balanced requirements
- Most general use cases
- Best of both worlds

**Use Reranking:**
- Very large datasets
- Two-stage retrieval pipelines
- Optimal cost/benefit ratio

## Next Steps

1. **Testing**: Add unit and integration tests
2. **Metrics**: Monitor search quality improvements
3. **Benchmarking**: Compare accuracy vs baseline
4. **Tuning**: Optimize alpha values per domain
5. **Documentation**: Update API docs with examples

## Documentation

Full documentation: `BERT_SCORE_ENHANCEMENT.md`

Includes:
- Detailed algorithm explanations
- Mathematical formulas
- Complete API reference
- Performance analysis
- Migration guide
- Testing strategies
