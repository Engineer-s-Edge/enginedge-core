# Shared Memory & Artifacts - README

This module provides artifact management, locking, versioning, search, and shared memory organization for the Collective Agent system.

## Services

### 1. ArtifactLockingService

**Purpose:** Prevent concurrent modification conflicts through read/write locks.

**Key Features:**
- READ locks (multiple agents can read simultaneously)
- WRITE locks (exclusive access for modifications)
- Automatic lock expiration (prevents deadlocks)
- Lock queuing for fair access
- Lock upgrade (READ → WRITE)
- Force release for crashed agents

**Usage:**

```typescript
// Acquire a WRITE lock
const lockToken = await artifactLocking.acquireLock(
  artifactId,
  'agent-123',
  'WRITE',
  300000 // 5 minutes
);

if (!lockToken) {
  console.log('Failed to acquire lock');
  return;
}

try {
  // Modify artifact
  await updateArtifact(artifactId, newContent);
} finally {
  // Always release lock
  await artifactLocking.releaseLock(artifactId, lockToken);
}

// Using withLock helper (automatic acquire/release)
await artifactLocking.withLock(
  artifactId,
  'agent-123',
  'WRITE',
  async () => {
    await updateArtifact(artifactId, newContent);
  }
);

// Upgrade READ lock to WRITE
const readToken = await artifactLocking.acquireLock(artifactId, 'agent-123', 'READ');
// ... read data ...
const writeToken = await artifactLocking.upgradeLock(artifactId, readToken);
if (writeToken) {
  // Now have WRITE access
  await updateArtifact(artifactId, newContent);
  await artifactLocking.releaseLock(artifactId, writeToken);
}

// Check lock status
const lockInfo = artifactLocking.getLockInfo(artifactId);
if (lockInfo) {
  console.log(`Locked by ${lockInfo.agentId} (${lockInfo.type})`);
}

// Get all locks held by agent
const agentLocks = artifactLocking.getAgentLocks('agent-123');
console.log(`Agent holds ${agentLocks.length} locks`);

// Force release all locks for crashed agent
await artifactLocking.releaseAgentLocks('agent-crashed');
```

**Lock Types:**

```typescript
// READ lock:
// - Multiple agents can hold READ locks simultaneously
// - No WRITE locks can be acquired while READ locks exist
// - Good for: reading data, generating reports, checking status

// WRITE lock:
// - Exclusive access (only one agent can hold)
// - No other READ or WRITE locks can exist
// - Good for: updating content, modifying metadata, deleting
```

**Configuration:**

```typescript
DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
MAX_LOCK_WAIT_MS = 30 * 1000 // 30 seconds (queue timeout)
LOCK_CLEANUP_INTERVAL_MS = 60 * 1000 // 1 minute
```

---

### 2. ArtifactVersioningService

**Purpose:** Full version control with history tracking, diffs, and rollback.

**Key Features:**
- Automatic versioning on every update
- Complete version history (up to 100 versions per artifact)
- Diff generation (line-by-line changes)
- Rollback to any previous version
- Version comparison
- Content integrity verification (SHA-256 hashes)

**Usage:**

```typescript
// Create a new version
const version = await artifactVersioning.createVersion(
  artifactId,
  newContent,
  'agent-123',
  'Added authentication logic'
);

console.log(`Created version ${version.versionNumber}`);
console.log(`Diff: ${version.diff}`);

// Get version history
const history = await artifactVersioning.getVersionHistory(artifactId, {
  limit: 10,
  ascending: false, // newest first
});

for (const version of history) {
  console.log(`v${version.versionNumber}: ${version.changeDescription} by ${version.createdBy}`);
}

// Get specific version
const v5 = await artifactVersioning.getVersion(artifactId, 5);
if (v5) {
  console.log(`Version 5 content: ${v5.content}`);
}

// Rollback to previous version
const rolledBack = await artifactVersioning.rollbackToVersion(
  artifactId,
  5,
  'agent-123'
);

console.log(`Rolled back to version 5, created new version ${rolledBack.versionNumber}`);

// Compare two versions
const comparison = await artifactVersioning.compareVersions(artifactId, 5, 10);
console.log(`Changes: +${comparison.changesSummary.linesAdded} -${comparison.changesSummary.linesRemoved}`);
console.log(`Diff:\n${comparison.diff}`);

// Get version statistics
const stats = await artifactVersioning.getVersionStats(artifactId);
console.log(`Total versions: ${stats.totalVersions}`);
console.log(`Contributors: ${stats.contributors.join(', ')}`);
console.log(`Avg time between versions: ${stats.avgTimeBetweenVersions}ms`);
console.log(`Total changes: +${stats.totalChanges.linesAdded} -${stats.totalChanges.linesRemoved}`);

// Prune old versions (keep only recent 10)
const pruned = await artifactVersioning.pruneVersionHistory(artifactId, 10);
console.log(`Pruned ${pruned} old versions`);

// Export/import version history
const historyJson = await artifactVersioning.exportVersionHistory(artifactId);
// ... backup or transfer ...
await artifactVersioning.importVersionHistory(newArtifactId, historyJson);

// Verify content integrity
const version = await artifactVersioning.getLatestVersion(artifactId);
const isValid = artifactVersioning.verifyIntegrity(content, version.contentHash);
console.log(`Content integrity: ${isValid ? 'OK' : 'CORRUPTED'}`);
```

