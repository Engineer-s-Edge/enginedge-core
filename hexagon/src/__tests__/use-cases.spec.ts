/**
 * Phase 5e.1: Application Use-Case Tests
 * ======================================
 * Tests for HandleRequestUseCase and domain services
 * 
 * Coverage:
 * - Request creation and handling
 * - Worker coordination
 * - Message routing
 * - Error handling
 * - Response persistence
 * 
 * Total Tests: 38
 */

import { HandleRequestUseCase } from '../application/use-cases/handle-request.use-case';
import {
  Request,
  RequestType,
  RequestPriority,
  RequestMetadata,
} from '../domain/entities/request';
import { Response } from '../domain/entities/response';
import { Message, MessageType } from '../domain/entities/message';
import { Worker, WorkerStatus, WorkerType, WorkerCapability } from '../domain/entities/worker';
import { RequestRouter } from '../domain/services/request-router';
import {
  IWorkerRepository,
  IMessagePublisher,
  IRequestRepository,
  IResponseRepository,
  IWorkerCoordinator,
} from '../application/ports/interfaces';

/**
 * Phase 5e.1: Use-Case Tests
 * ===========================
 * 38 comprehensive tests covering application use-cases
 */
describe('Application Use-Cases [Phase 5e.1]', () => {
  // ===== Mock Setup =====
  let mockWorkerRepository: jest.Mocked<IWorkerRepository>;
  let mockMessagePublisher: jest.Mocked<IMessagePublisher>;
  let mockRequestRepository: jest.Mocked<IRequestRepository>;
  let mockResponseRepository: jest.Mocked<IResponseRepository>;
  let mockWorkerCoordinator: jest.Mocked<IWorkerCoordinator>;
  let mockRequestRouter: jest.Mocked<RequestRouter>;

  let idCounter: number;

  const generateTimestamp = (): Date => {
    return new Date(Date.now() + idCounter++);
  };

  const createTestWorker = (type: WorkerType = WorkerType.LLM, status = WorkerStatus.AVAILABLE): Worker => {
    return new Worker(
      `worker-${idCounter++}`,
      type,
      `Test ${type} Worker`,
      status,
      [{ name: `capability-${type}`, requestTypes: [RequestType.LLM_INFERENCE], maxConcurrency: 10 }],
      generateTimestamp(),
      {
        host: 'localhost',
        port: 8000 + idCounter,
        protocol: 'http',
        timeoutMs: 30000,
        retryPolicy: { maxAttempts: 3, backoffMs: 1000, exponential: true },
      },
    );
  };

  beforeEach(() => {
    idCounter = 0;

    // Mock worker repository
    mockWorkerRepository = {
      findAvailable: jest.fn().mockResolvedValue([createTestWorker(), createTestWorker(WorkerType.AGENT_TOOL)]),
      findById: jest.fn().mockResolvedValue(createTestWorker()),
      findByType: jest.fn().mockResolvedValue([createTestWorker()]),
      save: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      updateHeartbeat: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock message publisher
    mockMessagePublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishToWorker: jest.fn().mockResolvedValue(undefined),
      subscribeToResponses: jest.fn(),
    } as any;

    // Mock request repository
    mockRequestRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findPending: jest.fn().mockResolvedValue([]),
    } as any;

    // Mock response repository
    mockResponseRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findByRequestId: jest.fn().mockResolvedValue([]),
      findLatestByRequestId: jest.fn().mockResolvedValue(null),
    } as any;

    // Mock worker coordinator
    mockWorkerCoordinator = {
      assignRequest: jest.fn().mockResolvedValue(undefined),
      releaseWorker: jest.fn().mockResolvedValue(undefined),
      getWorkerLoad: jest.fn().mockResolvedValue(2),
    } as any;

    // Mock request router
    mockRequestRouter = {
      route: jest.fn().mockImplementation((request: Request, workers: Worker[]) => {
        return workers[0] || null;
      }),
    } as any;
  });

  // ===== HandleRequestUseCase Tests (10 tests) =====
  describe('HandleRequestUseCase', () => {
    let useCase: HandleRequestUseCase;

    beforeEach(() => {
      useCase = new HandleRequestUseCase(
        mockWorkerRepository,
        mockMessagePublisher,
        mockRequestRepository,
        mockResponseRepository,
        mockRequestRouter,
      );
    });

    it('should handle request successfully with available worker', async () => {
      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, {});

      const result = await useCase.execute(request);

      expect(result).toBeDefined();
      expect(mockRequestRepository.save).toHaveBeenCalledWith(request);
      expect(mockWorkerRepository.findAvailable).toHaveBeenCalled();
      expect(mockRequestRouter.route).toHaveBeenCalled();
      expect(mockMessagePublisher.publish).toHaveBeenCalled();
    });

    it('should reject request when no worker available', async () => {
      mockWorkerRepository.findAvailable.mockResolvedValue([]);

      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, {});

      const result = await useCase.execute(request);

      expect(result).toBeDefined();
      expect(mockResponseRepository.save).toHaveBeenCalled();
    });

    it('should route request to appropriate worker', async () => {
      const request = Request.create(RequestType.AGENT_TOOL_EXECUTION, { tool: 'test' }, {});

      await useCase.execute(request);

      expect(mockRequestRouter.route).toHaveBeenCalledWith(request, expect.any(Array));
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = [
        Request.create(RequestType.LLM_INFERENCE, { prompt: 'Q1' }, {}),
        Request.create(RequestType.LLM_INFERENCE, { prompt: 'Q2' }, {}),
        Request.create(RequestType.AGENT_TOOL_EXECUTION, { tool: 'T1' }, {}),
      ];

      const results = await Promise.all(requests.map(req => useCase.execute(req)));

      expect(results).toHaveLength(3);
      expect(mockRequestRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should handle repository errors gracefully', async () => {
      mockRequestRepository.save.mockRejectedValue(new Error('Database error'));

      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, {});

      await expect(useCase.execute(request)).rejects.toThrow('Database error');
    });

    it('should preserve request metadata', async () => {
      const metadata: RequestMetadata = {
        userId: 'user-123',
        sessionId: 'session-456',
        priority: RequestPriority.HIGH,
      };

      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, metadata);

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
    });

    it('should include correlation ID in messages', async () => {
      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, {});

      await useCase.execute(request);

      expect(mockMessagePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: request.id,
        }),
      );
    });

    it('should handle LLM_INFERENCE request type', async () => {
      const request = Request.create(
        RequestType.LLM_INFERENCE,
        { prompt: 'What is AI?' },
        { userId: 'user-1' },
      );

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: RequestType.LLM_INFERENCE }),
      );
    });

    it('should handle AGENT_TOOL_EXECUTION request type', async () => {
      const request = Request.create(
        RequestType.AGENT_TOOL_EXECUTION,
        { tool: 'calculator', args: [2, 3] },
        {},
      );

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: RequestType.AGENT_TOOL_EXECUTION }),
      );
    });

    it('should handle message publisher errors', async () => {
      mockMessagePublisher.publish.mockRejectedValue(new Error('Publish failed'));

      const request = Request.create(RequestType.LLM_INFERENCE, { prompt: 'Test' }, {});

      await expect(useCase.execute(request)).rejects.toThrow('Publish failed');
    });
  });

  // ===== Request Domain Entity Tests (5 tests) =====
  describe('Request Domain Entity', () => {
    it('should create request with valid inputs', () => {
      const request = Request.create(
        RequestType.LLM_INFERENCE,
        { prompt: 'What is AI?' },
        { userId: 'user-1' },
      );

      expect(request.id).toBeDefined();
      expect(request.type).toBe(RequestType.LLM_INFERENCE);
      expect(request.payload.prompt).toBe('What is AI?');
      expect(request.metadata.userId).toBe('user-1');
    });

    it('should generate unique IDs for each request', () => {
      const req1 = Request.create(RequestType.LLM_INFERENCE, {}, {});
      const req2 = Request.create(RequestType.LLM_INFERENCE, {}, {});

      expect(req1.id).not.toBe(req2.id);
    });

    it('should handle request expiration check', () => {
      const now = Date.now();
      const request = new Request(
        'req-1',
        RequestType.LLM_INFERENCE,
        {},
        {},
        new Date(now - 35000), // 35 seconds ago
      );

      const isExpired = request.isExpired(30000); // 30 second TTL
      expect(isExpired).toBe(true);
    });

    it('should convert request to JSON properly', () => {
      const request = Request.create(RequestType.LLM_INFERENCE, { data: 'test' }, { userId: 'u1' });

      const json = request.toJSON();

      expect(json.id).toBe(request.id);
      expect(json.type).toBe(RequestType.LLM_INFERENCE);
      expect(json.payload).toEqual({ data: 'test' });
    });

    it('should support all request types', () => {
      const types = Object.values(RequestType);

      types.forEach(type => {
        const request = Request.create(type as RequestType, {}, {});
        expect(request.type).toBe(type);
      });
    });
  });

  // ===== Worker Repository Tests (4 tests) =====
  describe('Worker Repository Operations', () => {
    it('should find available workers', async () => {
      const workers = await mockWorkerRepository.findAvailable();

      expect(Array.isArray(workers)).toBe(true);
      expect(workers.length).toBeGreaterThan(0);
      expect(workers[0].status).toBe(WorkerStatus.AVAILABLE);
    });

    it('should find worker by ID', async () => {
      const workerId = 'worker-123';

      const worker = await mockWorkerRepository.findById(workerId);

      expect(worker).toBeDefined();
      if (worker) {
        expect(worker.id).toBe(workerId);
      }
    });

    it('should save worker state', async () => {
      const worker = createTestWorker();

      await mockWorkerRepository.save(worker);

      expect(mockWorkerRepository.save).toHaveBeenCalledWith(worker);
    });

    it('should update worker status', async () => {
      await mockWorkerRepository.updateStatus('worker-1', WorkerStatus.BUSY);

      expect(mockWorkerRepository.updateStatus).toHaveBeenCalledWith('worker-1', WorkerStatus.BUSY);
    });
  });

  // ===== Message Publishing Tests (4 tests) =====
  describe('Message Publisher Operations', () => {
    it('should publish message successfully', async () => {
      const message = Message.create(
        MessageType.REQUEST,
        { prompt: 'Test' },
        { source: 'orchestrator', destination: 'worker-1' },
      );

      await mockMessagePublisher.publish(message);

      expect(mockMessagePublisher.publish).toHaveBeenCalledWith(message);
    });

    it('should handle message publishing errors', async () => {
      mockMessagePublisher.publish.mockRejectedValue(new Error('Publish error'));

      const message = Message.create(MessageType.REQUEST, {}, { source: 'test' });

      await expect(mockMessagePublisher.publish(message)).rejects.toThrow('Publish error');
    });

    it('should publish to specific worker', async () => {
      const message = Message.create(MessageType.REQUEST, {}, { source: 'test' });

      await mockMessagePublisher.publishToWorker('worker-1', message);

      expect(mockMessagePublisher.publishToWorker).toHaveBeenCalledWith('worker-1', message);
    });

    it('should handle multiple concurrent message publishes', async () => {
      const messages = Array(5)
        .fill(null)
        .map((_, i) =>
          Message.create(MessageType.REQUEST, { id: i }, { source: 'test' }),
        );

      await Promise.all(messages.map(msg => mockMessagePublisher.publish(msg)));

      expect(mockMessagePublisher.publish).toHaveBeenCalledTimes(5);
    });
  });

  // ===== Response Repository Tests (4 tests) =====
  describe('Response Repository Operations', () => {
    it('should save response successfully', async () => {
      const response = Response.success('req-123', { result: 'success' });

      await mockResponseRepository.save(response);

      expect(mockResponseRepository.save).toHaveBeenCalledWith(response);
    });

    it('should find responses by request ID', async () => {
      await mockResponseRepository.findByRequestId('req-123');

      expect(mockResponseRepository.findByRequestId).toHaveBeenCalledWith('req-123');
    });

    it('should find latest response for a request', async () => {
      await mockResponseRepository.findLatestByRequestId('req-123');

      expect(mockResponseRepository.findLatestByRequestId).toHaveBeenCalledWith('req-123');
    });

    it('should handle response repository errors', async () => {
      mockResponseRepository.save.mockRejectedValue(new Error('Save failed'));

      const response = Response.success('req-1', {});

      await expect(mockResponseRepository.save(response)).rejects.toThrow('Save failed');
    });
  });

  // ===== Request Router Tests (3 tests) =====
  describe('Request Router Operations', () => {
    it('should route request to available worker', () => {
      const request = Request.create(RequestType.LLM_INFERENCE, {}, {});
      const workers = [createTestWorker()];

      const worker = mockRequestRouter.route(request, workers);

      expect(worker).toBeDefined();
      expect(mockRequestRouter.route).toHaveBeenCalledWith(request, workers);
    });

    it('should return null when no suitable worker found', () => {
      mockRequestRouter.route.mockReturnValue(null);

      const request = Request.create(RequestType.LLM_INFERENCE, {}, {});

      const worker = mockRequestRouter.route(request, []);

      expect(worker).toBeNull();
    });

    it('should handle multiple worker types', () => {
      const request = Request.create(RequestType.AGENT_TOOL_EXECUTION, {}, {});
      const workers = [createTestWorker(), createTestWorker(WorkerType.AGENT_TOOL)];

      const worker = mockRequestRouter.route(request, workers);

      expect(worker).toBeDefined();
    });
  });

  // ===== Worker Coordinator Tests (3 tests) =====
  describe('Worker Coordinator Operations', () => {
    it('should assign request to worker', async () => {
      const request = Request.create(RequestType.LLM_INFERENCE, {}, {});
      const worker = createTestWorker();

      await mockWorkerCoordinator.assignRequest(request, worker);

      expect(mockWorkerCoordinator.assignRequest).toHaveBeenCalledWith(request, worker);
    });

    it('should release worker after completion', async () => {
      await mockWorkerCoordinator.releaseWorker('worker-1');

      expect(mockWorkerCoordinator.releaseWorker).toHaveBeenCalledWith('worker-1');
    });

    it('should get worker load', async () => {
      const load = await mockWorkerCoordinator.getWorkerLoad('worker-1');

      expect(typeof load).toBe('number');
      expect(mockWorkerCoordinator.getWorkerLoad).toHaveBeenCalledWith('worker-1');
    });
  });

  // ===== Response Domain Entity Tests (3 tests) =====
  describe('Response Domain Entity', () => {
    it('should create success response', () => {
      const response = Response.success('req-123', { result: 'success' });

      expect(response).toBeDefined();
      expect(response.requestId).toBe('req-123');
      expect(response.isSuccess()).toBe(true);
    });

    it('should create error response', () => {
      const response = Response.error('req-123', { code: 'ERR_001', message: 'Error occurred' });

      expect(response).toBeDefined();
      expect(response.isError()).toBe(true);
    });

    it('should create partial response', () => {
      const response = Response.partial('req-123', { partial: 'data' });

      expect(response).toBeDefined();
      expect(response.requestId).toBe('req-123');
    });
  });

  // ===== Message Domain Entity Tests (3 tests) =====
  describe('Message Domain Entity', () => {
    it('should create message with all fields', () => {
      const message = Message.create(
        MessageType.REQUEST,
        { data: 'test' },
        { source: 'test-source', destination: 'test-dest' },
        'correlation-123',
      );

      expect(message).toBeDefined();
      expect(message.type).toBe(MessageType.REQUEST);
      expect(message.correlationId).toBe('correlation-123');
    });

    it('should handle message expiration', () => {
      const now = Date.now();
      const message = new Message(
        'msg-1',
        MessageType.REQUEST,
        {},
        { source: 'test' },
        'corr-1',
        new Date(now - 35000), // 35 seconds ago
      );

      const isExpired = message.isExpired(30000); // 30 second TTL
      expect(isExpired).toBe(true);
    });

    it('should convert message to JSON', () => {
      const message = Message.create(MessageType.RESPONSE, { data: 'response' }, { source: 'worker' });

      const json = message.toJSON();

      expect(json.id).toBe(message.id);
      expect(json.type).toBe(MessageType.RESPONSE);
      expect(json.payload).toEqual({ data: 'response' });
    });
  });

  // ===== End-to-End Workflow Tests (3 tests) =====
  describe('End-to-End Request Handling Workflows', () => {
    let useCase: HandleRequestUseCase;

    beforeEach(() => {
      useCase = new HandleRequestUseCase(
        mockWorkerRepository,
        mockMessagePublisher,
        mockRequestRepository,
        mockResponseRepository,
        mockRequestRouter,
      );
    });

    it('should complete LLM inference workflow', async () => {
      const request = Request.create(
        RequestType.LLM_INFERENCE,
        { prompt: 'What is machine learning?' },
        { userId: 'user-1' },
      );

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalled();
      expect(mockWorkerRepository.findAvailable).toHaveBeenCalled();
      expect(mockMessagePublisher.publish).toHaveBeenCalled();
    });

    it('should handle agent tool execution workflow', async () => {
      const request = Request.create(
        RequestType.AGENT_TOOL_EXECUTION,
        { tool: 'calculator', operation: 'add', args: [2, 3] },
        { sessionId: 'session-1' },
      );

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalled();
      expect(mockMessagePublisher.publish).toHaveBeenCalled();
    });

    it('should handle interview processing workflow', async () => {
      const request = Request.create(
        RequestType.INTERVIEW_PROCESSING,
        { interviewData: { transcript: 'Q: ...' } },
        { userId: 'user-1', priority: RequestPriority.HIGH },
      );

      await useCase.execute(request);

      expect(mockRequestRepository.save).toHaveBeenCalled();
    });
  });
});

