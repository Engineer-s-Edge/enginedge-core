# EnginEdge Main Hexagon - Architecture Deep Dive

> Detailed technical documentation of the hexagonal architecture implementation in the EnginEdge main orchestrator.

## Table of Contents

- [Overview](#overview)
- [Hexagonal Architecture](#hexagonal-architecture)
- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Dependency Flow](#dependency-flow)
- [Testing Strategy](#testing-strategy)
- [Performance Considerations](#performance-considerations)
- [Evolution & Migration](#evolution--migration)

## Overview

The **EnginEdge Main Hexagon** implements a sophisticated hexagonal architecture (ports & adapters) to provide a scalable, maintainable, and testable orchestration layer. This document provides an in-depth technical analysis of the architecture implementation.

### Architecture Goals

- **Separation of Concerns**: Clear boundaries between business logic and infrastructure
- **Testability**: Each layer can be tested in isolation
- **Flexibility**: Easy to swap implementations without changing business logic
- **Scalability**: Independent scaling of different architectural layers
- **Maintainability**: Clear structure for long-term evolution

## Hexagonal Architecture

### Core Principles

Hexagonal Architecture (also known as Ports & Adapters) treats the application as a hexagon with ports on the edges. The hexagon represents the domain logic, while ports define interfaces for communication with the outside world.

```
                    ┌─────────────────────────────────────┐
                    │           EXTERNAL ACTORS           │
                    │                                     │
                    │  REST API  Message Queue  Database │
                    │    CLI       Files       Email     │
                    └─────────────────────────────────────┘
                                     │         │
                            ┌────────┘         └────────┐
                            │                         │
                    ┌──────────────┐          ┌──────────────┐
                    │   PORTS      │          │   PORTS      │
                    │ (Interfaces) │          │ (Interfaces) │
                    └──────────────┘          └──────────────┘
                            │                         │
                    ┌──────────────┐          ┌──────────────┐
                    │  ADAPTERS    │          │  ADAPTERS    │
                    │ (Controllers │          │ (Gateways/  │
                    │  & Presenters)          │  Repositories)│
                    └──────────────┘          └──────────────┘
                            │                         │
                    ┌─────────────────────────────────────────┐
                    │           DOMAIN LOGIC                 │
                    │        (Business Rules & Entities)     │
                    └─────────────────────────────────────────┘
```

### Benefits in EnginEdge

1. **Technology Agnostic**: Business logic doesn't depend on frameworks or external services
2. **Testable**: Easy to mock external dependencies
3. **Evolvable**: Can change databases, message queues, or APIs without affecting core logic
4. **Parallel Development**: Teams can work on different layers simultaneously

## Domain Layer

The domain layer contains the core business logic and is completely independent of external concerns.

### Directory Structure

```
src/domain/
├── entities/                    # Core business entities
│   ├── request.entity.ts       # Request domain model
│   ├── worker.entity.ts        # Worker domain model
│   ├── message.entity.ts       # Message domain model
│   └── response.entity.ts      # Response domain model
├── services/                   # Domain services (pure business logic)
│   ├── request.service.ts      # Request business rules
│   ├── worker.service.ts       # Worker business rules
│   └── routing.service.ts      # Routing business logic
└── types/                      # Domain types and enums
    ├── request.types.ts
    ├── worker.types.ts
    └── message.types.ts
```

### Core Entities

#### Request Entity

```typescript
export class Request {
  private constructor(
    private readonly id: RequestId,
    private readonly taskType: TaskType,
    private payload: RequestPayload,
    private metadata: RequestMetadata,
    private status: RequestStatus,
    private readonly createdAt: Date,
    private updatedAt: Date,
  ) {}

  // Factory method for creation
  static create(params: CreateRequestParams): Result<Request, DomainError> {
    // Business rule validation
    if (!this.isValidTaskType(params.taskType)) {
      return Result.failure(new InvalidTaskTypeError(params.taskType));
    }

    // Create with defaults
    const request = new Request(
      RequestId.generate(),
      params.taskType,
      params.payload,
      params.metadata || {},
      RequestStatus.PENDING,
      new Date(),
      new Date(),
    );

    return Result.success(request);
  }

  // Business methods
  markAsProcessing(): Result<void, DomainError> {
    if (this.status !== RequestStatus.PENDING) {
      return Result.failure(new InvalidStatusTransitionError(this.status, RequestStatus.PROCESSING));
    }
    this.status = RequestStatus.PROCESSING;
    this.updatedAt = new Date();
    return Result.success(undefined);
  }

  complete(result: RequestResult): Result<void, DomainError> {
    this.status = RequestStatus.COMPLETED;
    this.payload = { ...this.payload, result };
    this.updatedAt = new Date();
    return Result.success(undefined);
  }

  // Getters (no setters to maintain invariants)
  getId(): RequestId { return this.id; }
  getTaskType(): TaskType { return this.taskType; }
  getStatus(): RequestStatus { return this.status; }
  // ... other getters
}
```

**Design Decisions:**
- **Private constructor** with factory method for controlled creation
- **Value Objects** for IDs and immutable properties
- **Business rule validation** in entity methods
- **Result type** for error handling ( Railway-oriented programming)
- **No external dependencies** - pure domain logic

#### Worker Entity

```typescript
export class Worker {
  private constructor(
    private readonly id: WorkerId,
    private readonly type: WorkerType,
    private endpoint: WorkerEndpoint,
    private status: WorkerStatus,
    private capabilities: WorkerCapability[],
    private metrics: WorkerMetrics,
    private lastHealthCheck: Date,
  ) {}

  // Business methods
  isHealthy(): boolean {
    return this.status === WorkerStatus.HEALTHY &&
           this.lastHealthCheck > new Date(Date.now() - HEALTH_CHECK_TIMEOUT);
  }

  canHandle(taskType: TaskType): boolean {
    return this.capabilities.includes(this.mapTaskTypeToCapability(taskType));
  }

  updateHealth(status: WorkerStatus, metrics?: WorkerMetrics): void {
    this.status = status;
    this.lastHealthCheck = new Date();
    if (metrics) {
      this.metrics = { ...this.metrics, ...metrics };
    }
  }

  // Domain invariants
  private ensureEndpointValid(): void {
    if (!this.endpoint.protocol || !this.endpoint.host) {
      throw new InvalidWorkerEndpointError(this.endpoint);
    }
  }
}
```

### Domain Services

Domain services contain business logic that doesn't naturally belong to entities:

```typescript
@Injectable()
export class RoutingService {
  // Pure domain logic - no external dependencies
  routeRequest(request: Request, availableWorkers: Worker[]): Result<Worker, DomainError> {
    const eligibleWorkers = availableWorkers.filter(worker =>
      worker.canHandle(request.getTaskType()) && worker.isHealthy()
    );

    if (eligibleWorkers.length === 0) {
      return Result.failure(new NoEligibleWorkersError(request.getTaskType()));
    }

    // Business rule: Prefer workers with lower current load
    const selectedWorker = eligibleWorkers.reduce((best, current) =>
      current.getMetrics().activeRequests < best.getMetrics().activeRequests
        ? current
        : best
    );

    return Result.success(selectedWorker);
  }
}
```

**Key Characteristics:**
- **Pure functions** with no side effects
- **No external dependencies** (databases, APIs, etc.)
- **Business rule encapsulation**
- **Testable in complete isolation**

## Application Layer

The application layer orchestrates domain objects and defines ports for external communication.

### Directory Structure

```
src/application/
├── ports/                      # Port interfaces (contracts)
│   ├── inbound/               # Driving ports (interfaces called by external actors)
│   │   ├── request-handler.port.ts
│   │   └── health-check.port.ts
│   └── outbound/              # Driven ports (interfaces called by application)
│       ├── worker-registry.port.ts
│       ├── message-publisher.port.ts
│       └── metrics-collector.port.ts
├── use-cases/                 # Application use cases
│   ├── orchestrate-request.use-case.ts
│   ├── health-check.use-case.ts
│   └── get-worker-status.use-case.ts
├── services/                  # Application services
│   └── orchestration.service.ts
└── dtos/                      # Data Transfer Objects
    ├── request.dto.ts
    ├── response.dto.ts
    └── worker.dto.ts
```

### Port Design

Ports define the contract between the application and external actors:

#### Inbound Ports (Driving)

```typescript
// request-handler.port.ts
export interface IRequestHandler {
  orchestrateRequest(request: OrchestrateRequestCommand): Promise<Result<RequestId, ApplicationError>>;
  getRequestStatus(requestId: RequestId): Promise<Result<RequestStatusResponse, ApplicationError>>;
  cancelRequest(requestId: RequestId): Promise<Result<void, ApplicationError>>;
}

// health-check.port.ts
export interface IHealthCheckHandler {
  getSystemHealth(): Promise<HealthStatus>;
  getWorkerHealth(): Promise<WorkerHealthStatus[]>;
  getMetrics(): Promise<SystemMetrics>;
}
```

#### Outbound Ports (Driven)

```typescript
// worker-registry.port.ts
export interface IWorkerRegistry {
  getAvailableWorkers(): Promise<Worker[]>;
  registerWorker(worker: Worker): Promise<void>;
  unregisterWorker(workerId: WorkerId): Promise<void>;
  updateWorkerStatus(workerId: WorkerId, status: WorkerStatus): Promise<void>;
}

// message-publisher.port.ts
export interface IMessagePublisher {
  publishRequest(request: Request, targetWorker: Worker): Promise<Result<void, InfrastructureError>>;
  publishResponse(response: Response): Promise<Result<void, InfrastructureError>>;
  subscribeToResponses(handler: ResponseHandler): Promise<void>;
}
```

**Port Design Principles:**
- **Interface segregation**: Small, focused interfaces
- **Dependency inversion**: Application depends on abstractions
- **Result types**: Explicit error handling
- **Async contracts**: All external interactions are asynchronous

### Use Cases

Use cases orchestrate domain objects and coordinate with ports:

```typescript
@Injectable()
export class OrchestrateRequestUseCase {
  constructor(
    private readonly requestRepository: IRequestRepository, // Port
    private readonly workerRegistry: IWorkerRegistry,       // Port
    private readonly messagePublisher: IMessagePublisher,    // Port
    private readonly routingService: RoutingService,         // Domain service
  ) {}

  async execute(command: OrchestrateRequestCommand): Promise<Result<RequestId, ApplicationError>> {
    // 1. Create domain entity
    const requestResult = Request.create({
      taskType: command.taskType,
      payload: command.payload,
      metadata: command.metadata,
    });

    if (requestResult.isFailure()) {
      return Result.failure(new ApplicationError(requestResult.error.message));
    }

    const request = requestResult.value;

    // 2. Find eligible worker using domain service
    const availableWorkers = await this.workerRegistry.getAvailableWorkers();
    const routingResult = this.routingService.routeRequest(request, availableWorkers);

    if (routingResult.isFailure()) {
      return Result.failure(new ApplicationError(routingResult.error.message));
    }

    const targetWorker = routingResult.value;

    // 3. Persist request
    await this.requestRepository.save(request);

    // 4. Publish message to worker
    const publishResult = await this.messagePublisher.publishRequest(request, targetWorker);

    if (publishResult.isFailure()) {
      // Compensating action: mark request as failed
      request.markAsFailed();
      await this.requestRepository.save(request);
      return Result.failure(new ApplicationError(publishResult.error.message));
    }

    return Result.success(request.getId());
  }
}
```

**Use Case Characteristics:**
- **Orchestration logic**: Coordinates domain objects and ports
- **Transaction management**: Handles compensating actions on failure
- **Error transformation**: Converts domain errors to application errors
- **No external details**: Uses ports, not concrete implementations

## Infrastructure Layer

The infrastructure layer contains concrete implementations of ports and external integrations.

### Directory Structure

```
src/infrastructure/
├── controllers/                # HTTP API controllers
│   ├── orchestration.controller.ts
│   └── health.controller.ts
├── adapters/                   # Port implementations
│   ├── outbound/              # Driven adapters
│   │   ├── kafka-message-publisher.adapter.ts
│   │   ├── redis-worker-registry.adapter.ts
│   │   └── postgres-request-repository.adapter.ts
│   └── inbound/               # Driving adapters
│       ├── rest-api.adapter.ts
│       └── websocket.adapter.ts
├── config/                    # Configuration management
│   ├── database.config.ts
│   ├── kafka.config.ts
│   └── redis.config.ts
├── database/                  # Database schemas/migrations
│   ├── migrations/
│   └── entities/
├── messaging/                 # Message queue setup
│   ├── kafka/
│   └── redis/
└── modules/                   # NestJS module composition
    ├── orchestration.module.ts
    └── infrastructure.module.ts
```

### Adapter Implementation

Adapters implement port interfaces and handle external concerns:

```typescript
@Injectable()
export class KafkaMessagePublisherAdapter implements IMessagePublisher {
  constructor(
    private readonly kafkaProducer: KafkaProducer,
    private readonly config: KafkaConfig,
  ) {}

  async publishRequest(request: Request, targetWorker: Worker): Promise<Result<void, InfrastructureError>> {
    try {
      const message = {
        key: request.getId().toString(),
        value: JSON.stringify({
          requestId: request.getId().toString(),
          taskType: request.getTaskType(),
          payload: request.getPayload(),
          workerEndpoint: targetWorker.getEndpoint(),
        }),
        headers: {
          'correlation-id': request.getId().toString(),
          'worker-type': targetWorker.getType(),
        },
      };

      await this.kafkaProducer.send({
        topic: `worker.${targetWorker.getType()}.requests`,
        messages: [message],
      });

      return Result.success(undefined);
    } catch (error) {
      return Result.failure(new KafkaPublishError(error.message));
    }
  }
}
```

**Adapter Responsibilities:**
- **Protocol translation**: Convert domain objects to external formats
- **Error handling**: Convert external errors to infrastructure errors
- **Resource management**: Handle connections, retries, circuit breakers
- **Configuration**: Use external configuration for connection details

### Controller Implementation

Controllers adapt HTTP requests to application use cases:

```typescript
@Controller('api/orchestrate')
export class OrchestrationController {
  constructor(
    private readonly orchestrateUseCase: OrchestrateRequestUseCase,
    private readonly getStatusUseCase: GetRequestStatusUseCase,
  ) {}

  @Post()
  async orchestrateRequest(
    @Body() body: OrchestrateRequestDto,
    @Headers('x-api-key') apiKey: string,
  ): Promise<OrchestrateResponseDto> {
    // 1. Validate API key (infrastructure concern)
    if (!this.isValidApiKey(apiKey)) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 2. Transform DTO to command
    const command = OrchestrateRequestCommand.create({
      taskType: body.taskType,
      payload: body.payload,
      metadata: {
        ...body.metadata,
        source: 'http-api',
        apiKey: apiKey,
      },
    });

    // 3. Execute use case
    const result = await this.orchestrateUseCase.execute(command);

    // 4. Transform result to DTO
    if (result.isFailure()) {
      throw new BadRequestException(result.error.message);
    }

    return {
      requestId: result.value.toString(),
      status: 'accepted',
      estimatedDuration: this.estimateDuration(body.taskType),
    };
  }
}
```

## Dependency Flow

### Dependency Direction

```
Infrastructure Layer → Application Layer → Domain Layer
     ↑                        ↑
     └────────────────────────┘
        Dependency Inversion
```

- **Infrastructure** depends on **Application** (ports)
- **Application** depends on **Domain**
- **Domain** depends on nothing external

### Dependency Injection Configuration

```typescript
@Module({
  providers: [
    // Domain services (no dependencies)
    RoutingService,

    // Application services
    OrchestrationApplicationService,

    // Use cases
    OrchestrateRequestUseCase,
    GetRequestStatusUseCase,

    // Infrastructure adapters (implement ports)
    {
      provide: 'IRequestRepository',
      useClass: PostgresRequestRepositoryAdapter,
    },
    {
      provide: 'IWorkerRegistry',
      useClass: RedisWorkerRegistryAdapter,
    },
    {
      provide: 'IMessagePublisher',
      useClass: KafkaMessagePublisherAdapter,
    },

    // Controllers
    OrchestrationController,
    HealthController,
  ],
})
export class OrchestrationModule {}
```

## Testing Strategy

### Testing Pyramid

```
End-to-End Tests (Infrastructure)
    │
Integration Tests (Application + Infrastructure)
    │
Unit Tests (Domain + Application)
```

### Domain Layer Testing

```typescript
describe('Request Entity', () => {
  it('should create valid request', () => {
    const params = {
      taskType: TaskType.EXECUTE_ASSISTANT,
      payload: { prompt: 'Hello' },
    };

    const result = Request.create(params);

    expect(result.isSuccess()).toBe(true);
    expect(result.value.getTaskType()).toBe(TaskType.EXECUTE_ASSISTANT);
  });

  it('should reject invalid task type', () => {
    const params = {
      taskType: 'INVALID_TYPE' as TaskType,
      payload: {},
    };

    const result = Request.create(params);

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidTaskTypeError);
  });
});
```

### Application Layer Testing

```typescript
describe('OrchestrateRequestUseCase', () => {
  let useCase: OrchestrateRequestUseCase;
  let mockRequestRepo: jest.Mocked<IRequestRepository>;
  let mockWorkerRegistry: jest.Mocked<IWorkerRegistry>;
  let mockMessagePublisher: jest.Mocked<IMessagePublisher>;

  beforeEach(() => {
    // Mock all ports
    mockRequestRepo = createMock<IRequestRepository>();
    mockWorkerRegistry = createMock<IWorkerRegistry>();
    mockMessagePublisher = createMock<IMessagePublisher>();

    useCase = new OrchestrateRequestUseCase(
      mockRequestRepo,
      mockWorkerRegistry,
      mockMessagePublisher,
      new RoutingService(),
    );
  });

  it('should orchestrate request successfully', async () => {
    // Arrange
    const command = createTestCommand();
    const mockWorker = createMockWorker();

    mockWorkerRegistry.getAvailableWorkers.mockResolvedValue([mockWorker]);
    mockRequestRepo.save.mockResolvedValue(undefined);
    mockMessagePublisher.publishRequest.mockResolvedValue(Result.success(undefined));

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result.isSuccess()).toBe(true);
    expect(mockMessagePublisher.publishRequest).toHaveBeenCalledWith(
      expect.any(Request),
      mockWorker,
    );
  });
});
```

### Infrastructure Layer Testing

```typescript
describe('KafkaMessagePublisherAdapter', () => {
  let adapter: KafkaMessagePublisherAdapter;
  let mockProducer: jest.Mocked<KafkaProducer>;

  beforeEach(() => {
    mockProducer = createMock<KafkaProducer>();
    adapter = new KafkaMessagePublisherAdapter(mockProducer, kafkaConfig);
  });

  it('should publish message to correct topic', async () => {
    // Arrange
    const request = createTestRequest();
    const worker = createTestWorker();

    mockProducer.send.mockResolvedValue(undefined);

    // Act
    const result = await adapter.publishRequest(request, worker);

    // Assert
    expect(result.isSuccess()).toBe(true);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'worker.llm.requests',
      messages: [expect.objectContaining({
        key: request.getId().toString(),
        headers: expect.objectContaining({
          'correlation-id': request.getId().toString(),
        }),
      })],
    });
  });
});
```

## Performance Considerations

### Caching Strategy

```typescript
@Injectable()
export class CachedWorkerRegistryAdapter implements IWorkerRegistry {
  constructor(
    private readonly cache: RedisCache,
    private readonly database: WorkerRepository,
  ) {}

  async getAvailableWorkers(): Promise<Worker[]> {
    const cacheKey = 'workers:available';

    // Try cache first
    const cached = await this.cache.get<Worker[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const workers = await this.database.getAvailableWorkers();

    // Cache for 30 seconds
    await this.cache.set(cacheKey, workers, 30);

    return workers;
  }
}
```

### Connection Pooling

```typescript
// Database connection pool
export const databaseConfig = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  poolSize: 10,              // Connection pool size
  retryDelay: 3000,          // Retry delay
  retryAttempts: 3,          // Retry attempts
  synchronize: false,        // Use migrations in production
  logging: process.env.NODE_ENV === 'development',
};
```

### Asynchronous Processing

```typescript
@Injectable()
export class AsyncOrchestrateRequestUseCase {
  async execute(command: OrchestrateRequestCommand): Promise<RequestId> {
    // 1. Create request (fast)
    const request = Request.create(command);

    // 2. Queue for async processing
    await this.queue.add('orchestrate', {
      requestId: request.getId(),
      command,
    });

    // 3. Return immediately
    return request.getId();
  }

  @Process('orchestrate')
  async processOrchestration(job: Job<OrchestrationJobData>) {
    const { requestId, command } = job.data;

    // Actual orchestration logic here
    // Can take time without blocking API response
  }
}
```

## Evolution & Migration

### Adding New Features

1. **Identify domain concepts** and add to domain layer
2. **Define new ports** if external capabilities needed
3. **Implement use cases** to orchestrate domain objects
4. **Create adapters** for external integrations
5. **Add tests** at all layers

### Migrating Legacy Code

```typescript
// Legacy controller (old way)
@Controller('api')
export class LegacyOrchestrationController {
  @Post('orchestrate')
  async orchestrate(@Body() body: any) {
    // Monolithic logic here
    const result = await this.orchestrationService.orchestrate(body);
    return result;
  }
}

// New hexagonal controller (new way)
@Controller('api/orchestrate')
export class OrchestrationController {
  constructor(private readonly useCase: OrchestrateRequestUseCase) {}

  @Post()
  async orchestrate(@Body() dto: OrchestrateRequestDto) {
    const command = OrchestrateRequestCommand.fromDto(dto);
    const result = await this.useCase.execute(command);
    return OrchestrateResponseDto.fromResult(result);
  }
}
```

### Backward Compatibility

```typescript
// Feature flag for gradual migration
@Injectable()
export class OrchestrationController {
  constructor(
    private readonly legacyService: LegacyOrchestrationService,
    private readonly newUseCase: OrchestrateRequestUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async orchestrate(@Body() body: any) {
    if (this.config.get('USE_NEW_ARCHITECTURE', false)) {
      // New hexagonal implementation
      return this.handleNew(body);
    } else {
      // Legacy implementation
      return this.handleLegacy(body);
    }
  }
}
```

This architecture provides a solid foundation for long-term maintainability and scalability while allowing gradual migration from legacy code.

(TBD - hexagonal structure)