# Workflow Examples

## Resume Build Workflow

### Overview

Builds a resume from experience data, tailors it to a job description, and compiles to PDF.

### Steps

1. **Resume Worker**: Builds resume structure from experiences
2. **Assistant Worker**: Tailors content to job description
3. **LaTeX Worker**: Compiles resume to PDF

### Request

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "resume-build",
    "data": {
      "userId": "user_123",
      "experiences": [
        {
          "title": "Senior Software Engineer",
          "company": "Tech Corp",
          "startDate": "2020-01-01",
          "endDate": "2024-12-31",
          "description": "Led development of..."
        }
      ],
      "education": [
        {
          "degree": "BS Computer Science",
          "school": "University",
          "year": 2020
        }
      ],
      "jobDescription": "We are looking for a senior software engineer...",
      "format": "pdf"
    }
  }'
```

### Response

```json
{
  "requestId": "req_789",
  "status": "processing",
  "estimatedDuration": 60000,
  "statusUrl": "/api/orchestrate/req_789"
}
```

### Poll for Result

```bash
curl http://localhost:3000/api/orchestrate/req_789
```

### Final Result

```json
{
  "requestId": "req_789",
  "status": "completed",
  "result": {
    "resume": {
      "structure": "...",
      "sections": [...]
    },
    "tailored": {
      "content": "...",
      "highlights": [...]
    },
    "pdf": {
      "url": "https://s3.../resume.pdf",
      "size": 12345
    },
    "pdfUrl": "https://s3.../resume.pdf"
  }
}
```

## Expert Research Workflow

### Overview

Researches a topic using multiple sources, processes documents, and synthesizes findings.

### Steps

1. **Agent-Tool Worker**: Fetches data from multiple sources (Tavily, YouTube, Wolfram)
2. **Data-Processing Worker**: Processes and vectorizes documents
3. **Assistant Worker**: Synthesizes findings using RAG

### Request

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "expert-research",
    "data": {
      "query": "Latest trends in artificial intelligence 2025",
      "sources": ["tavily", "youtube", "wolfram"],
      "maxResults": 10,
      "synthesis": true
    }
  }'
```

### Result Structure

```json
{
  "sources": {
    "tavily": [...],
    "youtube": [...],
    "wolfram": [...]
  },
  "processed": {
    "documents": [...],
    "embeddings": [...]
  },
  "synthesis": {
    "report": "...",
    "keyFindings": [...],
    "references": [...]
  },
  "report": "..."
}
```

## Conversation Context Workflow

### Overview

Maintains conversation context across multiple agent interactions.

### Request

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "conversation-context",
    "data": {
      "conversationId": "conv_123",
      "message": "What did we discuss earlier?",
      "context": {
        "previousMessages": [...],
        "entities": [...]
      }
    }
  }'
```

## Single Worker Orchestration

### Overview

Simple workflow that only requires one worker. Worker type is auto-detected.

### Request

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "single-worker",
    "data": {
      "prompt": "Explain quantum computing",
      "model": "gpt-4"
    }
  }'
```

### Auto-Detection

The system automatically detects which worker to use based on request data:
- `prompt` or `message` → Assistant Worker
- `resume` or `experiences` → Resume Worker
- `latex` or `tex` → LaTeX Worker
- `document` or `upload` → Data-Processing Worker

## Kafka Topic Mapping

### Request Topics (Hexagon → Workers)

- `job.requests.assistant` → Assistant Worker
- `job.requests.resume` → Resume Worker
- `job.requests.latex` → LaTeX Worker
- `job.requests.agent-tool` → Agent-Tool Worker
- `job.requests.data-processing` → Data-Processing Worker
- `job.requests.interview` → Interview Worker
- `job.requests.scheduling` → Scheduling Worker

### Response Topics (Workers → Hexagon)

- `job.responses.assistant` ← Assistant Worker
- `job.responses.resume` ← Resume Worker
- `job.responses.latex` ← LaTeX Worker
- `job.responses.agent-tool` ← Agent-Tool Worker
- `job.responses.data-processing` ← Data-Processing Worker
- `job.responses.interview` ← Interview Worker
- `job.responses.scheduling` ← Scheduling Worker

### Legacy Topic Support

The hexagon also supports existing worker topics:
- `llm.responses` (Assistant Worker)
- `resume.bullet.evaluate.response` (Resume NLP Service)
- `document.process.response` (Data-Processing Worker)
- etc.

## Message Format

### Request Message

```json
{
  "requestId": "req_789",
  "assignmentId": "assign-1",
  "workflow": "resume-build",
  "data": {
    "experiences": [...],
    "jobDescription": "..."
  },
  "correlationId": "corr-123"
}
```

### Response Message

```json
{
  "requestId": "req_789",
  "assignmentId": "assign-1",
  "result": {
    "resume": "..."
  },
  "status": "completed"
}
```

### Error Response

```json
{
  "requestId": "req_789",
  "assignmentId": "assign-1",
  "error": "Worker processing failed",
  "status": "error"
}
```