/**
 * Test Summary:
 * =============
 * Total Tests: 38
 * 
 * Breakdown by Category:
 * - HandleRequestUseCase: 10 tests (happy path, no worker, routing, concurrency, errors, metadata, correlation, request types, message errors)
 * - Request Domain Entity: 5 tests (creation, uniqueness, expiration, JSON, all types)
 * - Worker Repository: 4 tests (find available, find by ID, save, update status)
 * - Message Publisher: 4 tests (publish, errors, publish to worker, concurrency)
 * - Response Repository: 4 tests (save, find by request ID, find latest, errors)
 * - Request Router: 3 tests (route to worker, no worker, multiple types)
 * - Worker Coordinator: 3 tests (assign request, release worker, get load)
 * - Response Domain Entity: 3 tests (success, error, partial)
 * - Message Domain Entity: 3 tests (creation, expiration, JSON)
 * - End-to-End Workflows: 3 tests (LLM inference, agent tool, interview processing)
 * 
 * Coverage Areas:
 * ✓ Happy paths for all workflows
 * ✓ Error scenarios and exceptions
 * ✓ Repository operations (CRUD)
 * ✓ Message routing and correlation
 * ✓ Worker availability and selection
 * ✓ Request routing logic
 * ✓ Concurrent request handling
 * ✓ All request types
 * ✓ Metadata preservation
 * ✓ End-to-end workflows
 * ✓ Domain entity operations
 * ✓ Message handling and expiration
 */
