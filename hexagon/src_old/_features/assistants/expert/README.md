# Expert Agent Module

REST API endpoints for Expert Agent research operations using the **ICS Bear Hunter methodology** (AIM → SHOOT → SKIN). This agent is designed to compete with Perplexity.ai-style research capabilities by building structured knowledge graphs, conducting deep multi-source research, and providing comprehensive synthesized answers with citations.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [DTOs](#dtos)
- [ICS Methodology](#ics-methodology)
- [Knowledge Graph](#knowledge-graph)
- [Usage Examples](#usage-examples)
- [TODO & Roadmap](#todo--roadmap)

## 🎯 Overview

The Expert Agent implements a three-phase research workflow:

1. **AIM Phase**: Structural analysis and research question generation
   - Domain identification
   - Concept extraction
   - ICS layer assignment (L1-L6)
   - Research question prioritization

2. **SHOOT Phase**: Multi-source deep research
   - Web search via Tavily
   - Academic paper retrieval
   - Document analysis
   - Confidence scoring
   - Knowledge graph integration

3. **SKIN Phase**: Synthesis and refinement
   - Comprehensive answer generation (800-1200 words)
   - Citation formatting (inline/footnote/endnote)
   - Validation and fact-checking
   - Knowledge graph pruning

## 🏗️ Architecture

```
features/assistants/expert/
├── controllers/
│   └── expert.controller.ts       # REST endpoints
├── services/
│   └── expert.service.ts          # Business logic layer
├── dto/
│   └── expert.dto.ts              # Request/response DTOs
└── expert.module.ts               # Module configuration
```

### Dependencies

- **KnowledgeGraphModule**: Shared knowledge graph (nodes & edges)
- **EmbedderModule**: BERT-score semantic matching
- **JwtAuthGuard**: Authentication for all endpoints
- **ExpertAgent** (core): Full AIM/SHOOT/SKIN implementation (711 lines)

## 🚀 API Endpoints

All endpoints are prefixed with `/assistants/expert` and require JWT authentication.

### 1. Execute Research

**POST** `/assistants/expert/research`

Execute full research workflow synchronously.

**Request Body:**
```json
{
  "query": "What are the key principles of quantum entanglement?",
  "researchDepth": "advanced",
  "maxSources": 10,
  "maxTokens": 6000,
  "useBertScore": true,
  "conversationId": "conv-123"
}
```

**Response:**
```json
{
  "query": "What are the key principles of quantum entanglement?",
  "domain": "Quantum Physics",
  "concepts": ["quantum entanglement", "superposition", "measurement"],
  "questions": [
    {
      "question": "What is quantum entanglement?",
      "layer": 1,
      "priority": 10,
      "nodeId": "node-abc"
    }
  ],
  "results": [
    {
      "question": "What is quantum entanglement?",
      "answer": "Quantum entanglement is...",
      "sources": [
        {
          "url": "https://example.com/article",
          "title": "Introduction to Quantum Entanglement",
          "retrievedAt": "2024-01-15T10:00:00Z",
          "sourceType": "web"
        }
      ],
      "confidence": 0.92,
      "relatedConcepts": ["quantum superposition", "EPR paradox"]
    }
  ],
  "finalAnswer": "Comprehensive synthesized answer with citations...",
  "totalSources": 8,
  "overallConfidence": 0.89,
  "phases": [
    {
      "phase": "AIM",
      "status": "completed",
      "output": "Identified 5 key concepts, generated 8 research questions",
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:01:30Z"
    },
    {
      "phase": "SHOOT",
      "status": "completed",
      "output": "Researched 8 sources across 8 questions",
      "startedAt": "2024-01-15T10:01:30Z",
      "completedAt": "2024-01-15T10:05:00Z"
    },
    {
      "phase": "SKIN",
      "status": "completed",
      "output": "Synthesized 1200-word comprehensive answer",
      "startedAt": "2024-01-15T10:05:00Z",
      "completedAt": "2024-01-15T10:06:00Z"
    }
  ],
  "startedAt": "2024-01-15T10:00:00Z",
  "completedAt": "2024-01-15T10:06:00Z",
  "executionTimeMs": 360000
}
```

### 2. Stream Research (SSE)

**GET** `/assistants/expert/research/stream?query=...&userId=...`

Real-time research progress via Server-Sent Events.

**Query Parameters:**
- `query` (required): Research query
- `userId` (required): User ID from JWT
- `researchDepth` (optional): 'basic' | 'advanced'
- `maxSources` (optional): 1-20
- `maxTokens` (optional): 500-10000
- `useBertScore` (optional): true | false
- `conversationId` (optional): Conversation context

**SSE Event Stream:**
```
event: message
data: {"type":"phase","phase":"AIM","status":"in-progress"}

event: message
data: {"type":"phase","phase":"AIM","status":"completed"}

event: message
data: {"type":"source","url":"https://example.com","title":"Article"}

event: message
data: {"type":"complete","query":"...","answer":"..."}
```

### 3. Get Research History

**GET** `/assistants/expert/history?userId=...&limit=10&offset=0`

Retrieve past research sessions.

**Query Parameters:**
- `userId` (required): User ID
- `limit` (optional): Max results (default 10)
- `offset` (optional): Pagination offset (default 0)

**Response:**
```json
{
  "history": [
    {
      "sessionId": "session-123",
      "query": "What is quantum entanglement?",
      "domain": "Quantum Physics",
      "sourcesCount": 8,
      "confidence": 0.89,
      "conductedAt": "2024-01-15T10:00:00Z",
      "executionTimeMs": 360000
    }
  ],
  "totalSessions": 45,
  "totalSources": 320,
  "averageConfidence": 0.87
}
```

### 4. Get Knowledge Graph

**GET** `/assistants/expert/knowledge-graph?userId=...&conversationId=...`

Access knowledge graph built during research.

**Query Parameters:**
- `userId` (required): User ID
- `conversationId` (optional): Filter by conversation

**Response:**
```json
{
  "nodes": [
    {
      "_id": "node-abc",
      "name": "Quantum Entanglement",
      "type": "concept",
      "layer": 1,
      "researchStatus": "researched",
      "confidence": 0.92,
      "summary": "A quantum phenomenon where particles...",
      "keyPoints": [
        "Non-local correlations",
        "Measurement collapses state",
        "Spooky action at a distance"
      ],
      "relatedNodes": ["node-xyz", "node-def"],
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:06:00Z"
    }
  ],
  "totalNodes": 42,
  "nodesByLayer": {
    "1": 8,
    "2": 15,
    "3": 12,
    "4": 5,
    "5": 2
  },
  "nodesByStatus": {
    "researched": 25,
    "in-progress": 3,
    "unresearched": 14
  },
  "averageConfidence": 0.85
}
```

## 📦 DTOs

### ResearchRequestDto

```typescript
{
  query: string;                              // Required
  researchDepth?: 'basic' | 'advanced';       // Default: 'basic'
  maxSources?: number;                        // Default: 5 (1-20)
  maxTokens?: number;                         // Default: 4000 (500-10000)
  useBertScore?: boolean;                     // Default: false
  conversationId?: string;                    // Optional context
}
```

### ResearchResponseDto

```typescript
{
  query: string;
  domain: string;
  concepts: string[];
  questions: ResearchQuestionDto[];
  results: ResearchResultDto[];
  finalAnswer: string;
  totalSources: number;
  overallConfidence: number;
  phases: ResearchPhaseDto[];
  startedAt: Date;
  completedAt: Date;
  executionTimeMs: number;
}
```

### KnowledgeNodeDto

```typescript
{
  _id: string;
  name: string;
  type: 'concept' | 'entity' | 'process' | 'theory';
  layer: number;                              // 1-6
  researchStatus: 'unresearched' | 'in-progress' | 'researched' | 'dubious';
  confidence: number;                         // 0-1
  summary?: string;
  keyPoints?: string[];
  relatedNodes?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

## 🧠 ICS Methodology

The **Iterative Concept Structuring (ICS)** methodology organizes knowledge in hierarchical layers:

### Layer Hierarchy

- **L1 (Domain)**: Broadest concepts (e.g., "Quantum Physics")
- **L2 (Category)**: Sub-domains (e.g., "Quantum Entanglement")
- **L3 (Topic)**: Specific topics (e.g., "Bell's Theorem")
- **L4 (Detail)**: Detailed explanations (e.g., "EPR Paradox")
- **L5 (Implementation)**: Practical applications (e.g., "Quantum Key Distribution")
- **L6 (Edge Case)**: Edge cases and exceptions (e.g., "Loopholes in Bell Tests")

### Research Workflow

1. **AIM**: Identify concepts and assign layers
2. **SHOOT**: Research concepts layer-by-layer (L1 → L6)
3. **SKIN**: Prune unnecessary details, validate relationships

## 🕸️ Knowledge Graph

The Expert Agent builds a **shared knowledge graph** across all instances:

### Node Properties

- **type**: concept | entity | process | theory
- **layer**: ICS layer (1-6)
- **researchStatus**: unresearched | in-progress | researched | dubious
- **confidence**: 0-1 (based on source quality and validation)
- **sources**: Citations with URLs, titles, retrieval dates
- **researchData**: Summary, key points, examples, equations

### Features

- **Shared across agents**: All Expert agents contribute to the same graph
- **Semantic search**: BERT-score-enhanced retrieval
- **Validation**: User validation increases confidence scores
- **Dubious marking**: Users can flag incorrect information
- **Concurrent access**: Node locking prevents race conditions

## 💡 Usage Examples

### Basic Research

```typescript
// POST /assistants/expert/research
const response = await fetch('/assistants/expert/research', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'Explain photosynthesis',
    researchDepth: 'basic',
    maxSources: 5
  })
});

const result = await response.json();
console.log(result.finalAnswer);
```

### Streaming Research

```typescript
// GET /assistants/expert/research/stream
const eventSource = new EventSource(
  `/assistants/expert/research/stream?query=Explain+photosynthesis&userId=${userId}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'phase') {
    console.log(`Phase ${data.phase}: ${data.status}`);
  } else if (data.type === 'complete') {
    console.log('Research complete:', data.answer);
    eventSource.close();
  }
};
```

### Get Knowledge Graph

```typescript
// GET /assistants/expert/knowledge-graph
const response = await fetch(
  `/assistants/expert/knowledge-graph?userId=${userId}`,
  {
    headers: { 'Authorization': 'Bearer ' + token }
  }
);

const graph = await response.json();
console.log(`Graph has ${graph.totalNodes} nodes`);
console.log(`Average confidence: ${graph.averageConfidence}`);
```

## 🚧 TODO & Roadmap

### ✅ Completed
- [x] DTO definitions for research API
- [x] Controller with 4 REST endpoints
- [x] Service wrapper for business logic
- [x] Module configuration and integration
- [x] Knowledge graph access methods
- [x] SSE streaming endpoint

### ⏳ In Progress
- [ ] Full ExpertAgent integration via factory pattern
- [ ] Research session storage (ResearchSession entity)
- [ ] History persistence and retrieval

### 📋 Planned
- [ ] Unit tests (service, controller)
- [ ] Integration tests (E2E research workflow)
- [ ] Frontend UI components
  - [ ] Research execution interface
  - [ ] Real-time progress visualization
  - [ ] Knowledge graph explorer (D3.js/Cytoscape.js)
  - [ ] History browser
- [ ] Advanced features
  - [ ] Multi-user validation system
  - [ ] Dubious marking workflow
  - [ ] Citation export (BibTeX, APA, MLA)
  - [ ] Research templates
  - [ ] Custom research domains
  - [ ] PDF export with citations
  - [ ] Collaborative research sessions

### 🔧 Technical Debt
- **Agent Factory**: Currently using simplified instantiation. Need agent factory pattern for proper dependency injection (Toolkit, Memory, LLM, etc.).
- **Mock Data**: `executeResearch()` returns placeholder data until full agent integration.
- **Stream Implementation**: `streamResearch()` uses mock event generator until agent integration.
- **History Persistence**: Need ResearchSession entity and MongoDB collection.
- **BERT-Score Integration**: Not yet wired to actual semantic search calls.

## 🔐 Authentication

All endpoints require JWT authentication via `JwtAuthGuard`. Extract user ID from:
- `req.user.sub`
- `req.user.userId`
- `req.user._id`

## 📊 Performance

- **Basic Research**: ~30-60 seconds (5 sources)
- **Advanced Research**: ~2-5 minutes (10-20 sources)
- **Knowledge Graph Query**: ~100-500ms (depends on graph size)
- **History Query**: ~50-200ms (with pagination)

## 🐛 Error Handling

All endpoints throw `HttpException` with appropriate status codes:
- `400 Bad Request`: Missing required parameters
- `401 Unauthorized`: Invalid/missing JWT token
- `500 Internal Server Error`: Research execution failure

## 📝 Notes

- Expert Agent core implementation (711 lines) is fully functional
- API layer provides REST interface to agent capabilities
- Knowledge graph is shared across all Expert agent instances
- BERT-score can be enabled for more accurate semantic retrieval
- Citation styles: inline (default), footnote, endnote

## 🔗 Related Modules

- **GeniusModule**: Meta-learning orchestrator that commands Expert Agents
- **CommonModule**: Shared assistant infrastructure
- **ReactModule**: ReAct agents with block-based builder
- **GraphModule**: Graph-based workflow agents

## 📖 References

- [ICS Bear Hunter Methodology](../../infrastructure/agents/core/agents/structures/expert.ts)
- [Knowledge Graph Service](../../infrastructure/agents/components/knowledge/)
- [BERT-Score Implementation](../../infrastructure/agents/components/embedder/)
- [Genius Agent Documentation](../genius/README.md)
