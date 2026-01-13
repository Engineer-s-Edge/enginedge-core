# EnginEdge Control Plane

> The central orchestration and control layer of the EnginEdge platform, built with hexagonal architecture for scalability and maintainability.

[![Hexagonal Architecture](https://img.shields.io/badge/Architecture-Hexagonal-blue)](https://en.wikipedia.org/wiki/Hexagonal_architecture)
[![NestJS](https://img.shields.io/badge/NestJS-10.0+-red)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)](#license)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Domain Model](#domain-model)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Development](#development)
- [Deployment](#deployment)
- [Monitoring](#monitoring)

## Overview

The **Control Plane (Hexagon)** acts as the **Asynchronous Orchestration Layer** for the EnginEdge platform. While the [API Gateway](../api-gateway) handles synchronous routing, the Hexagon manages complex, long-running, and multi-worker workflows via Apache Kafka.

### Key Responsibilities

- **Workflow Orchestration**: Coordinating complex multi-step workflows across workers.
- **State Management**: Managing the state of long-running processes.
- **Asynchronous Communication**: Using Kafka to distribute tasks to workers.
- **Result Aggregation**: combining results from multiple async workers.

_Note: Legacy HTTP proxying functionality still exists within Hexagon but is superseded by the `api-gateway` service for standard synchronous traffic._

### Communication Patterns

- **Kafka**: Primary communication channel for worker coordination (Asynchronous).
- **HTTP/REST**: Internal control API and legacy proxy endpoints (Port 3000).
- **Health Checks**: Periodic worker node health verification.

## Architecture

This service follows **hexagonal architecture** (ports & adapters) with clean separation of concerns:

```
src/
├── domain/                    # Business Logic Layer
│   ├── entities/             # Core business entities
│   │   ├── request.entity.ts
│   │   ├── worker.entity.ts
│   │   ├── message.entity.ts
│   │   └── response.entity.ts
│   └── services/             # Domain services
├── application/              # Application Layer
│   ├── ports/                # Port interfaces
│   │   ├── interfaces.ts     # IRequestHandler, IWorkerCoordinator
│   │   └── dtos/            # Data transfer objects
│   ├── services/            # Application services
│   └── use-cases/           # Business use cases
│       ├── orchestrate-request.use-case.ts
│       ├── route-to-worker.use-case.ts
│       └── health-check.use-case.ts
└── infrastructure/           # Infrastructure Layer
    ├── controllers/         # HTTP controllers
    │   ├── orchestration.controller.ts
    │   └── health.controller.ts
    ├── adapters/            # Port implementations
    │   ├── kafka-publisher.adapter.ts
    │   ├── worker-registry.adapter.ts
    │   └── http-client.adapter.ts
    ├── config/              # Configuration
    └── modules/             # NestJS modules
        └── orchestration.module.ts
```

### Hexagonal Architecture Benefits

- **Testability**: Each layer can be tested in isolation
- **Flexibility**: Easy to swap implementations (e.g., Kafka → Redis → gRPC)
- **Maintainability**: Clear separation of business logic from infrastructure
- **Scalability**: Independent scaling of different concerns

## Domain Model

### Core Entities

#### Request Entity

```typescript
interface Request {
  id: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  metadata: RequestMetadata;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Worker Entity

```typescript
interface Worker {
  id: string;
  type: WorkerType;
  endpoint: string;
  status: WorkerStatus;
  capabilities: string[];
  lastHealthCheck: Date;
  metrics: WorkerMetrics;
}
```

#### Message Entity

```typescript
interface Message {
  id: string;
  requestId: string;
  workerId: string;
  type: MessageType;
  payload: Record<string, unknown>;
  timestamp: Date;
}
```

### Task Types

- `EXECUTE_ASSISTANT`: Natural language processing tasks
- `SCHEDULE_HABITS`: Task scheduling and automation
- `PROCESS_DOCUMENT`: Document processing and OCR
- `GENERATE_LATEX`: Mathematical typesetting
- `ANALYZE_RESUME`: Resume parsing and job matching
- `PROCESS_INTERVIEW`: Media processing and analysis

## API Endpoints

### Base URL: `http://localhost:3000`

### Orchestration API

#### Submit Request

```http
POST /api/orchestrate
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "taskId": "req_123456",
  "taskType": "EXECUTE_ASSISTANT",
  "payload": {
    "prompt": "Analyze this document",
    "context": "...",
    "options": {
      "model": "gpt-4",
      "temperature": 0.7
    }
  },
  "metadata": {
    "priority": "high",
    "timeout": 30000,
    "callbackUrl": "https://example.com/webhook"
  }
}
```

**Response:**

```json
{
  "requestId": "req_123456",
  "status": "accepted",
  "estimatedDuration": 15000,
  "workerAssigned": "assistant-worker-001",
  "trackingUrl": "/api/requests/req_123456"
}
```

#### Get Request Status

```http
GET /api/requests/{requestId}
```

**Response:**

```json
{
  "requestId": "req_123456",
  "status": "completed",
  "result": {
    "analysis": "...",
    "confidence": 0.95
  },
  "workerId": "assistant-worker-001",
  "duration": 12500,
  "completedAt": "2025-10-21T10:30:00Z"
}
```

#### Batch Requests

```http
POST /api/orchestrate/batch
Content-Type: application/json

{
  "requests": [
    {
      "taskId": "req_1",
      "taskType": "EXECUTE_ASSISTANT",
      "payload": { "prompt": "..." }
    },
    {
      "taskId": "req_2",
      "taskType": "PROCESS_DOCUMENT",
      "payload": { "documentUrl": "..." }
    }
  ]
}
```

### Health & Monitoring API

#### System Health

```http
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T10:30:00Z",
  "version": "1.0.0",
  "services": {
    "kafka": "healthy",
    "database": "healthy",
    "workers": {
      "assistant-worker": "healthy",
      "agent-tool-worker": "healthy",
      "data-processing-worker": "healthy"
    }
  }
}
```

#### Worker Status

```http
GET /health/workers
```

**Response:**

```json
{
  "workers": [
    {
      "id": "assistant-worker-001",
      "type": "llm",
      "status": "healthy",
      "endpoint": "http://assistant-worker:3001",
      "lastHealthCheck": "2025-10-21T10:29:30Z",
      "activeRequests": 2,
      "avgResponseTime": 1250
    }
  ]
}
```

#### Metrics

```http
GET /metrics
```

Returns Prometheus-compatible metrics for monitoring.

## Configuration

### Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Kafka Configuration
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092
KAFKA_CLIENT_ID=enginedge-main-hexagon
KAFKA_GROUP_ID=orchestrator-group

# Worker Configuration
WORKER_DISCOVERY_MODE=kubernetes  # kubernetes|static|consul
WORKER_HEALTH_CHECK_INTERVAL=30000
WORKER_REQUEST_TIMEOUT=60000

# Database (for request tracking)
DATABASE_URL=postgresql://user:pass@db:5432/enginedge
REDIS_URL=redis://redis:6379

# Security
API_KEY_SECRET=your-secret-key
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=https://yourdomain.com

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_URL=http://grafana:3000
```

### Worker Registration

Workers can register dynamically or be configured statically:

```typescript
// Dynamic registration (via Kubernetes service discovery)
const workers = await workerDiscoveryService.discoverWorkers();

// Static configuration
const staticWorkers = [
  { type: 'llm', endpoint: 'http://assistant-worker:3001' },
  { type: 'agent-tool', endpoint: 'http://agent-tool-worker:3002' },
];
```

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- Docker & Docker Compose
- Apache Kafka

### Local Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start infrastructure:**

   ```bash
   docker-compose -f ../../EnginEdge-monorepo/docker-compose.dev.yml up -d
   ```

3. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server:**

   ```bash
   npm run start:dev
   ```

5. **Run tests:**
   ```bash
   npm run test                # All tests
   npm run test:unit          # Unit tests (domain layer)
   npm run test:integration   # Integration tests
   npm run test:e2e           # End-to-end tests
   npm run test:cov           # With coverage
   ```

### Testing Strategy

Following hexagonal architecture, tests are organized by layer:

```
test/
├── unit/                     # Domain layer tests
│   ├── entities/
│   └── services/
├── integration/             # Application layer tests
│   ├── use-cases/
│   └── ports/
├── e2e/                     # Infrastructure layer tests
│   ├── controllers/
│   └── adapters/
└── fixtures/                # Test data
```

### Code Quality

```bash
npm run lint                 # ESLint
npm run format              # Prettier
npm run type-check         # TypeScript compilation
npm run build              # Production build
```

## Deployment

### Docker Build

```bash
# Build image
docker build -t enginedge-main-hexagon:latest .

# Run locally
docker run -p 3000:3000 \
  -e KAFKA_BROKERS=kafka:9092 \
  -e DATABASE_URL=postgresql://... \
  enginedge-main-hexagon:latest
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: enginedge-main-hexagon
spec:
  replicas: 3
  selector:
    matchLabels:
      app: enginedge-main-hexagon
  template:
    metadata:
      labels:
        app: enginedge-main-hexagon
    spec:
      containers:
        - name: main-hexagon
          image: enginedge-main-hexagon:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: enginedge-config
            - secretRef:
                name: enginedge-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Helm Chart

```bash
# Install via Helm
helm install enginedge-main-hexagon ./helm/main-hexagon

# Upgrade
helm upgrade enginedge-main-hexagon ./helm/main-hexagon
```

## Monitoring

### Health Checks

- **Liveness Probe**: `/health/live` - Application responsiveness
- **Readiness Probe**: `/health/ready` - Service availability
- **Worker Health**: `/health/workers` - Worker node status

### Metrics

Exposed via `/metrics` endpoint (Prometheus format):

```
# Request metrics
orchestration_requests_total{status="success"} 1547
orchestration_requests_total{status="error"} 23
orchestration_request_duration_seconds{quantile="0.5"} 1.2

# Worker metrics
worker_requests_active{worker_type="llm"} 3
worker_health_status{worker_id="llm-001", status="healthy"} 1

# System metrics
nodejs_heap_size_used_bytes 45600000
nodejs_heap_size_total_bytes 78900000
```

### Logging

Structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2025-10-21T10:30:15.123Z",
  "level": "info",
  "message": "Request orchestrated successfully",
  "requestId": "req_123456",
  "workerId": "assistant-worker-001",
  "duration": 1250,
  "correlationId": "corr_789012"
}
```

### Alerting

Key alerts configured:

- High error rate (>5% in 5 minutes)
- Worker node down/unhealthy
- High request latency (>10 seconds p95)
- Queue depth growing (Kafka lag > 1000)

## Troubleshooting

### Common Issues

#### Worker Not Responding

```bash
# Check worker health
curl http://localhost:3001/health

# Check Kafka connectivity
kubectl logs -f deployment/enginedge-main-hexagon | grep kafka

# Verify worker registration
curl http://localhost:3000/health/workers
```

#### High Latency

```bash
# Check metrics
curl http://localhost:3000/metrics | grep orchestration_request_duration

# Check worker performance
curl http://localhost:3000/health/workers

# Monitor Kafka lag
kubectl exec -it kafka-pod -- kafka-consumer-groups --describe --group orchestrator-group
```

#### Memory Issues

```bash
# Check heap usage
curl http://localhost:3000/metrics | grep nodejs_heap

# Adjust memory limits in Kubernetes
kubectl edit deployment enginedge-main-hexagon
```

## Contributing

### Architecture Guidelines

1. **Domain First**: Always start with domain entities and business rules
2. **Ports Before Adapters**: Define interfaces before implementations
3. **Dependency Injection**: Use NestJS dependency injection for testability
4. **Single Responsibility**: Each class should have one reason to change

### Code Review Checklist

- [ ] Domain logic is pure (no external dependencies)
- [ ] Ports are interfaces, not concrete classes
- [ ] Adapters implement ports correctly
- [ ] Tests cover all layers (unit, integration, e2e)
- [ ] Error handling is comprehensive
- [ ] Logging includes correlation IDs

---

**Part of the EnginEdge Platform** | [System Overview](../../README.md) | [API Documentation](./docs/api.md)
