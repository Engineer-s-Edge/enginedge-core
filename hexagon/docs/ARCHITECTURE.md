# Hexagon Architecture

## Overview

The Hexagon is the central **Asynchronous Orchestration Layer** of the EnginEdge platform, built using hexagonal architecture (ports and adapters pattern). It manages complex multi-worker workflows and persistent state.

## Architecture Layers

### Domain Layer

**Location:** `src/domain/`

**Purpose:** Core business logic, entities, and domain services. No dependencies on infrastructure.

**Components:**

- **Entities:**
  - `OrchestrationRequest` - Tracks orchestration requests
  - `Workflow` - Manages workflow state and steps
  - `WorkerAssignment` - Represents worker task assignments
  - `Worker` - Worker registry entity

- **Types:**
  - `WorkflowType` - Enum of supported workflows
  - `RequestStatus` - Request lifecycle status
  - `WorkerType` - Types of workers
  - `WorkerStatus` - Worker health status

- **Services:**
  - `RequestRouter` - Routes requests to appropriate workers
  - `PatternDetector` - Detects workflow patterns from requests
  - `WorkflowValidator` - Validates workflow rules

### Application Layer

**Location:** `src/application/`

**Purpose:** Use cases and application services. Depends on domain layer and ports.

**Components:**

- **Ports:**
  - `IRequestRepository` - Request persistence interface
  - `IWorkflowRepository` - Workflow state persistence interface
  - `IKafkaProducer` - Kafka message publishing interface
  - `IKafkaConsumer` - Kafka message consumption interface
  - `IWorkerRegistry` - Worker discovery interface

- **Use Cases:**
  - `OrchestrateRequestUseCase` - Main orchestration entry point
  - `CoordinateMultiWorkerUseCase` - Coordinates multi-worker workflows
  - `ManageWorkflowStateUseCase` - Manages workflow state transitions
  - `HandleWorkerResponseUseCase` - Processes worker responses

- **Services:**
  - `WorkflowOrchestrationService` - High-level workflow orchestration
  - `WorkerManagementService` - Worker health and load balancing
  - `ResultAggregationService` - Aggregates results from multiple workers

### Infrastructure Layer

**Location:** `src/infrastructure/`

**Purpose:** Technical implementations, adapters, and external integrations.

**Components:**

- **Adapters:**
  - `KafkaProducerAdapter` - Kafka producer implementation
  - `KafkaConsumerAdapter` - Kafka consumer implementation
  - `KubernetesWorkerRegistryAdapter` - K8s service discovery
  - `MongoDbRequestRepository` - MongoDB request persistence
  - `MongoDbWorkflowRepository` - MongoDB workflow state persistence

- **Controllers:**
  - `OrchestrationController` - Orchestration HTTP endpoints
  - `HealthController` - Health check endpoints
  - _Proxy controllers (AssistantProxyController, etc.) - Legacy HTTP proxying (Deprecated)_

- **Modules:**
  - `OrchestrationModule` - Orchestration functionality
  - `DatabaseModule` - MongoDB connection
  - `RedisModule` - Redis caching
  - `KafkaModule` - Kafka messaging
  - `WorkerRegistryModule` - Worker discovery
  - `ProxyModule` - Legacy HTTP proxy functionality

## Communication Patterns

### Synchronous (HTTP Proxy) - _Legacy_

_Note: Primary synchronous routing is now handled by the API Gateway service._

```
Client → Hexagon → Worker (HTTP) → Hexagon → Client
```

### Asynchronous (Kafka Orchestration)

```
Client → Hexagon → Kafka → Workers → Kafka → Hexagon → Client (poll)
```

Used for:

- Multi-worker workflows
- Long-running jobs
- Complex business logic coordination

## Data Flow

### Request Orchestration Flow

1. **Client submits request** via `POST /api/orchestrate`
2. **OrchestrationController** receives request
3. **OrchestrateRequestUseCase** executes:
   - Validates request
   - Creates OrchestrationRequest entity
   - Routes to workers via RequestRouter
   - Publishes to Kafka topics
   - Saves to MongoDB
4. **Workers consume** from Kafka topics
5. **Workers process** and publish responses
6. **KafkaConsumerAdapter** receives responses
7. **HandleWorkerResponseUseCase** processes responses
8. **CoordinateMultiWorkerUseCase** aggregates results
9. **Client polls** status via `GET /api/orchestrate/:requestId`

## Workflow Patterns

### Sequential Workflow

Example: Resume Build

```
Resume Worker → Assistant Worker → LaTeX Worker
```

Each step waits for the previous step to complete.

### Parallel Workflow

Example: Expert Research

```
Agent-Tool Worker ──┐
                    ├─→ Data-Processing Worker → Assistant Worker
Agent-Tool Worker ──┘
```

Multiple workers process in parallel, then results are aggregated.

### Event-Driven Workflow

Workers publish intermediate events, hexagon reacts and triggers next steps dynamically.

## Technology Stack

- **Framework:** NestJS (TypeScript)
- **HTTP Server:** Fastify
- **Database:** MongoDB (via Mongoose)
- **Cache:** Redis (via ioredis)
- **Messaging:** Kafka (via kafkajs)
- **Service Discovery:** Kubernetes API
- **Observability:** Prometheus metrics, Winston logging

## Deployment

- **Docker:** Containerized with multi-stage build
- **Kubernetes:** Deployment manifests in `platform/k8s/`
- **Port:** 3000 (replaces core service)
- **Health Checks:** `/api/health` endpoint

## Configuration

All configuration via environment variables (see `.env.example`):

- Database: `MONGODB_URI`
- Cache: `REDIS_URL`
- Messaging: `KAFKA_BROKERS`
- Worker Discovery: `WORKER_DISCOVERY_MODE`
- Workflow: `WORKFLOW_MAX_DURATION`, `WORKFLOW_RETRY_ATTEMPTS`
