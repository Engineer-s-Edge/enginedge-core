# Hexagon API Documentation

## Overview

The Hexagon orchestrator provides endpoints for:
- HTTP API Gateway functionality (proxying to workers)
- Asynchronous workflow orchestration via Kafka
- Request status tracking and polling

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Orchestration

#### Submit Orchestration Request

**POST** `/orchestrate`

Submit a workflow orchestration request. Returns immediately with a request ID for polling.

**Request Body:**
```json
{
  "workflow": "resume-build",
  "data": {
    "experiences": [...],
    "jobDescription": "...",
    "format": "pdf"
  },
  "correlationId": "optional-correlation-id",
  "idempotencyKey": "optional-idempotency-key"
}
```

**Response:** `202 Accepted`
```json
{
  "requestId": "req_789",
  "status": "processing",
  "estimatedDuration": 60000,
  "statusUrl": "/api/orchestrate/req_789"
}
```

**Available Workflows:**
- `resume-build`: Resume → Assistant → LaTeX
- `expert-research`: Agent-tool → Data-processing → Assistant
- `conversation-context`: Single assistant with context
- `single-worker`: Single worker (auto-detected)

#### Get Request Status

**GET** `/orchestrate/:requestId`

Get the current status and result of an orchestration request.

**Response:** `200 OK`
```json
{
  "requestId": "req_789",
  "status": "completed",
  "workflow": "resume-build",
  "workers": [
    {
      "id": "assign-1",
      "workerType": "resume",
      "status": "completed"
    },
    {
      "id": "assign-2",
      "workerType": "assistant",
      "status": "completed"
    },
    {
      "id": "assign-3",
      "workerType": "latex",
      "status": "completed"
    }
  ],
  "result": {
    "resume": {...},
    "tailored": {...},
    "pdf": {...},
    "pdfUrl": "https://..."
  },
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:31:00Z",
  "completedAt": "2025-01-15T10:31:00Z"
}
```

**Status Values:**
- `pending`: Request created, not yet processing
- `processing`: Request is being processed by workers
- `completed`: All workers completed successfully
- `failed`: One or more workers failed
- `cancelled`: Request was cancelled

### Proxy Endpoints

All proxy endpoints forward requests directly to worker services:

- `/assistants/*` → Assistant Worker
- `/tools/*` → Agent-Tool Worker
- `/data/*` → Data-Processing Worker
- `/interview/*` → Interview Worker
- `/latex/*` → LaTeX Worker
- `/resume/*` → Resume Worker
- `/scheduling/*` → Scheduling Worker
- `/calendar/*` → Scheduling Worker

### Health

#### Health Check

**GET** `/health`

Returns service health status.

**Response:** `200 OK`
```json
{
  "status": "ok"
}
```

### Metrics

#### Prometheus Metrics

**GET** `/metrics`

Returns Prometheus-compatible metrics.

## Workflow Examples

### Resume Build Workflow

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "resume-build",
    "data": {
      "experiences": [
        {
          "title": "Software Engineer",
          "company": "Tech Corp",
          "duration": "2020-2024"
        }
      ],
      "jobDescription": "Looking for a senior software engineer...",
      "format": "pdf"
    }
  }'
```

### Expert Research Workflow

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "expert-research",
    "data": {
      "query": "Latest trends in AI",
      "sources": ["tavily", "youtube"],
      "synthesis": true
    }
  }'
```

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid workflow type",
  "path": "/api/orchestrate",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "correlationId": "corr-123"
}
```

## Rate Limiting

Rate limiting is applied per IP address and endpoint:
- Default: 60 requests per minute
- WebSocket and SSE connections are exempt

## WebSocket Support

WebSocket connections are proxied to worker services:
- `/api/assistants/*` → Assistant Worker WebSocket
- `/api/interview/*` → Interview Worker WebSocket
- Authentication required via Bearer token in `Authorization` header or `?token=...` query parameter