**Version Structure:**

```typescript
interface ArtifactVersion {
  versionNumber: number;
  artifactId: string;
  content: string;
  contentHash: string; // SHA-256
  createdBy: string;
  createdAt: Date;
  changeDescription: string;
  diff: string; // Line-by-line diff from previous version
  metadata: {
    size: number;
    previousHash?: string;
    tags?: string[];
  };
}
```

---

### 3. ArtifactSearchService

**Purpose:** Full-text search and filtering across collective artifacts.

**Key Features:**
- Full-text search in name, content, description
- Filter by type, tags, creator, date range
- Sort by relevance, date, size
- Fuzzy matching
- Autocomplete suggestions
- Search statistics

**Usage:**

```typescript
// Basic search
const results = await artifactSearch.search('authentication', {
  collectiveId,
  limit: 10,
});

for (const result of results) {
  console.log(`${result.artifact.name} (score: ${result.score})`);
  console.log(`Highlights: ${result.highlights.join('...')}`);
}

// Advanced search with filters
const results = await artifactSearch.search('user login', {
  collectiveId,
  type: 'code',
  tags: ['backend', 'security'],
  createdBy: 'agent-123',
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date('2024-12-31'),
  sortBy: 'relevance',
  limit: 20,
  skip: 0,
});

// Search by tags only
const taggedArtifacts = await artifactSearch.searchByTags(
  ['urgent', 'review-needed'],
  { collectiveId, limit: 10 }
);

// Find similar artifacts
const similar = await artifactSearch.findSimilar(artifactId, 10);
console.log(`Found ${similar.length} similar artifacts`);

// Get recently created
const recent = await artifactSearch.getRecent(collectiveId, 10);

// Get recently updated
const updated = await artifactSearch.getRecentlyUpdated(collectiveId, 10);

// Get most accessed
const popular = await artifactSearch.getMostAccessed(collectiveId, 10);

// Autocomplete suggestions
const suggestions = await artifactSearch.getSuggestions('auth', collectiveId, 10);
console.log(`Suggestions: ${suggestions.join(', ')}`);

// Search statistics
const stats = await artifactSearch.getSearchStats(collectiveId);
console.log(`Total artifacts: ${stats.totalArtifacts}`);
console.log(`By type: ${JSON.stringify(stats.byType)}`);
console.log(`Avg size: ${stats.avgSize} bytes`);
console.log(`Top tags: ${stats.topTags.map(t => `${t.tag}(${t.count})`).join(', ')}`);
console.log(`Top creators: ${stats.topCreators.map(c => `${c.creator}(${c.count})`).join(', ')}`);

// Update search index after artifact change
await artifactSearch.updateIndex(artifactId);
```

**Search Options:**

```typescript
interface SearchOptions {
  collectiveId?: string;
  type?: string; // 'code', 'document', 'data', etc.
  tags?: string[];
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'relevance' | 'date' | 'size';
  limit?: number;
  skip?: number;
}
```

**Relevance Scoring:**

```typescript
// Score calculation:
// - Name exact match: +20
// - Name partial match: +10
// - Content occurrence: +2 per occurrence
// - Description match: +5
// - Tag match: +3 per tag
// - Recency bonus: +(7 - daysSinceCreation) * 0.5 (for last 7 days)
```

---

### 4. SharedMemoryService

**Purpose:** Organize collective knowledge and provide context retrieval.

**Key Features:**
- Task context retrieval (related artifacts, tasks, conversations)
- Knowledge base organization
- Similar artifact discovery
- Artifact consolidation (merge duplicates)
- Knowledge graph building
- Knowledge gap identification

**Usage:**

```typescript
// Get comprehensive context for a task
const context = await sharedMemory.getTaskContext(collectiveId, taskId);

console.log(`Task: ${context.task.title}`);
console.log(`Related artifacts: ${context.relatedArtifacts.length}`);
console.log(`Child tasks: ${context.childTasks.length}`);
console.log(`Dependencies: ${context.dependencyTasks.length}`);
console.log(`\nContext Summary:\n${context.summary}`);

// Get collective memory summary
const memory = await sharedMemory.getCollectiveMemory(collectiveId);

console.log(`Total artifacts: ${memory.totalArtifacts}`);
console.log(`By type: ${JSON.stringify(memory.byType)}`);
console.log(`Knowledge areas: ${memory.knowledgeAreas.map(a => `${a.area}(${a.count})`).join(', ')}`);
console.log(`Knowledge gaps: ${memory.knowledgeGaps.join(', ')}`);
console.log(`Recently accessed: ${memory.frequentlyAccessed.map(a => a.name).join(', ')}`);

// Find artifacts related to a task
const task = await taskModel.findById(taskId);
const relatedArtifacts = await sharedMemory.findRelatedArtifacts(task);

console.log(`Found ${relatedArtifacts.length} related artifacts`);

// Link artifact to task explicitly
await sharedMemory.linkArtifactToTask(artifactId, taskId);

// Find similar artifacts for consolidation
const similar = await sharedMemory.findSimilarArtifacts(artifactId, 0.8); // 80% similarity threshold

for (const { artifact, similarity } of similar) {
  console.log(`${artifact.name}: ${(similarity * 100).toFixed(1)}% similar`);
}

// Consolidate similar artifacts
const consolidated = await sharedMemory.consolidateArtifacts(
  targetArtifactId,
  [sourceId1, sourceId2, sourceId3],
  'agent-123'
);

console.log(`Consolidated 3 artifacts into: ${consolidated.name}`);

// Get knowledge graph for visualization
const graph = sharedMemory.getKnowledgeGraph(collectiveId);

console.log(`Nodes: ${graph.nodes.length}`);
console.log(`Edges: ${graph.edges.length}`);

// Visualize (pseudo-code)
for (const node of graph.nodes) {
  console.log(`Node: ${node.id} (${node.type})`);
}
for (const edge of graph.edges) {
  console.log(`${edge.from} --[${edge.type}]--> ${edge.to} (strength: ${edge.strength})`);
}
```

**Task Context Structure:**

```typescript
interface TaskContext {
  task: CollectiveTaskDocument;
  relatedArtifacts: CollectiveArtifactDocument[];
  parentTask: CollectiveTaskDocument | null;
  childTasks: CollectiveTaskDocument[];
  conversation: CollectiveConversationDocument | null;
  dependencyTasks: CollectiveTaskDocument[];
  summary: string; // Markdown summary
}
```

**Collective Memory Structure:**

```typescript
interface CollectiveMemory {
  totalArtifacts: number;
  byType: Record<string, number>;
  knowledgeAreas: Array<{ area: string; count: number }>;
  knowledgeGaps: string[]; // Tasks without related artifacts
  frequentlyAccessed: CollectiveArtifactDocument[];
  recentActivity: Array<{ type: string; description: string; timestamp: Date }>;
}
```

---

## Integration Examples

### Safe Artifact Update with Locking & Versioning

```typescript
async function safeUpdateArtifact(
  artifactId: string,
  newContent: string,
  agentId: string,
  changeDescription: string,
) {
  // 1. Acquire write lock
  const lockToken = await artifactLocking.acquireLock(artifactId, agentId, 'WRITE');
  
  if (!lockToken) {
    throw new Error('Failed to acquire lock');
  }

  try {
    // 2. Create version
    const version = await artifactVersioning.createVersion(
      artifactId,
      newContent,
      agentId,
      changeDescription,
    );

    // 3. Update search index
    await artifactSearch.updateIndex(artifactId);

    // 4. Update knowledge graph
    sharedMemory.addKnowledgeNode(
      artifactId,
      'artifact',
      collectiveId,
      { version: version.versionNumber },
    );

    return version;
  } finally {
    // 5. Always release lock
    await artifactLocking.releaseLock(artifactId, lockToken);
  }
}
```

### Agent Task Execution with Context

```typescript
async function executeTaskWithContext(
  collectiveId: string,
  taskId: string,
  agentId: string,
) {
  // 1. Get task context
  const context = await sharedMemory.getTaskContext(collectiveId, taskId);

  // 2. Build agent prompt with context
  let prompt = `Task: ${context.task.title}\n\n`;
  prompt += `Description: ${context.task.description}\n\n`;
  
  if (context.relatedArtifacts.length > 0) {
    prompt += `Related Artifacts:\n`;
    for (const artifact of context.relatedArtifacts) {
      prompt += `- ${artifact.name}: ${artifact.description}\n`;
    }
    prompt += `\n`;
  }

  prompt += context.summary;

  // 3. Execute task with LLM
  const result = await executeLLM(prompt, agentId);

  // 4. Create artifact from result (with locking & versioning)
  const artifactId = await createArtifact({
    collectiveId,
    name: `Result: ${context.task.title}`,
    type: 'code',
    content: result,
    createdBy: agentId,
  });

  // 5. Link artifact to task
  await sharedMemory.linkArtifactToTask(artifactId, taskId);

  return artifactId;
}
```

### PM Knowledge Review

```typescript
async function pmReviewCollectiveKnowledge(collectiveId: string) {
  // 1. Get collective memory
  const memory = await sharedMemory.getCollectiveMemory(collectiveId);

  console.log(`\n=== Collective Knowledge Review ===\n`);
  console.log(`Total Artifacts: ${memory.totalArtifacts}`);
  console.log(`\nBy Type:`);
  for (const [type, count] of Object.entries(memory.byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nKnowledge Areas:`);
  for (const area of memory.knowledgeAreas.slice(0, 5)) {
    console.log(`  ${area.area}: ${area.count} artifacts`);
  }

  console.log(`\nKnowledge Gaps (tasks without artifacts):`);
  for (const gap of memory.knowledgeGaps.slice(0, 5)) {
    console.log(`  - ${gap}`);
  }

  // 2. Find duplicate artifacts
  const artifacts = await artifactSearch.search('', { collectiveId, limit: 100 });
  
  for (const result of artifacts) {
    const similar = await sharedMemory.findSimilarArtifacts(result.artifact._id, 0.9);
    
    if (similar.length > 0) {
      console.log(`\nPotential duplicates for "${result.artifact.name}":`);
      for (const { artifact, similarity } of similar) {
        console.log(`  - ${artifact.name} (${(similarity * 100).toFixed(1)}% similar)`);
      }
    }
  }

  // 3. Get search statistics
  const stats = await artifactSearch.getSearchStats(collectiveId);
  console.log(`\nTop Contributors:`);
  for (const creator of stats.topCreators.slice(0, 5)) {
    console.log(`  ${creator.creator}: ${creator.count} artifacts`);
  }
}
```

---

## Configuration

```typescript
// ArtifactLockingService
DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
MAX_LOCK_WAIT_MS = 30 * 1000 // 30 seconds
LOCK_CLEANUP_INTERVAL_MS = 60 * 1000 // 1 minute

// ArtifactVersioningService
MAX_VERSIONS_PER_ARTIFACT = 100
AUTO_VERSION_ON_UPDATE = true
```

---

## Testing

```typescript
describe('Shared Memory & Artifacts', () => {
  it('should acquire and release locks', async () => {
    const token = await artifactLocking.acquireLock(artifactId, 'agent-1', 'WRITE');
    expect(token).toBeTruthy();
    expect(artifactLocking.isLocked(artifactId)).toBe(true);

    const released = await artifactLocking.releaseLock(artifactId, token);
    expect(released).toBe(true);
    expect(artifactLocking.isLocked(artifactId)).toBe(false);
  });

  it('should create versions with diffs', async () => {
    const v1 = await artifactVersioning.createVersion(artifactId, 'Hello', 'agent-1');
    const v2 = await artifactVersioning.createVersion(artifactId, 'Hello World', 'agent-1');

    expect(v2.versionNumber).toBe(2);
    expect(v2.diff).toContain('+ Hello World');
  });

  it('should search artifacts by content', async () => {
    const results = await artifactSearch.search('authentication', { collectiveId });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].artifact.content).toContain('authentication');
  });

  it('should provide task context', async () => {
    const context = await sharedMemory.getTaskContext(collectiveId, taskId);
    expect(context.task).toBeDefined();
    expect(context.relatedArtifacts).toBeInstanceOf(Array);
    expect(context.summary).toBeTruthy();
  });

  it('should find similar artifacts', async () => {
    const similar = await sharedMemory.findSimilarArtifacts(artifactId, 0.7);
    expect(similar).toBeInstanceOf(Array);
    expect(similar[0].similarity).toBeGreaterThan(0.7);
  });
});
```

---

## Next Steps

1. **Redis Integration**: Move lock storage from in-memory to Redis for distributed systems
2. **Elasticsearch**: Replace in-memory search index with Elasticsearch for better performance
3. **Graph Database**: Use Neo4j or similar for knowledge graph storage
4. **Artifact Storage**: Move large artifacts to S3/MinIO with references in MongoDB
5. **Real-time Updates**: WebSocket notifications when artifacts are updated
6. **Conflict Resolution**: Merge strategies for concurrent modifications
7. **Access Control**: Fine-grained permissions for artifacts
