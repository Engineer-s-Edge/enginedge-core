# System Design Implementation Plan for EnginEdge Split Repositories

**Version:** 1.0  
**Date:** November 9, 2025  
**Author:** EnginEdge Engineering Team  
**Status:** Planning Phase

---

## Executive Summary

This document provides a comprehensive, FAANG+ quality implementation plan for applying fundamental system design principles across the EnginEdge split repository architecture. The plan addresses scalability, reliability, performance, and distributed systems challenges while maintaining best practices suitable for high-scale production environments.

### Repository Architecture Overview

EnginEdge is architected as a microservices-based system split into six independent repositories:

| Repository | Purpose | Technology Stack | Scale Profile |
|------------|---------|------------------|---------------|
| **enginedge-core** | Main backend services, API gateway, core business logic | Node.js/NestJS, TypeScript | High RPS, low latency |
| **enginedge-frontend** | User interface and client applications | Next.js, React, TypeScript | High traffic, global CDN |
| **enginedge-workers** | Background job processing, interview workers | Node.js/NestJS, TypeScript | High throughput, async |
| **enginedge-datalake** | Data warehouse, ETL pipelines, analytics | Airflow, Spark, Trino, MinIO | High volume, batch processing |
| **enginedge-local-kernel** | Code execution environment, sandbox | Python, Flask | CPU-intensive, isolated |
| **enginedge-scheduling-model** | Scheduling algorithms, optimization | Python, ML models | CPU-intensive, periodic |

### Design Philosophy

This implementation plan follows these core principles:

1. **Cloud-Native First**: Design for containerized, orchestrated environments (Kubernetes)
2. **Observability by Default**: Comprehensive logging, metrics, and tracing
3. **Graceful Degradation**: Systems should fail safely and partially
4. **Data-Driven Decisions**: Measure everything, optimize based on metrics
5. **Security in Depth**: Multiple layers of security controls
6. **Cost Optimization**: Efficient resource utilization without compromising reliability

---

## Table of Contents

1. [Foundations of System Design](#1-foundations-of-system-design)
2. [Scalability Architecture](#2-scalability-architecture)
3. [CAP and PACELC Theorem Implementation](#3-cap-and-pacelc-theorem-implementation)
4. [Load Balancing Strategy](#4-load-balancing-strategy)
5. [Caching Architecture](#5-caching-architecture)
6. [Database Design](#6-database-design)
7. [Networking and API Design](#7-networking-and-api-design)
8. [Performance Metrics and Monitoring](#8-performance-metrics-and-monitoring)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Appendix: Reference Architecture Diagrams](#10-appendix-reference-architecture-diagrams)

---

## 1. Foundations of System Design

### 1.1 Core Concepts and Trade-offs

Before diving into specific implementations, we establish the fundamental concepts that will guide all architectural decisions:

#### Key Performance Indicators

| Metric | Definition | Target (P99) | Critical Services |
|--------|------------|--------------|-------------------|
| **Latency** | Time from request to response | < 200ms | core, frontend |
| **Throughput** | Requests per second | > 10,000 RPS | core, workers |
| **Availability** | System uptime percentage | 99.9% (3-nines) | All services |
| **Reliability** | Successful request ratio | > 99.95% | core, frontend |
| **Consistency** | Data correctness guarantee | Eventual (< 1s) | Most services |

#### The Four Pillars

**Scalability**: The ability to handle increased load by adding resources
- **Vertical Scaling**: Adding more power (CPU, RAM) to existing machines
- **Horizontal Scaling**: Adding more machines to distribute load

**Reliability**: The probability a system will function correctly over time
- Redundancy at every layer
- Automated failover mechanisms
- Health checks and circuit breakers

**Latency**: The time delay in processing and responding to requests
- Minimize network hops
- Optimize database queries
- Cache hot data paths

**Throughput**: The amount of work completed per unit time
- Parallel processing
- Async/non-blocking operations
- Batch operations where appropriate

### 1.2 System Design Principles per Repository

Each repository has different characteristics and requirements:

#### enginedge-core (API-Centric, Low Latency)
- **Primary Concerns**: Latency, throughput, availability
- **Scaling Strategy**: Horizontal with auto-scaling
- **Consistency Model**: Strong consistency for user data, eventual for analytics
- **Critical Path**: API response time < 100ms (P95)

#### enginedge-frontend (User-Facing, Global)
- **Primary Concerns**: Perceived performance, global availability
- **Scaling Strategy**: CDN + edge computing + horizontal scaling
- **Consistency Model**: Eventual consistency acceptable
- **Critical Path**: Time to Interactive (TTI) < 2s

#### enginedge-workers (Throughput-Oriented)
- **Primary Concerns**: Throughput, reliability, cost efficiency
- **Scaling Strategy**: Horizontal with queue-based load distribution
- **Consistency Model**: At-least-once delivery with idempotency
- **Critical Path**: Job completion rate > 99.5%

#### enginedge-datalake (Batch Processing, High Volume)
- **Primary Concerns**: Throughput, storage efficiency, query performance
- **Scaling Strategy**: Horizontal with data partitioning
- **Consistency Model**: Eventual consistency, time-based snapshots
- **Critical Path**: ETL pipeline completion within SLA windows

#### enginedge-local-kernel (Isolation, Security)
- **Primary Concerns**: Security, isolation, resource limits
- **Scaling Strategy**: Horizontal with pod isolation
- **Consistency Model**: Strong consistency for execution results
- **Critical Path**: Execution startup < 500ms

#### enginedge-scheduling-model (Computational)
- **Primary Concerns**: Algorithm accuracy, computation efficiency
- **Scaling Strategy**: Vertical for model training, horizontal for inference
- **Consistency Model**: Eventual consistency for schedule updates
- **Critical Path**: Schedule optimization < 5s

---

## 2. Scalability Architecture

### 2.1 Scalability Fundamentals

Scalability is the system's ability to handle increased load by adding resources. We must carefully balance between vertical and horizontal scaling based on each service's characteristics.

#### Vertical Scaling (Scale Up)
**Definition**: Adding more CPU, RAM, or disk to existing machines.

**Advantages**:
- Simpler application architecture (no distributed system complexity)
- No data partitioning required
- Lower network latency (single machine)
- Easier to debug and monitor

**Disadvantages**:
- Hard limits on maximum capacity (physical hardware limits)
- Single point of failure (no built-in redundancy)
- Downtime required for upgrades
- Cost increases non-linearly (enterprise hardware premium)
- Cannot scale beyond single machine capacity

**Best Use Cases**:
- Databases with strong consistency requirements
- In-memory caching layers
- Monolithic applications
- CPU-intensive computation (model training)

#### Horizontal Scaling (Scale Out)
**Definition**: Adding more machines to distribute load across multiple instances.

**Advantages**:
- Near-infinite scalability (add more nodes)
- Built-in redundancy and fault tolerance
- No downtime for scaling operations
- Cost-efficient (commodity hardware)
- Geographic distribution possible

**Disadvantages**:
- Complex application architecture (distributed systems)
- Data consistency challenges
- Network latency between nodes
- More operational complexity
- Requires load balancing

**Best Use Cases**:
- Stateless API servers
- Microservices
- Background job workers
- Frontend web servers
- Distributed data processing

### 2.2 Scalability Strategy per Repository

#### 2.2.1 enginedge-core (Horizontal Scaling Primary)

**Current Architecture**: NestJS API server

**Scaling Strategy**:
```yaml
Primary: Horizontal Scaling
- Stateless API design
- Session storage in Redis (external)
- Auto-scaling based on CPU/RPS metrics
- Minimum 3 replicas for HA
- Maximum 50 replicas (cost cap)

Secondary: Vertical Scaling
- Database read replicas (scale up)
- Redis cache instances (scale up for memory)
```

**Implementation Plan**:

1. **Stateless Design Enforcement**
   - Remove all in-memory session storage
   - Externalize state to Redis/PostgreSQL
   - Implement JWT-based authentication (no server-side sessions)
   - Ensure all endpoints are idempotent where possible

2. **Kubernetes HPA (Horizontal Pod Autoscaler)**
   ```yaml
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: enginedge-core-hpa
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: enginedge-core
     minReplicas: 3
     maxReplicas: 50
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 70
     - type: Pods
       pods:
         metric:
           name: http_requests_per_second
         target:
           type: AverageValue
           averageValue: "1000"
     behavior:
       scaleDown:
         stabilizationWindowSeconds: 300
         policies:
         - type: Percent
           value: 50
           periodSeconds: 60
       scaleUp:
         stabilizationWindowSeconds: 0
         policies:
         - type: Percent
           value: 100
           periodSeconds: 30
         - type: Pods
           value: 4
           periodSeconds: 30
         selectPolicy: Max
   ```

3. **Resource Limits per Pod**
   ```yaml
   resources:
     requests:
       cpu: 500m
       memory: 512Mi
     limits:
       cpu: 2000m
       memory: 2Gi
   ```

4. **Performance Targets**
   | Metric | Target | Scaling Trigger |
   |--------|--------|-----------------|
   | CPU Utilization | < 70% average | Scale up at 70% |
   | Memory Usage | < 80% | Alert at 80%, investigate |
   | Request Rate | < 1000 RPS/pod | Scale up at 1000 RPS |
   | P99 Latency | < 200ms | Scale up if sustained > 200ms |
   | Error Rate | < 0.1% | Circuit breaker, not scaling issue |

**Reliability Measures**:
- Pod Disruption Budget (PDB): minimum 2 pods always available
- Readiness probes: ensure pods are ready before receiving traffic
- Liveness probes: automatic restart of unhealthy pods
- Rolling updates: max 25% unavailable during deployments
- Multi-AZ deployment: spread pods across availability zones

#### 2.2.2 enginedge-frontend (Hybrid: CDN + Horizontal)

**Current Architecture**: Next.js with SSR/SSG

**Scaling Strategy**:
```yaml
Primary: CDN Edge Caching
- Static assets via CloudFront/Cloudflare
- Edge functions for personalization
- 95%+ cache hit ratio target

Secondary: Horizontal Scaling (Origin Servers)
- Next.js instances for SSR
- Auto-scaling based on cache miss rate
- Minimum 2 replicas (HA)
```

**Implementation Plan**:

1. **CDN Architecture**
   ```
   User Request
        ↓
   [CDN Edge Location] (99% of traffic handled here)
        ↓ (cache miss)
   [Regional CDN Pop]
        ↓ (cache miss)
   [Origin Load Balancer]
        ↓
   [Next.js Pods] (horizontal scaling)
   ```

2. **Caching Strategy**
   | Content Type | Cache Strategy | TTL | Invalidation |
   |--------------|----------------|-----|--------------|
   | Static Assets (JS/CSS) | Cache forever | 1 year | Version-based URLs |
   | Images | Cache aggressively | 30 days | On-demand purge |
   | SSG Pages | Cache with revalidation | 1 hour | ISR (Incremental Static Regeneration) |
   | SSR Pages (Authenticated) | No cache | N/A | N/A |
   | API Routes | Cache per endpoint | 5-60s | Stale-while-revalidate |

3. **Next.js Configuration**
   ```javascript
   // next.config.mjs
   export default {
     output: 'standalone', // Optimized for containers
     compress: true,
     images: {
       domains: ['cdn.enginedge.com'],
       loader: 'cloudflare', // CDN image optimization
       formats: ['image/avif', 'image/webp'],
     },
     experimental: {
       isrMemoryCacheSize: 0, // Disable in-memory ISR cache (use Redis)
     },
   };
   ```

4. **Horizontal Scaling Configuration**
   ```yaml
   minReplicas: 2  # HA minimum
   maxReplicas: 20 # Cost-optimized (CDN handles most load)
   targetCPU: 60%  # Lower threshold (SSR is CPU-intensive)
   ```

5. **Performance Targets**
   | Metric | Target | Implementation |
   |--------|--------|----------------|
   | CDN Cache Hit Ratio | > 95% | Aggressive caching, long TTLs |
   | Time to First Byte (TTFB) | < 100ms | Edge delivery |
   | Largest Contentful Paint (LCP) | < 2.5s | Image optimization, code splitting |
   | First Input Delay (FID) | < 100ms | Minimize JavaScript |
   | Cumulative Layout Shift (CLS) | < 0.1 | Reserve space for dynamic content |

**Reliability Measures**:
- CDN failover across providers (primary: CloudFront, fallback: Cloudflare)
- Stale-while-revalidate: serve stale content if origin is down
- Static fallback pages for critical errors
- Client-side retry logic with exponential backoff

#### 2.2.3 enginedge-workers (Horizontal Scaling + Queue-Based)

**Current Architecture**: NestJS background workers

**Scaling Strategy**:
```yaml
Primary: Horizontal Scaling (Queue-Driven)
- Scale based on queue depth
- Consumer-per-pod model
- Auto-scaling on queue latency

Cost Optimization:
- Use spot/preemptible instances (fault-tolerant)
- Scale to zero during off-hours (if applicable)
```

**Implementation Plan**:

1. **Queue-Based Architecture**
   ```
   [Producer Services]
          ↓
   [Message Queue: Kafka/RabbitMQ/SQS]
          ↓ (fan-out to multiple workers)
   [Worker Pods] × N (auto-scaled)
          ↓
   [Results Storage / Callbacks]
   ```

2. **KEDA (Kubernetes Event-Driven Autoscaler)**
   ```yaml
   apiVersion: keda.sh/v1alpha1
   kind: ScaledObject
   metadata:
     name: enginedge-workers-scaler
   spec:
     scaleTargetRef:
       name: enginedge-workers
     minReplicaCount: 1
     maxReplicaCount: 100
     pollingInterval: 15
     cooldownPeriod: 60
     triggers:
     - type: kafka
       metadata:
         bootstrapServers: kafka.default.svc.cluster.local:9092
         consumerGroup: interview-workers
         topic: interview-jobs
         lagThreshold: '10'  # Scale up if lag > 10 messages per pod
     - type: cpu
       metadata:
         type: Utilization
         value: '80'
   ```

3. **Worker Configuration**
   ```yaml
   resources:
     requests:
       cpu: 1000m      # CPU-intensive (interview processing)
       memory: 1Gi
     limits:
       cpu: 4000m
       memory: 4Gi
   
   # Graceful shutdown for job completion
   terminationGracePeriodSeconds: 300  # 5 minutes to finish current job
   ```

4. **Concurrency Model**
   ```javascript
   // Per-worker concurrency
   const CONCURRENT_JOBS_PER_WORKER = 4;
   
   // Prefetch from queue
   const PREFETCH_COUNT = CONCURRENT_JOBS_PER_WORKER;
   
   // Job timeout
   const JOB_TIMEOUT = 15 * 60 * 1000; // 15 minutes
   ```

5. **Performance Targets**
   | Metric | Target | Scaling Trigger |
   |--------|--------|-----------------|
   | Queue Depth | < 50 messages | Scale up if > 50 |
   | Processing Time (P95) | < 5 minutes | Monitor, optimize |
   | Job Success Rate | > 99% | Alert on failures |
   | Worker Utilization | 70-80% | Scale at 80% |
   | Queue Age (P95) | < 1 minute | Scale up if > 1 min |

**Reliability Measures**:
- At-least-once delivery with idempotency keys
- Dead letter queue (DLQ) for failed jobs after 3 retries
- Job timeout enforcement (prevent stuck workers)
- Graceful shutdown (finish current job before terminating)
- Circuit breaker for downstream dependencies

#### 2.2.4 enginedge-datalake (Hybrid: Compute Horizontal, Storage Vertical)

**Current Architecture**: Spark, Trino, Airflow, MinIO

**Scaling Strategy**:
```yaml
Compute Layer (Horizontal):
- Spark executors (elastic scaling)
- Trino workers (auto-scaling)
- Airflow workers (queue-based scaling)

Storage Layer (Vertical + Horizontal):
- MinIO (distributed object storage)
- PostgreSQL (vertical + read replicas)
```

**Implementation Plan**:

1. **Spark on Kubernetes (Dynamic Allocation)**
   ```yaml
   # Spark configuration
   spark.dynamicAllocation.enabled: true
   spark.dynamicAllocation.minExecutors: 2
   spark.dynamicAllocation.maxExecutors: 100
   spark.dynamicAllocation.initialExecutors: 5
   spark.dynamicAllocation.executorIdleTimeout: 60s
   spark.kubernetes.allocation.batch.size: 5
   
   # Executor resources
   spark.executor.cores: 4
   spark.executor.memory: 8g
   spark.executor.memoryOverhead: 2g
   ```

2. **Trino Cluster Scaling**
   ```yaml
   # Coordinator (single instance, vertical scaling)
   coordinator:
     replicas: 1
     resources:
       requests:
         cpu: 4000m
         memory: 16Gi
       limits:
         cpu: 8000m
         memory: 32Gi
   
   # Workers (horizontal scaling)
   workers:
     minReplicas: 3
     maxReplicas: 50
     resources:
       requests:
         cpu: 4000m
         memory: 16Gi
       limits:
         cpu: 8000m
         memory: 32Gi
   ```

3. **MinIO Distributed Storage**
   ```yaml
   # Distributed MinIO cluster
   mode: distributed
   replicas: 4  # Minimum for distributed mode
   zones: 1
   drivesPerNode: 4
   
   # Storage per node
   persistence:
     storageClass: fast-ssd
     size: 1Ti per drive
   
   # Auto-expansion strategy
   # Add nodes when storage > 70% full
   ```

4. **Airflow Workers (KEDA-based)**
   ```yaml
   # Celery executor with auto-scaling
   executor: CeleryExecutor
   workers:
     keda:
       enabled: true
       minReplicaCount: 2
       maxReplicaCount: 20
       pollingInterval: 10
       query: >-
         SELECT COUNT(*)
         FROM task_instance
         WHERE state = 'queued'
   ```

5. **Performance Targets**
   | Component | Metric | Target |
   |-----------|--------|--------|
   | Spark Jobs | P95 Completion | < 30 minutes |
   | Trino Queries | P95 Latency | < 10 seconds |
   | Airflow DAGs | Success Rate | > 99.5% |
   | MinIO Throughput | Read/Write | > 1 GB/s |
   | Storage Utilization | Capacity | < 70% |

**Reliability Measures**:
- Data replication (MinIO: erasure coding, PostgreSQL: streaming replication)
- Checkpoint and recovery (Spark structured streaming)
- DAG retry policies (Airflow: exponential backoff)
- Query result caching (Trino: result cache for repeated queries)

#### 2.2.5 enginedge-local-kernel (Horizontal + Strict Isolation)

**Current Architecture**: Python Flask execution environment

**Scaling Strategy**:
```yaml
Primary: Horizontal Scaling
- Pod-per-execution (ephemeral)
- Pre-warmed pool of ready kernels
- Auto-scaling based on queue depth

Security: Strict Isolation
- gVisor for container sandboxing
- Network policies (no outbound internet)
- Resource limits (CPU, memory, execution time)
```

**Implementation Plan**:

1. **Pod-per-Execution Model**
   ```yaml
   # Job template for kernel execution
   apiVersion: batch/v1
   kind: Job
   metadata:
     generateName: kernel-exec-
   spec:
     ttlSecondsAfterFinished: 300  # Auto-cleanup
     backoffLimit: 0  # No retries (execution is idempotent)
     template:
       spec:
         restartPolicy: Never
         runtimeClassName: gvisor  # Sandboxing
         containers:
         - name: kernel
           image: enginedge-local-kernel:latest
           resources:
             requests:
               cpu: 500m
               memory: 512Mi
             limits:
               cpu: 2000m
               memory: 2Gi
               ephemeral-storage: 1Gi
           securityContext:
             runAsNonRoot: true
             runAsUser: 1000
             allowPrivilegeEscalation: false
             readOnlyRootFilesystem: true
   ```

2. **Pre-Warmed Pool Strategy**
   ```yaml
   # Pool of ready-to-execute kernels
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: kernel-pool
   spec:
     replicas: 10  # Adjust based on demand
     template:
       spec:
         containers:
         - name: kernel
           image: enginedge-local-kernel:latest
           lifecycle:
             preStop:
               exec:
                 command: ["/bin/sh", "-c", "sleep 5"]
   ```

3. **Scaling Configuration**
   ```yaml
   # KEDA scaler based on execution queue
   apiVersion: keda.sh/v1alpha1
   kind: ScaledObject
   metadata:
     name: kernel-pool-scaler
   spec:
     minReplicaCount: 5   # Always have some ready
     maxReplicaCount: 200 # High burst capacity
     pollingInterval: 5   # Fast response
     triggers:
     - type: prometheus
       metadata:
         serverAddress: http://prometheus:9090
         metricName: kernel_queue_depth
         threshold: '2'  # 2 queued executions per pod
         query: |
           sum(kernel_execution_queue_depth)
   ```

4. **Resource Isolation & Limits**
   ```yaml
   # Per-execution limits
   execution:
     timeoutSeconds: 300  # 5 minutes max
     cpuLimit: 2000m
     memoryLimit: 2Gi
     diskLimit: 1Gi
     networkPolicy: deny-all  # No network access
   ```

5. **Performance Targets**
   | Metric | Target | Notes |
   |--------|--------|-------|
   | Cold Start Time | < 2s | From queue to execution |
   | Warm Start Time | < 500ms | Pre-warmed pool |
   | Execution Success Rate | > 99% | Excluding user code errors |
   | Concurrent Executions | > 100 | Peak capacity |
   | Pod Cleanup Time | < 30s | Post-execution cleanup |

**Reliability Measures**:
- Timeout enforcement (prevent runaway executions)
- Resource cleanup (terminate zombie processes)
- Execution sandboxing (gVisor runtime)
- Network isolation (prevent data exfiltration)
- Audit logging (all executions tracked)

#### 2.2.6 enginedge-scheduling-model (Vertical for Training, Horizontal for Inference)

**Current Architecture**: Python ML scheduling algorithms

**Scaling Strategy**:
```yaml
Training (Vertical):
- GPU-accelerated instances
- Single large node for model training
- Scheduled training runs (not real-time)

Inference (Horizontal):
- CPU-based prediction serving
- Auto-scaling based on prediction requests
- Low-latency requirements
```

**Implementation Plan**:

1. **Training Infrastructure**
   ```yaml
   # Kubernetes Job for model training
   apiVersion: batch/v1
   kind: Job
   metadata:
     name: schedule-model-training
   spec:
     template:
       spec:
         nodeSelector:
           workload-type: ml-training
         containers:
         - name: trainer
           image: enginedge-scheduling-model:latest
           command: ["python", "train.py"]
           resources:
             requests:
               cpu: 8000m
               memory: 32Gi
               nvidia.com/gpu: 1  # Optional: for deep learning models
             limits:
               cpu: 16000m
               memory: 64Gi
               nvidia.com/gpu: 1
           volumeMounts:
           - name: training-data
             mountPath: /data
           - name: model-output
             mountPath: /models
   ```

2. **Inference Serving (Horizontal)**
   ```yaml
   # Deployment for real-time predictions
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: scheduling-inference
   spec:
     replicas: 3
     template:
       spec:
         containers:
         - name: inference
           image: enginedge-scheduling-model:inference
           command: ["python", "serve.py"]
           resources:
             requests:
               cpu: 2000m
               memory: 4Gi
             limits:
               cpu: 4000m
               memory: 8Gi
           readinessProbe:
             httpGet:
               path: /health
               port: 8080
             initialDelaySeconds: 10
             periodSeconds: 5
   
   ---
   # HPA for inference pods
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: scheduling-inference-hpa
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: scheduling-inference
     minReplicas: 3
     maxReplicas: 20
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 70
     - type: Pods
       pods:
         metric:
           name: inference_requests_per_second
         target:
           type: AverageValue
           averageValue: "100"
   ```

3. **Model Versioning & Updates**
   ```python
   # Zero-downtime model updates
   # 1. Train new model version
   # 2. Deploy alongside old version (canary deployment)
   # 3. Gradually shift traffic (10% → 50% → 100%)
   # 4. Rollback if metrics degrade
   
   # Implementation using Argo Rollouts
   apiVersion: argoproj.io/v1alpha1
   kind: Rollout
   metadata:
     name: scheduling-inference
   spec:
     strategy:
       canary:
         steps:
         - setWeight: 10
         - pause: {duration: 10m}
         - setWeight: 50
         - pause: {duration: 10m}
         - setWeight: 100
         analysis:
           templates:
           - templateName: model-accuracy-check
   ```

4. **Performance Targets**
   | Component | Metric | Target |
   |-----------|--------|--------|
   | Training Time | Model convergence | < 2 hours |
   | Inference Latency | P99 prediction time | < 100ms |
   | Model Accuracy | Schedule quality score | > 95% |
   | Inference Throughput | Predictions/sec | > 1000 |
   | Model Freshness | Retraining frequency | Daily |

**Reliability Measures**:
- Model versioning (all models tagged and stored)
- A/B testing (compare model versions)
- Fallback to previous model on errors
- Training job monitoring (detect failures early)
- Inference cache (for common prediction requests)

### 2.3 Cross-Cutting Scalability Concerns

#### 2.3.1 Database Scaling Strategy

**PostgreSQL (Primary Database)**:
```yaml
Architecture: Primary + Read Replicas
- 1 Primary (write traffic) - Vertical scaling
- 3+ Read Replicas (read traffic) - Horizontal scaling
- Connection pooling (PgBouncer)
- Query optimization and indexing

Scaling Triggers:
- CPU > 70%: Add read replica
- Connections > 80% max: Increase connection pool
- Slow query log: Optimize queries, add indexes
- Storage > 70%: Expand volume
```

**Redis (Caching & Sessions)**:
```yaml
Architecture: Redis Cluster
- 6+ nodes (3 primary, 3 replicas)
- Automatic sharding across primaries
- Sentinel for automatic failover

Scaling Triggers:
- Memory > 75%: Add shards or increase memory
- CPU > 60%: Add shards (Redis is single-threaded per instance)
- Network bandwidth > 80%: Add shards
```

#### 2.3.2 Monitoring & Observability for Scaling

**Key Metrics to Track**:
```yaml
Infrastructure:
  - CPU utilization per service
  - Memory usage and allocation
  - Network throughput and latency
  - Disk I/O and storage capacity

Application:
  - Request rate (RPS)
  - Response time (P50, P95, P99)
  - Error rate (4xx, 5xx)
  - Queue depth and processing lag

Business:
  - Active users
  - Concurrent sessions
  - Transaction volume
  - Feature usage patterns
```

**Alerting Rules**:
```yaml
Critical (PagerDuty):
  - Error rate > 1% for 5 minutes
  - P99 latency > 1s for 5 minutes
  - Service availability < 99.9%
  - Database connection pool exhausted

Warning (Slack):
  - CPU > 80% for 15 minutes
  - Memory > 85% for 15 minutes
  - Scaling approaching max replicas
  - Queue lag > 5 minutes
```

### 2.4 Cost Optimization Strategies

While scaling for performance, we must optimize costs:

1. **Right-Sizing**: Start with smaller instances, scale up based on actual usage
2. **Spot/Preemptible Instances**: Use for fault-tolerant workloads (workers, batch jobs)
3. **Auto-Scaling Policies**: Aggressive scale-down during low traffic periods
4. **Reserved Instances**: Commit to baseline capacity for cost savings
5. **Resource Limits**: Prevent runaway resource consumption
6. **Efficiency Metrics**: Cost per request, cost per user, cost per transaction

**Cost Targets per Service**:
| Service | Monthly Budget | Cost per Request |
|---------|----------------|------------------|
| enginedge-core | $5,000 | < $0.0001 |
| enginedge-frontend | $2,000 | < $0.00005 (CDN-optimized) |
| enginedge-workers | $3,000 | < $0.01 per job |
| enginedge-datalake | $4,000 | < $0.001 per query |
| enginedge-local-kernel | $2,000 | < $0.001 per execution |
| enginedge-scheduling-model | $1,000 | < $0.0001 per prediction |

---

## 3. CAP and PACELC Theorem Implementation

### 3.1 Understanding CAP and PACELC

#### CAP Theorem (Brewer's Theorem)

**Definition**: In a distributed system, you can only guarantee **2 out of 3** properties:

1. **Consistency (C)**: All nodes see the same data at the same time
2. **Availability (A)**: Every request receives a response (success or failure)
3. **Partition Tolerance (P)**: System continues operating despite network partitions

**Reality**: Since network partitions are inevitable in distributed systems, we must choose between **CP (Consistency + Partition Tolerance)** or **AP (Availability + Partition Tolerance)**.

```
Network Partition Occurs:
├─ Choose CP: Reject requests to maintain consistency (sacrifice availability)
└─ Choose AP: Accept requests, risk stale data (sacrifice consistency)
```

#### PACELC Theorem (Extension of CAP)

**Definition**: A more nuanced view of distributed system trade-offs:

- **If Partition (P)**: Choose between **Availability (A)** and **Consistency (C)** [CAP theorem]
- **Else (E)**: When system is running normally, choose between **Latency (L)** and **Consistency (C)**

**PACELC Formula**: `PA/EL` or `PC/EC`
- **PA/EL**: Prioritize Availability during partition, Latency during normal operation (eventual consistency)
- **PC/EC**: Prioritize Consistency during partition, Consistency during normal operation (strong consistency)

```
System State:
├─ Network Partition?
│  ├─ Yes: Choose A (availability) or C (consistency)
│  └─ No: Choose L (low latency) or C (consistency)
```

### 3.2 CAP/PACELC Analysis per Repository

#### 3.2.1 enginedge-core (PA/EL - Availability + Latency)

**Classification**: **PA/EL** (Prioritize availability and latency, eventual consistency acceptable for most operations)

**Reasoning**:
- User-facing API must remain responsive (availability critical)
- Low latency required for good UX (< 200ms P99)
- Most operations can tolerate eventual consistency (seconds)
- Strong consistency only for critical operations (payments, authentication)

**Implementation Strategy**:

1. **During Network Partition (PA)**:
   ```yaml
   Strategy: Favor Availability over Consistency
   
   Scenario: Database primary becomes unreachable
   Response:
     - Read from replicas (may be slightly stale)
     - Queue writes for later processing
     - Return cached responses for GET requests
     - Return 202 Accepted for POST/PUT (async processing)
     - Maintain service uptime
   
   Trade-off: Accept eventual consistency (< 5s lag)
   ```

2. **During Normal Operation (EL)**:
   ```yaml
   Strategy: Favor Low Latency over Strong Consistency
   
   Implementation:
     - Read from nearest replica (geographic routing)
     - Write to primary, replicate asynchronously
     - Use write-through cache for hot data
     - Stale-while-revalidate for non-critical reads
   
   Consistency Model: Eventual (typically < 1s)
   Latency Target: < 100ms (P95)
   ```

3. **Exceptions Requiring Strong Consistency (PC/EC)**:
   ```javascript
   // Critical operations that MUST be consistent
   const STRONG_CONSISTENCY_OPERATIONS = [
     'user_authentication',
     'payment_processing',
     'permission_changes',
     'account_deletion',
     'billing_transactions',
   ];
   
   // Implementation: Use distributed transactions or 2PC
   async function executeWithStrongConsistency(operation) {
     // Read from primary only
     const connection = await pool.getPrimaryConnection();
     
     // Use serializable isolation level
     await connection.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
     
     try {
       const result = await operation(connection);
       await connection.query('COMMIT');
       return result;
     } catch (error) {
       await connection.query('ROLLBACK');
       throw error;
     }
   }
   ```

4. **Conflict Resolution**:
   ```javascript
   // For eventually consistent operations
   class ConflictResolver {
     // Last-Write-Wins (LWW) with vector clocks
     resolveConflict(localVersion, remoteVersion) {
       if (remoteVersion.vectorClock.isAfter(localVersion.vectorClock)) {
         return remoteVersion; // Remote is newer
       } else if (localVersion.vectorClock.isAfter(remoteVersion.vectorClock)) {
         return localVersion; // Local is newer
       } else {
         // Concurrent updates - use application logic
         return this.mergeConflicts(localVersion, remoteVersion);
       }
     }
     
     mergeConflicts(v1, v2) {
       // Application-specific merge logic
       // Example: For user preferences, merge non-conflicting fields
       return {
         ...v1,
         ...v2,
         updatedAt: Math.max(v1.updatedAt, v2.updatedAt),
       };
     }
   }
   ```

**Monitoring**:
```yaml
Metrics:
  - replication_lag_seconds (alert if > 5s)
  - consistency_violations_total (alert if > 0 for critical ops)
  - partition_mode_active (boolean, track partition state)
  - eventual_consistency_convergence_time (histogram)
```

#### 3.2.2 enginedge-frontend (PA/EL - Availability + Latency)

**Classification**: **PA/EL** (Strongly favor availability and low latency)

**Reasoning**:
- User experience depends on immediate responsiveness
- Stale data is acceptable for UI rendering
- No critical transactions in frontend (delegated to backend)
- CDN architecture inherently eventual consistency

**Implementation Strategy**:

1. **CDN Edge Consistency Model**:
   ```yaml
   Consistency: Eventual (TTL-based)
   
   Cache Hierarchy:
     1. Browser Cache (max-age=3600)
     2. CDN Edge (TTL=300-3600s)
     3. CDN Origin (TTL=60-300s)
     4. Next.js Server (ISR: revalidate=60s)
   
   Staleness: Acceptable up to 1 hour for static content
   Invalidation: On-demand purge for critical updates
   ```

2. **Optimistic UI Updates**:
   ```typescript
   // Update UI immediately, sync in background
   async function updateUserProfile(updates: ProfileUpdate) {
     // 1. Update local state immediately (optimistic)
     dispatch(updateProfileOptimistic(updates));
     
     try {
       // 2. Send to server in background
       const response = await api.updateProfile(updates);
       
       // 3. Confirm update on success
       dispatch(updateProfileSuccess(response));
     } catch (error) {
       // 4. Rollback on failure
       dispatch(updateProfileFailed());
       showErrorToast('Update failed, changes reverted');
     }
   }
   ```

3. **Stale-While-Revalidate Pattern**:
   ```typescript
   // SWR: Serve stale data, fetch fresh data in background
   import useSWR from 'swr';
   
   function UserDashboard() {
     const { data, error } = useSWR('/api/dashboard', fetcher, {
       revalidateOnFocus: true,
       revalidateOnReconnect: true,
       dedupingInterval: 5000, // Don't refetch within 5s
       errorRetryCount: 3,
       // Stale data is acceptable
       fallbackData: cachedData,
     });
     
     // Show cached/stale data immediately while revalidating
     return <Dashboard data={data} stale={!data} />;
   }
   ```

4. **Partition Handling**:
   ```typescript
   // Offline-first with background sync
   class OfflineQueue {
     private queue: Action[] = [];
     
     async enqueueAction(action: Action) {
       // Store action locally
       this.queue.push(action);
       await this.persistToIndexedDB(action);
       
       // Try to sync immediately
       if (navigator.onLine) {
         await this.sync();
       }
     }
     
     async sync() {
       while (this.queue.length > 0 && navigator.onLine) {
         const action = this.queue[0];
         try {
           await this.executeAction(action);
           this.queue.shift(); // Remove on success
         } catch (error) {
           // Keep in queue, retry later
           break;
         }
       }
     }
   }
   
   // Register service worker for offline support
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/sw.js');
   }
   ```

**Monitoring**:
```yaml
Metrics:
  - cdn_cache_hit_ratio (target > 95%)
  - stale_data_served_percentage
  - offline_actions_queued
  - sync_success_rate
```

#### 3.2.3 enginedge-workers (PC/EL - Consistency + Latency)

**Classification**: **PC/EL** (Prioritize consistency, but optimize latency during normal operation)

**Reasoning**:
- Job processing must be exactly-once or at-least-once with idempotency
- Cannot afford duplicate job execution (e.g., billing, interviews)
- Latency less critical (background jobs)
- Partition requires rejecting work to maintain consistency

**Implementation Strategy**:

1. **During Network Partition (PC)**:
   ```yaml
   Strategy: Favor Consistency over Availability
   
   Scenario: Worker loses connection to queue/database
   Response:
     - STOP accepting new jobs (reject with 503)
     - Complete currently running jobs
     - Gracefully shutdown if partition persists > 5 minutes
     - Do NOT process jobs without ability to commit results
   
   Trade-off: Sacrifice availability to prevent duplicate/lost work
   ```

2. **During Normal Operation (EL)**:
   ```yaml
   Strategy: Optimize for Low Latency while maintaining consistency
   
   Implementation:
     - Use optimistic locking for job claims
     - Batch database writes (group commits)
     - Async result publishing where possible
     - Connection pooling to reduce overhead
   
   Consistency: Strong (guaranteed exactly-once or idempotent at-least-once)
   Latency: Optimized but secondary to correctness
   ```

3. **Exactly-Once Job Processing**:
   ```typescript
   class JobProcessor {
     async processJob(job: Job) {
       const idempotencyKey = job.id;
       
       // 1. Check if already processed (idempotency)
       const existing = await this.db.query(
         'SELECT status FROM job_results WHERE job_id = $1',
         [job.id]
       );
       
       if (existing && existing.status === 'completed') {
         console.log(`Job ${job.id} already processed, skipping`);
         return existing;
       }
       
       // 2. Claim job with database lock
       const claimed = await this.db.query(
         `UPDATE jobs 
          SET status = 'processing', worker_id = $1, claimed_at = NOW()
          WHERE id = $2 AND status = 'pending'
          RETURNING *`,
         [this.workerId, job.id]
       );
       
       if (!claimed.rowCount) {
         throw new Error('Failed to claim job (already claimed)');
       }
       
       // 3. Process job
       const result = await this.executeJob(job);
       
       // 4. Atomically commit result and mark complete
       await this.db.transaction(async (tx) => {
         await tx.query(
           'INSERT INTO job_results (job_id, result, status) VALUES ($1, $2, $3)',
           [job.id, result, 'completed']
         );
         
         await tx.query(
           'UPDATE jobs SET status = $1, completed_at = NOW() WHERE id = $2',
           ['completed', job.id]
         );
       });
       
       return result;
     }
     
     // Health check: Verify database connectivity
     async healthCheck() {
       try {
         await this.db.query('SELECT 1');
         return true;
       } catch (error) {
         console.error('Database unreachable, entering degraded mode');
         return false;
       }
     }
   }
   ```

4. **Partition Detection & Response**:
   ```typescript
   class PartitionDetector {
     private consecutiveFailures = 0;
     private readonly FAILURE_THRESHOLD = 3;
     
     async checkHealth() {
       try {
         await Promise.all([
           this.checkDatabase(),
           this.checkQueue(),
           this.checkRedis(),
         ]);
         
         this.consecutiveFailures = 0;
         return HealthStatus.HEALTHY;
       } catch (error) {
         this.consecutiveFailures++;
         
         if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
           // Network partition detected
           await this.enterDegradedMode();
           return HealthStatus.DEGRADED;
         }
         
         return HealthStatus.WARNING;
       }
     }
     
     async enterDegradedMode() {
       // Stop accepting new work
       await this.updateReadinessProbe(false);
       
       // Complete current jobs with extended timeout
       await this.drainCurrentJobs(timeout: 300_000); // 5 minutes
       
       // Shutdown gracefully
       process.exit(1); // Let orchestrator restart us
     }
   }
   ```

**Monitoring**:
```yaml
Metrics:
  - job_processing_duplicates_total (alert if > 0)
  - partition_detected_total
  - jobs_rejected_during_partition
  - consistency_check_failures
```

#### 3.2.4 enginedge-datalake (PA/EL - Availability + Latency)

**Classification**: **PA/EL** (Favor availability and performance for analytics)

**Reasoning**:
- Analytics can tolerate eventual consistency (minutes to hours)
- Query performance critical for user experience
- Historical data immutable (append-only, no conflicts)
- Partition should not block queries (serve potentially stale data)

**Implementation Strategy**:

1. **Data Ingestion (AP during partition)**:
   ```yaml
   Strategy: Always accept writes, resolve conflicts later
   
   MinIO (Object Storage):
     - Write to any available node
     - Eventual consistency (typically < 1s)
     - No coordination required
   
   Kafka (Event Stream):
     - Multi-broker replication
     - Async replication (acks=1 for throughput)
     - Tolerate broker failures
   
   Trade-off: Potential duplicate events, handle with deduplication
   ```

2. **Query Execution (EL during normal operation)**:
   ```sql
   -- Trino query optimization for low latency
   
   -- 1. Query result caching
   SET SESSION query_max_run_time = '10m';
   SET SESSION enable_result_cache = true;
   SET SESSION result_cache_ttl = '1h';
   
   -- 2. Partition pruning
   SELECT * FROM events
   WHERE date >= DATE '2025-11-01'
     AND date < DATE '2025-11-02'  -- Partition key
   ORDER BY timestamp
   LIMIT 1000;
   
   -- 3. Approximate queries for dashboards
   SELECT approx_distinct(user_id) as unique_users,
          approx_percentile(duration, 0.95) as p95_duration
   FROM events
   WHERE date = CURRENT_DATE;
   ```

3. **Deduplication Strategy**:
   ```python
   # Spark job for deduplication
   from pyspark.sql import Window
   from pyspark.sql.functions import row_number, col
   
   def deduplicate_events(df):
       """
       Deduplication using event_id and timestamp.
       Keep the first occurrence based on ingestion time.
       """
       window = Window.partitionBy("event_id").orderBy("ingested_at")
       
       deduplicated = df.withColumn("row_num", row_number().over(window)) \
                        .filter(col("row_num") == 1) \
                        .drop("row_num")
       
       return deduplicated
   
   # Run deduplication periodically (e.g., hourly)
   raw_events = spark.read.parquet("s3://raw-events/")
   clean_events = deduplicate_events(raw_events)
   clean_events.write.mode("overwrite").parquet("s3://clean-events/")
   ```

4. **Replication Strategy**:
   ```yaml
   # MinIO distributed setup
   MinIO:
     mode: distributed
     servers: 4
     drives_per_server: 4
     total_drives: 16
     
   Erasure Coding:
     data_drives: 8
     parity_drives: 8
     # Can tolerate 8 drive failures
     
   Replication:
     # Cross-region replication for disaster recovery
     source_bucket: data-lake-prod
     destination_bucket: data-lake-dr
     replication_lag: < 5 minutes (eventual consistency)
   ```

**Monitoring**:
```yaml
Metrics:
  - ingestion_lag_seconds (alert if > 300)
  - duplicate_events_detected
  - query_cache_hit_ratio
  - replication_lag_seconds
  - data_consistency_check_failures
```

#### 3.2.5 enginedge-local-kernel (PC/EC - Strong Consistency)

**Classification**: **PC/EC** (Prioritize consistency always, security-critical)

**Reasoning**:
- Code execution results must be deterministic and consistent
- Cannot serve stale/inconsistent execution results
- Security: Cannot execute without proper authorization check
- Better to reject execution than execute incorrectly

**Implementation Strategy**:

1. **During Network Partition (PC)**:
   ```yaml
   Strategy: Reject execution, maintain consistency
   
   Scenario: Cannot reach authentication service or result storage
   Response:
     - REJECT new execution requests (return 503)
     - DO NOT execute code without verified authorization
     - DO NOT execute if cannot store results
     - Fail safe: prefer no execution over wrong execution
   
   Trade-off: Availability sacrificed for security and consistency
   ```

2. **During Normal Operation (EC)**:
   ```yaml
   Strategy: Strong consistency, but optimize critical path
   
   Implementation:
     - Verify auth token with auth service (cache for 5 minutes)
     - Execute code in isolated environment
     - Store results atomically (all or nothing)
     - Verify result storage before returning to user
   
   Consistency: Strong (serializable)
   Latency: Accept higher latency for correctness
   ```

3. **Execution Atomicity**:
   ```python
   class KernelExecutor:
       async def execute(self, code: str, context: ExecutionContext):
           # 1. Pre-flight checks (must pass)
           await self.verify_authentication(context.token)
           await self.verify_authorization(context.user_id, context.resource)
           await self.verify_rate_limits(context.user_id)
           
           # 2. Atomic execution
           execution_id = generate_id()
           
           try:
               # Create execution record (pending)
               await self.db.execute(
                   """INSERT INTO executions 
                      (id, user_id, code, status, created_at)
                      VALUES ($1, $2, $3, 'pending', NOW())""",
                   execution_id, context.user_id, code
               )
               
               # Execute in sandbox
               result = await self.sandbox.run(code, timeout=300)
               
               # Atomically store result and update status
               await self.db.transaction(async tx => {
                   await tx.execute(
                       """UPDATE executions 
                          SET status = 'completed', result = $1, 
                              completed_at = NOW()
                          WHERE id = $2""",
                       result, execution_id
                   )
                   
                   await tx.execute(
                       """INSERT INTO execution_logs 
                          (execution_id, stdout, stderr, exit_code)
                          VALUES ($1, $2, $3, $4)""",
                       execution_id, result.stdout, result.stderr, result.exit_code
                   )
               })
               
               return result
               
           except Exception as e:
               # Mark as failed (consistent state)
               await self.db.execute(
                   """UPDATE executions 
                      SET status = 'failed', error = $1, completed_at = NOW()
                      WHERE id = $2""",
                   str(e), execution_id
               )
               raise
       
       async def verify_authentication(self, token: str):
           # Strong consistency: always verify with auth service
           # Cache for short duration to reduce latency
           cached = await self.cache.get(f"auth:{token}")
           if cached and (time.now() - cached.timestamp < 300):
               return cached.user
           
           # Verify with auth service
           user = await self.auth_service.verify(token)
           await self.cache.set(f"auth:{token}", user, ttl=300)
           return user
   ```

4. **Health Checks & Circuit Breaking**:
   ```python
   class CircuitBreaker:
       def __init__(self, failure_threshold=5, timeout=60):
           self.failure_count = 0
           self.failure_threshold = failure_threshold
           self.timeout = timeout
           self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
           self.last_failure_time = None
       
       async def call(self, func):
           if self.state == "OPEN":
               # Check if timeout has passed
               if time.now() - self.last_failure_time > self.timeout:
                   self.state = "HALF_OPEN"
               else:
                   raise ServiceUnavailableError("Circuit breaker is OPEN")
           
           try:
               result = await func()
               
               # Success: reset or close circuit
               if self.state == "HALF_OPEN":
                   self.state = "CLOSED"
                   self.failure_count = 0
               
               return result
               
           except Exception as e:
               self.failure_count += 1
               self.last_failure_time = time.now()
               
               if self.failure_count >= self.failure_threshold:
                   self.state = "OPEN"
               
               raise
   
   # Usage
   circuit_breaker = CircuitBreaker()
   
   async def execute_with_protection(code):
       return await circuit_breaker.call(lambda: execute_kernel(code))
   ```

**Monitoring**:
```yaml
Metrics:
  - execution_auth_failures (alert if spike)
  - execution_storage_failures (alert if > 0)
  - circuit_breaker_open_total
  - consistency_violations (alert if > 0)
```

#### 3.2.6 enginedge-scheduling-model (PA/EC - Availability + Eventual Consistency)

**Classification**: **PA/EC** (Favor availability, eventual consistency acceptable)

**Reasoning**:
- Schedule predictions can be slightly stale
- Model updates don't require immediate propagation
- Inference must remain available (users waiting)
- Training can tolerate inconsistencies (batch process)

**Implementation Strategy**:

1. **Model Versioning (Eventual Consistency)**:
   ```python
   class ModelRegistry:
       def __init__(self):
           self.models = {}  # In-memory cache
           self.version_check_interval = 60  # Check every minute
       
       async def get_model(self, model_name: str):
           # Serve from cache (may be stale)
           if model_name in self.models:
               cached_model = self.models[model_name]
               
               # Async version check (don't block inference)
               if time.now() - cached_model.last_check > self.version_check_interval:
                   asyncio.create_task(self.check_for_updates(model_name))
               
               return cached_model
           
           # Cold start: load model
           return await self.load_model(model_name)
       
       async def check_for_updates(self, model_name: str):
           """Background task: Check for newer model versions"""
           try:
               latest_version = await self.storage.get_latest_version(model_name)
               current_version = self.models[model_name].version
               
               if latest_version > current_version:
                   # New version available, load in background
                   new_model = await self.load_model(model_name, latest_version)
                   
                   # Atomic swap (blue-green deployment)
                   self.models[model_name] = new_model
                   
                   logger.info(f"Updated {model_name} from v{current_version} to v{latest_version}")
           except Exception as e:
               # Don't disrupt serving, log and continue
               logger.error(f"Failed to update model: {e}")
   ```

2. **Inference Serving (High Availability)**:
   ```python
   class InferenceService:
       async def predict(self, features: dict) -> Prediction:
           try:
               # Try primary model
               model = await self.registry.get_model("scheduling-v1")
               return await model.predict(features)
           except Exception as e:
               logger.error(f"Primary model failed: {e}")
               
               # Fallback to previous version
               try:
                   fallback_model = await self.registry.get_model("scheduling-v0")
                   return await fallback_model.predict(features)
               except Exception as e2:
                   logger.error(f"Fallback model failed: {e2}")
                   
                   # Last resort: rule-based heuristic
                   return self.heuristic_predict(features)
       
       def heuristic_predict(self, features: dict) -> Prediction:
           """Simple rule-based fallback when ML models unavailable"""
           # Basic scheduling logic
           return Prediction(
               schedule_time=self.round_robin_assign(features),
               confidence=0.5,  # Low confidence, but available
               source="heuristic"
           )
   ```

3. **Training Pipeline (Eventual Consistency)**:
   ```python
   # Airflow DAG for model training
   from airflow import DAG
   from airflow.operators.python import PythonOperator
   
   def train_model():
       # 1. Extract training data (may be slightly stale)
       data = load_training_data(
           start_date=datetime.now() - timedelta(days=30),
           end_date=datetime.now() - timedelta(hours=1)  # 1 hour lag is acceptable
       )
       
       # 2. Train model
       model = train_scheduling_model(data)
       
       # 3. Validate model
       metrics = evaluate_model(model, validation_data)
       
       if metrics['accuracy'] > 0.95:
           # 4. Publish new version
           version = publish_model(model)
           
           # 5. Gradually rollout (eventual consistency)
           # Inference pods will pick up new version within 1-5 minutes
           logger.info(f"Published model version {version}")
       else:
           logger.warning(f"Model quality insufficient: {metrics}")
   
   dag = DAG(
       'train_scheduling_model',
       schedule_interval='@daily',  # Train once per day
       catchup=False,
   )
   ```

4. **Partition Handling**:
   ```python
   class ResilientInference:
       async def predict_with_fallbacks(self, features: dict):
           # Try remote inference service
           try:
               return await self.remote_predict(features, timeout=1.0)
           except (TimeoutError, ConnectionError):
               logger.warning("Remote inference unavailable, using local cache")
           
           # Fallback 1: Cached predictions for common patterns
           cached = await self.cache.get_similar_prediction(features)
           if cached and cached.confidence > 0.8:
               return cached
           
           # Fallback 2: Local embedded model (smaller, less accurate)
           try:
               return await self.local_model.predict(features)
           except Exception:
               pass
           
           # Fallback 3: Simple heuristic
           return self.heuristic_predict(features)
   ```

**Monitoring**:
```yaml
Metrics:
  - model_version_lag_seconds (time since latest version deployed)
  - inference_fallback_rate (% using fallback strategies)
  - prediction_confidence_score (histogram)
  - model_update_success_rate
```

### 3.3 Consistency Models Summary

| Repository | CAP/PACELC | Partition Strategy | Normal Operation | Use Cases |
|------------|------------|-------------------|------------------|-----------|
| **enginedge-core** | PA/EL | Serve from replicas, queue writes | Read from nearest, async replication | Most API operations |
| **enginedge-core** (critical) | PC/EC | Reject requests | Strong consistency (2PC) | Auth, payments |
| **enginedge-frontend** | PA/EL | Offline queue, stale data | CDN caching, optimistic updates | UI rendering |
| **enginedge-workers** | PC/EL | Stop accepting jobs | Exactly-once processing | Job execution |
| **enginedge-datalake** | PA/EL | Accept writes, dedup later | Query caching, approx queries | Analytics |
| **enginedge-local-kernel** | PC/EC | Reject executions | Verify before execute | Code execution |
| **enginedge-scheduling-model** | PA/EC | Serve stale predictions | Eventual model updates | ML inference |

### 3.4 Implementation Checklist

**For Each Service**:
- [ ] Document CAP/PACELC classification
- [ ] Implement partition detection logic
- [ ] Define partition response strategy (favor C or A)
- [ ] Implement consistency guarantees (strong vs eventual)
- [ ] Add monitoring for replication lag
- [ ] Test partition scenarios (chaos engineering)
- [ ] Document fallback behaviors
- [ ] Implement conflict resolution (if eventual consistency)
- [ ] Add circuit breakers for dependencies
- [ ] Measure and optimize latency vs consistency trade-offs

---

## 4. Load Balancing Strategy

### 4.1 Load Balancing Fundamentals

Load balancing is the practice of distributing network traffic across multiple servers to ensure no single server bears too much load. This improves responsiveness, availability, and prevents server overload.

#### Key Load Balancing Algorithms

**1. Round Robin**
```
Request Flow: Server1 → Server2 → Server3 → Server1 → ...

Advantages:
- Simple to implement
- Fair distribution (equal load)
- No server state needed

Disadvantages:
- Ignores server capacity/health
- Ignores current server load
- Poor for long-lived connections

Best For: Homogeneous servers with similar capacity
```

**2. Weighted Round Robin**
```
Servers: A(weight=3), B(weight=2), C(weight=1)
Distribution: A, A, A, B, B, C, A, A, A, B, B, C, ...

Advantages:
- Accounts for server capacity differences
- Predictable distribution

Disadvantages:
- Static weights (doesn't adapt to real-time load)

Best For: Heterogeneous servers with known capacity ratios
```

**3. Least Connections**
```
Request → Server with fewest active connections

Advantages:
- Dynamic load distribution
- Better for long-lived connections
- Adapts to actual server load

Disadvantages:
- Requires tracking connection state
- More complex implementation

Best For: Applications with varying request durations
```

**4. Least Response Time**
```
Request → Server with lowest (response_time * active_connections)

Advantages:
- Performance-aware routing
- Adapts to server health/performance

Disadvantages:
- Requires health monitoring
- More overhead

Best For: Latency-sensitive applications
```

**5. IP Hash / Session Affinity (Sticky Sessions)**
```
hash(client_ip) % num_servers = target_server

Advantages:
- Same client always hits same server
- Maintains session state
- Predictable routing

Disadvantages:
- Uneven distribution if clients clustered
- Server failure disrupts those clients
- Harder to scale

Best For: Stateful applications, session caching
```

**6. Consistent Hashing**
```
Ring-based hashing: Servers and keys both hashed onto ring

Advantages:
- Minimal reshuffling when adding/removing servers
- Good for distributed caches
- Predictable key-to-server mapping

Disadvantages:
- More complex implementation
- Potential hotspots without virtual nodes

Best For: Distributed caching, sharded databases
```

### 4.2 Load Balancing Layers

#### L4 (Transport Layer) Load Balancing
- **Protocol**: TCP/UDP
- **Routing**: Based on IP address and port
- **Performance**: Very fast (no application data inspection)
- **Use Case**: High throughput, low latency requirements

#### L7 (Application Layer) Load Balancing
- **Protocol**: HTTP/HTTPS, gRPC, WebSocket
- **Routing**: Based on URL path, headers, cookies, request content
- **Performance**: Slower (must parse application data)
- **Use Case**: Complex routing rules, API gateways

### 4.3 Load Balancing Implementation per Repository

#### 4.3.1 enginedge-core (L7 with Least Connections + Health Checks)

**Architecture**:
```
[External Load Balancer] (AWS ALB / NGINX Ingress)
        ↓
[Service Mesh] (Istio / Linkerd) - Optional
        ↓
[enginedge-core Pods] × N
```

**Kubernetes Service Configuration**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: enginedge-core
  annotations:
    # AWS ALB annotations
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: "http"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-path: "/health"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-interval: "10"
spec:
  type: LoadBalancer
  sessionAffinity: None  # Stateless, no sticky sessions needed
  selector:
    app: enginedge-core
  ports:
  - name: http
    port: 80
    targetPort: 3000
    protocol: TCP
```

**NGINX Ingress Controller Configuration**:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: enginedge-core-ingress
  annotations:
    nginx.ingress.kubernetes.io/load-balance: "least_conn"
    nginx.ingress.kubernetes.io/upstream-hash-by: "$request_uri"  # Cache-friendly
    nginx.ingress.kubernetes.io/affinity: "cookie"  # Optional: for WebSocket
    nginx.ingress.kubernetes.io/affinity-mode: "balanced"
    
    # Connection settings
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "5"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    
    # Keep-alive for better performance
    nginx.ingress.kubernetes.io/upstream-keepalive-connections: "100"
    nginx.ingress.kubernetes.io/upstream-keepalive-timeout: "60"
    
    # Rate limiting (per IP)
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "5"
spec:
  ingressClassName: nginx
  rules:
  - host: api.enginedge.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: enginedge-core
            port:
              number: 80
```

**Health Check Implementation**:
```typescript
// src/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}
  
  @Get()
  async healthCheck(): Promise<HealthStatus> {
    // Liveness probe: Is the service running?
    return { status: 'ok', timestamp: Date.now() };
  }
  
  @Get('ready')
  async readinessCheck(): Promise<ReadinessStatus> {
    // Readiness probe: Can the service handle requests?
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
    ]);
    
    const allHealthy = checks.every(c => c.status === 'fulfilled');
    
    if (!allHealthy) {
      throw new ServiceUnavailableException('Service not ready');
    }
    
    return {
      status: 'ready',
      checks: {
        database: checks[0].status,
        redis: checks[1].status,
        memory: checks[2].status,
      },
      timestamp: Date.now(),
    };
  }
  
  private async checkDatabase(): Promise<void> {
    const result = await this.dbService.query('SELECT 1');
    if (!result) throw new Error('Database check failed');
  }
  
  private async checkRedis(): Promise<void> {
    await this.redisService.ping();
  }
  
  private async checkMemory(): Promise<void> {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    if (heapUsedPercent > 90) {
      throw new Error('Memory usage too high');
    }
  }
}
```

**Algorithm Choice**: **Least Connections**
- API requests have varying durations (some queries are expensive)
- Better distribution than round robin for mixed workloads
- Health checks ensure traffic only to healthy pods

**Monitoring**:
```yaml
metrics:
  - load_balancer_active_connections
  - load_balancer_requests_per_backend
  - load_balancer_backend_response_time
  - load_balancer_backend_failures
  - health_check_success_rate
```

#### 4.3.2 enginedge-frontend (CDN + Geographic Load Balancing)

**Multi-Layer Load Balancing**:
```
[DNS/Global Load Balancer] (Route 53, Cloudflare)
        ↓
[Regional CDN Edge Locations] (CloudFront/Cloudflare)
        ↓
[Regional Origin Clusters]
        ↓
[Next.js Pods] × N per region
```

**DNS-Based Geographic Load Balancing**:
```yaml
# Route 53 configuration
Route53:
  RoutingPolicy: Geolocation
  
  Records:
    - Region: us-east-1
      Targets: 
        - cdn-edge-us-east.cloudfront.net
      HealthCheck: true
      
    - Region: eu-west-1
      Targets:
        - cdn-edge-eu-west.cloudfront.net
      HealthCheck: true
      
    - Region: ap-southeast-1
      Targets:
        - cdn-edge-ap-southeast.cloudfront.net
      HealthCheck: true
      
    - Default:  # Fallback
      Targets:
        - cdn-edge-us-east.cloudfront.net

  HealthChecks:
    Protocol: HTTPS
    Path: /health
    Interval: 30s
    FailureThreshold: 3
```

**CDN Load Balancing (Cloudflare Workers)**:
```javascript
// Cloudflare Worker for intelligent origin selection
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Static assets: Always cache
  if (url.pathname.startsWith('/_next/static/')) {
    return fetch(request, {
      cf: {
        cacheTtl: 31536000, // 1 year
        cacheEverything: true,
      },
    });
  }
  
  // API routes: No cache, route to nearest origin
  if (url.pathname.startsWith('/api/')) {
    const origin = selectOrigin(request);
    return fetch(new Request(origin + url.pathname, request));
  }
  
  // SSR pages: Cache with revalidation
  return fetch(request, {
    cf: {
      cacheTtl: 300, // 5 minutes
      cacheEverything: true,
    },
  });
}

function selectOrigin(request) {
  // Get client location from CF headers
  const country = request.headers.get('CF-IPCountry');
  const region = getRegion(country);
  
  // Origin servers by region
  const origins = {
    'us': 'https://us-origin.enginedge.com',
    'eu': 'https://eu-origin.enginedge.com',
    'asia': 'https://asia-origin.enginedge.com',
  };
  
  return origins[region] || origins['us'];
}
```

**Origin Cluster Load Balancing**:
```yaml
# Kubernetes Service for Next.js pods
apiVersion: v1
kind: Service
metadata:
  name: frontend-origin
spec:
  type: LoadBalancer
  sessionAffinity: ClientIP  # Sticky sessions for SSR state
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600  # 1 hour
  selector:
    app: enginedge-frontend
  ports:
  - port: 80
    targetPort: 3000
```

**Algorithm Choice**:
- **Geographic**: Route to nearest CDN edge
- **IP Hash (Sticky)**: At origin level for SSR session consistency
- **Round Robin**: Within origin cluster (stateless Next.js)

**Monitoring**:
```yaml
metrics:
  - cdn_cache_hit_ratio_by_region
  - origin_requests_by_region
  - geographic_distribution
  - origin_failover_events
```

#### 4.3.3 enginedge-workers (Queue-Based Load Distribution)

**Architecture**: Queue acts as load balancer
```
[Job Producers]
        ↓
[Kafka/RabbitMQ/SQS] (Message Queue)
        ↓
[Consumer Groups]
        ↓
[Worker Pods] × N (auto-scaled)
```

**Kafka Consumer Group Load Balancing**:
```typescript
// Worker consumer configuration
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'enginedge-worker',
  brokers: ['kafka:9092'],
});

const consumer = kafka.consumer({
  groupId: 'interview-workers',
  // Partition assignment strategy
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  
  // Load balancing strategy
  partitionAssigners: [
    // Range: Partitions divided evenly across consumers
    // Round-robin: Partitions assigned in round-robin fashion
    // Sticky: Minimize partition movement on rebalance
    'RoundRobinAssigner',
  ],
});

await consumer.connect();

// Subscribe to topics
await consumer.subscribe({
  topics: ['interview-jobs'],
  fromBeginning: false,
});

// Consumer loop
await consumer.run({
  // Process messages in parallel
  partitionsConsumedConcurrently: 3,
  
  eachMessage: async ({ topic, partition, message }) => {
    const job = JSON.parse(message.value.toString());
    
    try {
      await processJob(job);
      
      // Commit offset after successful processing
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (parseInt(message.offset) + 1).toString(),
        },
      ]);
    } catch (error) {
      console.error(`Failed to process job ${job.id}:`, error);
      // Don't commit offset, will retry
    }
  },
});
```

**Consumer Group Rebalancing Strategy**:
```yaml
# Kafka topic configuration
Topics:
  interview-jobs:
    partitions: 20  # More partitions = better parallelism
    replication_factor: 3
    
    # Consumer groups will auto-balance
    # With 20 partitions and 10 workers: 2 partitions per worker
    # Add worker → automatic rebalancing
    # Remove worker → remaining workers pick up partitions

LoadBalancing:
  Algorithm: Partition-based round-robin
  Characteristics:
    - Each partition consumed by exactly one worker in group
    - Load distribution based on partition assignment
    - Automatic rebalancing on worker add/remove
    - Ordered processing within partition
```

**Dead Letter Queue Pattern**:
```typescript
class JobProcessor {
  private readonly MAX_RETRIES = 3;
  
  async processWithRetry(job: Job) {
    const attemptCount = job.metadata?.attemptCount || 0;
    
    try {
      const result = await this.execute(job);
      return result;
    } catch (error) {
      if (attemptCount >= this.MAX_RETRIES) {
        // Send to DLQ after max retries
        await this.sendToDeadLetterQueue(job, error);
        console.error(`Job ${job.id} sent to DLQ after ${attemptCount} attempts`);
      } else {
        // Retry with exponential backoff
        const delayMs = Math.pow(2, attemptCount) * 1000;
        await this.scheduleRetry(job, delayMs, attemptCount + 1);
      }
    }
  }
  
  async sendToDeadLetterQueue(job: Job, error: Error) {
    await this.producer.send({
      topic: 'interview-jobs-dlq',
      messages: [{
        key: job.id,
        value: JSON.stringify({
          ...job,
          error: error.message,
          failedAt: Date.now(),
        }),
      }],
    });
  }
}
```

**Algorithm Choice**: **Queue-Based Partition Assignment**
- Natural load distribution through message queue
- Automatic rebalancing on worker scaling
- Fault tolerance (partition reassigned on worker failure)

**Monitoring**:
```yaml
metrics:
  - consumer_lag_by_partition
  - rebalance_events_total
  - jobs_processed_per_worker
  - dlq_message_count
```

#### 4.3.4 enginedge-datalake (Component-Specific Load Balancing)

**Multi-Component Architecture**:

**1. Trino Coordinator (No Load Balancing - Single Instance)**:
```yaml
# Trino coordinator - stateful, not load balanced
apiVersion: v1
kind: Service
metadata:
  name: trino-coordinator
spec:
  type: ClusterIP
  clusterIP: None  # Headless service
  selector:
    component: coordinator
  ports:
  - port: 8080
```

**2. Trino Workers (Round Robin)**:
```yaml
# Workers are dynamically assigned queries by coordinator
# No external load balancing needed - coordinator handles distribution

Coordinator Query Distribution:
  Algorithm: Node scheduler (built-in)
  Strategy:
    - Considers worker resource availability
    - Data locality (prefer workers with cached data)
    - Network topology
    - Current load
```

**3. MinIO Distributed Storage (Consistent Hashing)**:
```yaml
# MinIO distributed mode
apiVersion: v1
kind: Service
metadata:
  name: minio
spec:
  type: LoadBalancer
  selector:
    app: minio
  ports:
  - name: api
    port: 9000
  - name: console
    port: 9001

---
# MinIO uses consistent hashing internally
# Client connects to any node, request routed to correct node based on object hash

MinIO Internal Load Balancing:
  Algorithm: Consistent Hashing
  
  ObjectToServer Mapping:
    hash(object_name) → server_id
    
  Advantages:
    - Minimal data movement on node add/remove
    - Even distribution across nodes
    - Built-in erasure coding for redundancy
```

**4. Spark Dynamic Executor Allocation**:
```python
# Spark configuration for dynamic load balancing
spark_config = {
    'spark.dynamicAllocation.enabled': 'true',
    'spark.dynamicAllocation.minExecutors': '2',
    'spark.dynamicAllocation.maxExecutors': '100',
    'spark.dynamicAllocation.initialExecutors': '5',
    
    # Executor allocation strategy
    'spark.dynamicAllocation.executorAllocationRatio': '0.5',
    'spark.dynamicAllocation.schedulerBacklogTimeout': '1s',
    'spark.dynamicAllocation.sustainedSchedulerBacklogTimeout': '1s',
    
    # Executor resources
    'spark.executor.cores': '4',
    'spark.executor.memory': '8g',
    
    # Kubernetes-specific
    'spark.kubernetes.allocation.batch.size': '5',  # Add 5 executors at a time
    'spark.kubernetes.allocation.batch.delay': '1s',
}

# Load balancing through task scheduler
# Spark automatically distributes tasks across available executors
```

**5. Airflow Workers (Celery Queue-Based)**:
```python
# Celery configuration for Airflow
CELERY_CONFIG = {
    'broker_url': 'redis://redis:6379/0',
    'result_backend': 'db+postgresql://airflow:airflow@postgres/airflow',
    
    # Load balancing
    'worker_prefetch_multiplier': 4,  # Workers prefetch 4 tasks
    'task_acks_late': True,  # Acknowledge after completion
    
    # Queue routing
    'task_routes': {
        'etl.*': {'queue': 'etl-workers'},
        'ml.*': {'queue': 'ml-workers'},
        'default': {'queue': 'default'},
    },
    
    # Multiple worker pools
    'worker_pool': 'prefork',  # or 'gevent' for I/O-bound
    'worker_concurrency': 8,  # 8 concurrent tasks per worker
}

# Celery uses round-robin by default across workers in a queue
# Can implement custom routing for advanced use cases
```

**Algorithm Summary**:
- **Trino Coordinator**: N/A (single instance)
- **Trino Workers**: Resource-aware scheduling (built-in)
- **MinIO**: Consistent hashing (built-in)
- **Spark**: Dynamic task allocation (built-in)
- **Airflow**: Queue-based round-robin (Celery)

#### 4.3.5 enginedge-local-kernel (Pod-per-Execution - No Traditional Load Balancing)

**Architecture**: Ephemeral execution pods
```
[Execution Request]
        ↓
[Kubernetes API]
        ↓
[Schedule Pod on Available Node]
        ↓
[Execute Code in Isolated Pod]
        ↓
[Cleanup Pod]
```

**Kubernetes Native Load Balancing**:
```yaml
# Kubernetes scheduler handles load balancing automatically
# Based on node resources and pod requirements

apiVersion: batch/v1
kind: Job
metadata:
  generateName: kernel-exec-
spec:
  template:
    spec:
      # Scheduler constraints
      affinity:
        # Spread pods across nodes
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - local-kernel
              topologyKey: kubernetes.io/hostname
      
      # Node selection
      nodeSelector:
        workload-type: cpu-intensive
      
      # Resource requirements (used by scheduler)
      containers:
      - name: kernel
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
```

**Scheduler Algorithm**: **Kubernetes Default Scheduler**
- **Filtering**: Remove nodes that don't meet requirements
- **Scoring**: Rank remaining nodes by available resources
- **Binding**: Assign pod to highest-scoring node

**Custom Scheduler for Advanced Load Balancing**:
```python
# Optional: Custom scheduler for specialized load balancing
from kubernetes import client, config, watch

class KernelScheduler:
    def __init__(self):
        config.load_incluster_config()
        self.v1 = client.CoreV1Api()
    
    def schedule_pod(self, pod):
        # Get all available nodes
        nodes = self.v1.list_node()
        
        # Score nodes based on custom criteria
        scored_nodes = []
        for node in nodes.items:
            score = self.score_node(node, pod)
            scored_nodes.append((node.metadata.name, score))
        
        # Select best node
        scored_nodes.sort(key=lambda x: x[1], reverse=True)
        best_node = scored_nodes[0][0]
        
        # Bind pod to node
        binding = client.V1Binding(
            api_version="v1",
            kind="Binding",
            metadata=client.V1ObjectMeta(name=pod.metadata.name),
            target=client.V1ObjectReference(
                kind="Node",
                api_version="v1",
                name=best_node,
            ),
        )
        
        self.v1.create_namespaced_binding(
            namespace=pod.metadata.namespace,
            body=binding,
        )
    
    def score_node(self, node, pod):
        """Score node based on:
        - Available CPU/memory
        - Number of running kernel pods
        - Node age (prefer newer nodes)
        - Network topology
        """
        # Implementation details...
        pass
```

**Algorithm Choice**: **Kubernetes Bin-Packing Scheduler**
- Automatically distributes pods based on available resources
- No application-level load balancer needed
- Efficient resource utilization

#### 4.3.6 enginedge-scheduling-model (Weighted Round Robin for Inference)

**Inference Serving Load Balancing**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: scheduling-inference
  annotations:
    # Use least response time for inference requests
    nginx.ingress.kubernetes.io/load-balance: "least_time"
spec:
  selector:
    app: scheduling-inference
  ports:
  - port: 80
    targetPort: 8080

---
# Pod-level load balancing with weights based on hardware

apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduling-inference
spec:
  replicas: 5
  template:
    metadata:
      labels:
        app: scheduling-inference
        # Different pod types with different capabilities
        tier: standard  # or 'premium' for GPU-enabled pods
    spec:
      # Standard pods (CPU-only)
      nodeSelector:
        instance-type: cpu-optimized
      containers:
      - name: inference
        resources:
          requests:
            cpu: 2000m
            memory: 4Gi

---
# Premium pods (GPU-enabled) - separate deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduling-inference-premium
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: scheduling-inference
        tier: premium
    spec:
      nodeSelector:
        accelerator: nvidia-tesla-t4
      containers:
      - name: inference
        resources:
          requests:
            cpu: 4000m
            memory: 8Gi
            nvidia.com/gpu: 1
```

**Weighted Routing Configuration**:
```yaml
# Argo Rollouts for canary deployment of new models
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: scheduling-inference
spec:
  replicas: 10
  strategy:
    canary:
      # Gradually shift traffic to new model version
      steps:
      - setWeight: 10
      - pause: {duration: 5m}
      - setWeight: 30
      - pause: {duration: 5m}
      - setWeight: 60
      - pause: {duration: 5m}
      - setWeight: 100
      
      # Traffic routing
      trafficRouting:
        nginx:
          stableService: scheduling-inference-stable
          canaryService: scheduling-inference-canary
  
  # Service selectors
  selector:
    matchLabels:
      app: scheduling-inference
```

**Algorithm Choice**:
- **Least Response Time**: Route to fastest-responding pod
- **Weighted Canary**: Gradually shift traffic to new model versions
- **Health-Based**: Remove unhealthy pods from rotation

### 4.4 Consistent Hashing Deep Dive

Consistent hashing is crucial for distributed caching and data partitioning.

**Implementation Example (Redis Cluster)**:
```typescript
class ConsistentHashRing {
  private ring: Map<number, string> = new Map();
  private readonly virtualNodes = 150;  // Virtual nodes per physical node
  
  constructor(private nodes: string[]) {
    this.buildRing();
  }
  
  private buildRing() {
    // Add virtual nodes for each physical node
    for (const node of this.nodes) {
      for (let i = 0; i < this.virtualNodes; i++) {
        const hash = this.hash(`${node}:${i}`);
        this.ring.set(hash, node);
      }
    }
  }
  
  getNode(key: string): string {
    const hash = this.hash(key);
    
    // Find first node clockwise from hash position
    const sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
    
    for (const nodeHash of sortedHashes) {
      if (nodeHash >= hash) {
        return this.ring.get(nodeHash)!;
      }
    }
    
    // Wrap around to first node
    return this.ring.get(sortedHashes[0])!;
  }
  
  addNode(node: string) {
    this.nodes.push(node);
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hash(`${node}:${i}`);
      this.ring.set(hash, node);
    }
  }
  
  removeNode(node: string) {
    this.nodes = this.nodes.filter(n => n !== node);
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hash(`${node}:${i}`);
      this.ring.delete(hash);
    }
  }
  
  private hash(key: string): number {
    // Simple hash function (use better hash in production)
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// Usage
const hashRing = new ConsistentHashRing(['redis1', 'redis2', 'redis3']);
const targetNode = hashRing.getNode('user:12345');  // Returns 'redis2'

// Adding a node only affects ~1/N keys
hashRing.addNode('redis4');
```

**Benefits**:
- Adding/removing nodes affects only K/N keys (K = total keys, N = nodes)
- Compared to modulo hashing where all keys are remapped
- Critical for cache clusters and distributed databases

### 4.5 Load Balancing Best Practices

**1. Health Checks**:
```yaml
Liveness Probe:
  - Checks if service is running
  - Restart pod if fails
  - Simple check (e.g., HTTP 200)

Readiness Probe:
  - Checks if service can handle requests
  - Remove from load balancer if fails
  - Comprehensive check (DB, cache, downstream services)

Startup Probe:
  - For slow-starting applications
  - Delays liveness probe until startup complete
```

**2. Circuit Breaking**:
```typescript
// Prevent cascading failures
class CircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  async call(func: () => Promise<any>) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker OPEN');
    }
    
    try {
      const result = await func();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }
  
  private onFailure() {
    this.failures++;
    if (this.failures >= 5) {
      this.state = 'OPEN';
      setTimeout(() => this.state = 'HALF_OPEN', 60000);
    }
  }
}
```

**3. Connection Pooling**:
```typescript
// Reuse connections for better performance
import { Pool } from 'pg';

const pool = new Pool({
  host: 'postgres',
  database: 'enginedge',
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Load balancer can efficiently distribute across pooled connections
```

**4. Monitoring & Alerting**:
```yaml
Key Metrics:
  - requests_per_backend
  - response_time_per_backend
  - error_rate_per_backend
  - active_connections_per_backend
  - health_check_failures
  
Alerts:
  - Backend error rate > 5%
  - Response time P95 > 1s
  - Backend unavailable
  - Uneven load distribution (variance > 30%)
```

### 4.6 Load Balancing Decision Matrix

| Repository | Layer | Algorithm | Reason | Session Affinity |
|------------|-------|-----------|--------|------------------|
| **enginedge-core** | L7 | Least Connections | Varying request durations | No (stateless) |
| **enginedge-frontend** | L7 | Geographic + IP Hash | CDN + SSR sessions | Yes (SSR only) |
| **enginedge-workers** | Queue | Partition-based | Message queue distribution | N/A |
| **enginedge-datalake** | Various | Component-specific | Each component optimized separately | Varies |
| **enginedge-local-kernel** | K8s | Bin-packing | Resource-based scheduling | N/A |
| **enginedge-scheduling-model** | L7 | Least Response Time | Performance-aware | No |

---

## 5. Caching Architecture

### 5.1 Caching Fundamentals

Caching is the practice of storing frequently accessed data in fast-access storage layers to reduce latency, decrease database load, and improve system throughput.

#### Cache Hit vs Cache Miss

```
Request Flow:
1. Check cache → HIT: Return cached data (fast, ~1ms)
                → MISS: Fetch from origin (slow, ~100ms+)
2. On miss: Store in cache for future requests
3. Return data to client

Cache Hit Ratio = Hits / (Hits + Misses)
Target: > 90% for most use cases
```

#### Caching Layers (Closest to Farthest)

```
[Client Browser Cache] ← 0ms (no network)
        ↓
[CDN Edge Cache] ← 10-50ms
        ↓
[Application Cache (Redis)] ← 1-5ms
        ↓
[Database Query Cache] ← 10-20ms
        ↓
[Database] ← 50-200ms
```

### 5.2 Cache Eviction Policies

**1. LRU (Least Recently Used)**
```
Strategy: Evict items not accessed for longest time
Use Case: General purpose, predictable access patterns
Example: User session data, API responses

Implementation:
- Doubly-linked list + hash map
- O(1) get and put operations
- Most recent at head, least recent at tail
```

**2. LFU (Least Frequently Used)**
```
Strategy: Evict items with lowest access frequency
Use Case: Hot data that's accessed repeatedly
Example: Popular content, trending items

Trade-off:
- Better for skewed access patterns
- More complex implementation
- May cache old popular items too long
```

**3. TTL (Time To Live)**
```
Strategy: Evict after fixed time period
Use Case: Time-sensitive data, automatic invalidation
Example: Session tokens, temporary data

Configuration:
- Short TTL (1-5min): Frequently changing data
- Medium TTL (1-24hr): Semi-static data
- Long TTL (7-30 days): Static assets
```

**4. FIFO (First In First Out)**
```
Strategy: Evict oldest entries first
Use Case: Simple caching, less common
Example: Log buffers, event streams

Trade-off:
- Simplest implementation
- Doesn't consider access patterns
- Rarely optimal
```

**5. Random Replacement**
```
Strategy: Randomly select item to evict
Use Case: When access patterns unknown
Example: Redis ALLKEYS_RANDOM policy

Trade-off:
- Very fast eviction
- Statistically acceptable for some workloads
```

### 5.3 Cache Invalidation Strategies

**Cache invalidation is one of the hardest problems in computer science.**

**1. Time-Based (TTL)**
```typescript
// Automatic expiration
await redis.setex('user:123', 3600, JSON.stringify(userData));  // 1 hour TTL

Pros: Simple, automatic cleanup
Cons: May serve stale data until expiration
```

**2. Event-Based (Write-Through/Write-Behind)**
```typescript
// Update cache when data changes
async function updateUser(userId: string, updates: any) {
  // 1. Update database
  await db.query('UPDATE users SET ... WHERE id = $1', [userId]);
  
  // 2. Invalidate or update cache
  await redis.del(`user:${userId}`);  // Invalidate (lazy reload)
  // OR
  await redis.set(`user:${userId}`, JSON.stringify(updates));  // Update immediately
}

Pros: Always consistent
Cons: Adds latency to write operations
```

**3. Manual Invalidation**
```typescript
// Explicit purge when needed
async function publishArticle(articleId: string) {
  await db.updateArticleStatus(articleId, 'published');
  
  // Invalidate related caches
  await Promise.all([
    redis.del(`article:${articleId}`),
    redis.del(`articles:list:page:1`),
    redis.del(`author:${authorId}:articles`),
  ]);
}

Pros: Fine-grained control
Cons: Easy to miss invalidation (stale data risk)
```

**4. Cache Tags/Versioning**
```typescript
// Version-based cache keys
const cacheVersion = await redis.get('user:cache:version') || '1';
const cacheKey = `user:${userId}:v${cacheVersion}`;

// Invalidate all user caches by incrementing version
async function invalidateAllUsers() {
  await redis.incr('user:cache:version');
  // All old cache keys become orphaned (eventually expire)
}

Pros: Bulk invalidation without finding all keys
Cons: Old cache entries take space until expiration
```

### 5.4 Caching Patterns

**1. Cache-Aside (Lazy Loading)**
```typescript
async function getUserById(userId: string) {
  // 1. Check cache
  const cached = await redis.get(`user:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // 2. Cache miss: fetch from database
  const user = await db.findUserById(userId);
  
  // 3. Store in cache
  await redis.setex(`user:${userId}`, 3600, JSON.stringify(user));
  
  return user;
}

Pros: Only cache what's needed, resilient to cache failures
Cons: Cache miss penalty, potential thundering herd
```

**2. Read-Through Cache**
```typescript
// Cache layer automatically loads data
class CacheService {
  async get(key: string, loader: () => Promise<any>) {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    
    // Automatically load and cache
    const data = await loader();
    await this.redis.setex(key, this.ttl, JSON.stringify(data));
    return data;
  }
}

// Usage
const user = await cache.get(`user:${userId}`, () => db.findUserById(userId));

Pros: Abstraction layer, cleaner application code
Cons: Cache layer has database dependency
```

**3. Write-Through Cache**
```typescript
async function updateUser(userId: string, updates: any) {
  // Write to cache and database simultaneously
  await Promise.all([
    db.updateUser(userId, updates),
    redis.set(`user:${userId}`, JSON.stringify(updates)),
  ]);
}

Pros: Cache always consistent with database
Cons: Higher write latency, cache may contain rarely-read data
```

**4. Write-Behind (Write-Back) Cache**
```typescript
async function updateUser(userId: string, updates: any) {
  // 1. Write to cache immediately
  await redis.set(`user:${userId}`, JSON.stringify(updates));
  
  // 2. Queue database write for later
  await writeQueue.enqueue({
    type: 'UPDATE_USER',
    userId,
    updates,
  });
}

// Background worker persists to database
async function persistQueuedWrites() {
  const writes = await writeQueue.batch(100);
  await db.batchUpdateUsers(writes);
}

Pros: Low write latency, can batch writes
Cons: Risk of data loss if cache fails before persistence
```

**5. Refresh-Ahead**
```typescript
// Proactively refresh cache before expiration
class RefreshAheadCache {
  async get(key: string, loader: () => Promise<any>, ttl: number) {
    const cached = await this.redis.get(key);
    const ttlRemaining = await this.redis.ttl(key);
    
    if (cached) {
      // If 20% of TTL remaining, refresh in background
      if (ttlRemaining < ttl * 0.2) {
        this.refreshInBackground(key, loader, ttl);
      }
      return JSON.parse(cached);
    }
    
    // Cache miss: load and cache
    const data = await loader();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
  
  private async refreshInBackground(key: string, loader: () => Promise<any>, ttl: number) {
    setImmediate(async () => {
      const data = await loader();
      await this.redis.setex(key, ttl, JSON.stringify(data));
    });
  }
}

Pros: Reduced cache miss rate, better user experience
Cons: More cache churn, wasted refreshes for infrequently accessed data
```

### 5.5 Caching Strategy per Repository

#### 5.5.1 enginedge-core (Multi-Layer Caching)

**Cache Layers**:
```
[Response Cache (Redis)] → API responses
        ↓
[Data Cache (Redis)] → Database query results
        ↓
[Session Cache (Redis)] → User sessions
        ↓
[Query Result Cache (PostgreSQL)] → Database-level caching
```

**Implementation**:

**1. API Response Caching**:
```typescript
// Decorator for caching API responses
export function CacheResponse(ttl: number, keyGenerator?: (req: any) => string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const request = args[0];
      const cacheKey = keyGenerator ? keyGenerator(request) : 
                       `api:${propertyKey}:${JSON.stringify(request.params)}`;
      
      // Check cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache result
      await redis.setex(cacheKey, ttl, JSON.stringify(result));
      
      return result;
    };
    
    return descriptor;
  };
}

// Usage
@Controller('users')
export class UsersController {
  @Get(':id')
  @CacheResponse(300, req => `user:${req.params.id}`)  // 5 minute cache
  async getUser(@Param('id') userId: string) {
    return this.usersService.findById(userId);
  }
  
  @Get(':id/profile')
  @CacheResponse(3600)  // 1 hour cache
  async getUserProfile(@Param('id') userId: string) {
    return this.usersService.getProfile(userId);
  }
}
```

**2. Database Query Caching**:
```typescript
class CachedRepository {
  constructor(
    private readonly db: Database,
    private readonly cache: RedisService,
  ) {}
  
  async findById(table: string, id: string, ttl: number = 300) {
    const cacheKey = `db:${table}:${id}`;
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch from database
    const result = await this.db.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id]
    );
    
    if (result) {
      // Cache with TTL
      await this.cache.setex(cacheKey, ttl, JSON.stringify(result));
    }
    
    return result;
  }
  
  async invalidate(table: string, id: string) {
    await this.cache.del(`db:${table}:${id}`);
  }
}
```

**3. Session Caching**:
```typescript
// Redis session store for Express/NestJS
import * as session from 'express-session';
import * as RedisStore from 'connect-redis';

const sessionStore = new RedisStore({
  client: redisClient,
  prefix: 'session:',
  ttl: 86400,  // 24 hours
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 86400000,  // 24 hours
  },
}));
```

**4. Preventing Thundering Herd**:
```typescript
// Single-flight pattern: Only one request loads data, others wait
class ThunderingHerdCache {
  private pending: Map<string, Promise<any>> = new Map();
  
  async get(key: string, loader: () => Promise<any>, ttl: number) {
    // Check cache
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Check if another request is already loading this key
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }
    
    // Start loading
    const promise = (async () => {
      try {
        const data = await loader();
        await redis.setex(key, ttl, JSON.stringify(data));
        return data;
      } finally {
        this.pending.delete(key);
      }
    })();
    
    this.pending.set(key, promise);
    return promise;
  }
}
```

**Cache Configuration**:
```yaml
Redis:
  maxmemory: 4GB
  maxmemory-policy: allkeys-lru  # LRU eviction
  
Cache TTLs:
  user_profile: 3600s (1 hour)
  user_session: 86400s (24 hours)
  api_response: 300s (5 minutes)
  database_query: 600s (10 minutes)
  public_data: 7200s (2 hours)
  
Cache Hit Ratio Target: > 85%
```

#### 5.5.2 enginedge-frontend (Client + CDN + SSR Caching)

**Multi-Layer Cache Architecture**:
```
[Browser Cache] (max-age)
        ↓
[Service Worker Cache] (offline support)
        ↓
[CDN Edge Cache] (CloudFront/Cloudflare)
        ↓
[Next.js ISR Cache] (Incremental Static Regeneration)
        ↓
[Redis Cache] (shared across Next.js instances)
```

**1. Static Asset Caching**:
```javascript
// next.config.mjs
export default {
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',  // 1 year
          },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400',  // 30 days
          },
        ],
      },
    ];
  },
};
```

**2. ISR (Incremental Static Regeneration)**:
```typescript
// pages/blog/[slug].tsx
export async function getStaticProps({ params }) {
  const post = await fetchPost(params.slug);
  
  return {
    props: { post },
    revalidate: 60,  // Regenerate every 60 seconds if requested
  };
}

export async function getStaticPaths() {
  // Pre-render top 100 posts at build time
  const topPosts = await fetchTopPosts(100);
  
  return {
    paths: topPosts.map(post => ({ params: { slug: post.slug } })),
    fallback: 'blocking',  // Generate other pages on-demand
  };
}
```

**3. API Route Caching (SWR Pattern)**:
```typescript
// Client-side: useSWR hook
import useSWR from 'swr';

function UserProfile({ userId }) {
  const { data, error, mutate } = useSWR(
    `/api/users/${userId}`,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,  // Dedupe requests within 5s
      focusThrottleInterval: 30000,  // Throttle revalidation on focus
    }
  );
  
  // Optimistic update
  async function updateProfile(updates) {
    // Update UI immediately with optimistic data
    mutate({ ...data, ...updates }, false);
    
    // Send to server
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    
    // Revalidate from server
    mutate();
  }
  
  if (error) return <Error />;
  if (!data) return <Loading />;
  return <ProfileView data={data} onUpdate={updateProfile} />;
}
```

**4. Service Worker Caching (Offline Support)**:
```javascript
// public/sw.js
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Cache static assets on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll([
        '/',
        '/offline.html',
        '/_next/static/css/styles.css',
        '/_next/static/js/main.js',
      ]);
    })
  );
});

// Network-first strategy for API calls
self.addEventListener('fetch', event => {
  const { request } = event;
  
  // API requests: Network first, cache fallback
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(request);
        })
    );
    return;
  }
  
  // Static assets: Cache first
  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request);
    })
  );
});
```

**5. CDN Cache Configuration**:
```javascript
// CloudFront cache behaviors
const cacheBehaviors = [
  {
    pathPattern: '/_next/static/*',
    cachePolicyId: 'CacheOptimized',  // Max TTL
    compress: true,
  },
  {
    pathPattern: '/api/*',
    cachePolicyId: 'CachingDisabled',  // No cache for API
    originRequestPolicyId: 'AllViewerExceptHostHeader',
  },
  {
    pathPattern: '/*',
    cachePolicyId: 'CachingOptimizedForUncompressedObjects',
    defaultTTL: 300,  // 5 minutes
    maxTTL: 3600,     // 1 hour
    minTTL: 0,
    forwardedValues: {
      cookies: 'none',
      queryString: true,
    },
  },
];
```

**Cache Configuration**:
```yaml
Browser Cache:
  - Static assets: 1 year (immutable)
  - Images: 30 days
  - HTML: no-cache (revalidate)

CDN Cache:
  - Static assets: 1 year
  - ISR pages: 5-60 minutes
  - API routes: no cache

ISR:
  - Popular pages: revalidate every 60s
  - Normal pages: revalidate every 300s
  - Rare pages: generate on-demand

Target Cache Hit Ratio: > 95% (CDN), > 80% (Browser)
```

#### 5.5.3 enginedge-workers (Job Result Caching)

**Caching Strategy**: Cache completed job results to avoid reprocessing

**Implementation**:
```typescript
class JobProcessor {
  async processJob(job: Job) {
    // Generate idempotency key
    const cacheKey = `job:result:${this.hashJob(job)}`;
    
    // Check if already processed (idempotency + caching)
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`Job ${job.id} result cached, returning immediately`);
      return JSON.parse(cached);
    }
    
    // Process job
    const result = await this.execute(job);
    
    // Cache result (24 hour TTL)
    await redis.setex(cacheKey, 86400, JSON.stringify(result));
    
    return result;
  }
  
  private hashJob(job: Job): string {
    // Hash job parameters to create deterministic cache key
    const canonical = JSON.stringify({
      type: job.type,
      params: job.params,
      // Exclude timestamps, IDs, etc.
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
```

**Cache Configuration**:
```yaml
Redis:
  job_results: 86400s (24 hours)
  idempotency_keys: 3600s (1 hour)
  
Eviction: TTL-based (automatic expiration)
Target: Reduce duplicate job processing by 30%+
```

#### 5.5.4 enginedge-datalake (Query Result Caching)

**Trino Query Result Cache**:
```sql
-- Enable query result caching
SET SESSION enable_result_cache = true;
SET SESSION result_cache_ttl = '1h';

-- Expensive aggregation query (cached for 1 hour)
SELECT 
  date_trunc('day', timestamp) as day,
  count(*) as event_count,
  approx_distinct(user_id) as unique_users
FROM events
WHERE date >= DATE '2025-11-01'
GROUP BY 1
ORDER BY 1;

-- Subsequent identical queries return cached results
```

**Spark DataFrame Caching**:
```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataLake").getOrCreate()

# Load and cache frequently accessed dataset
events_df = spark.read.parquet("s3://data-lake/events/")

# Cache in memory (deserialized)
events_df.cache()
# Or persist with storage level
events_df.persist(StorageLevel.MEMORY_AND_DISK)

# Subsequent operations use cached data
daily_stats = events_df.groupBy("date").count()
user_stats = events_df.groupBy("user_id").count()

# Unpersist when done
events_df.unpersist()
```

**MinIO Object Cache**:
```yaml
# MinIO caching layer
Cache:
  enabled: true
  drives:
    - /mnt/cache1
    - /mnt/cache2
  expiry: 90  # days
  quota: 80  # percentage
  exclude:
    - "*.tmp"
  
# Frequently accessed objects cached on local SSD
# Reduces S3 API calls and improves read performance
```

**Cache Configuration**:
```yaml
Trino:
  query_result_cache: 1-24 hours (based on query pattern)
  
Spark:
  memory_fraction: 0.6 (60% JVM heap for caching)
  storage_level: MEMORY_AND_DISK_SER (serialized, spill to disk)
  
MinIO:
  cache_expiry: 90 days
  cache_quota: 80%
  
Target: Reduce query execution time by 50%+ for repeated queries
```

#### 5.5.5 enginedge-local-kernel (No Caching - Security)

**Strategy**: **DO NOT cache execution results** (security and correctness)

**Reasoning**:
- Code execution must be isolated and fresh
- Caching could leak data between users
- Execution environment must be pristine
- Results are unique per execution (non-deterministic possible)

**Exception**: Cache container images only
```yaml
# Kubernetes image pull policy
spec:
  containers:
  - name: kernel
    image: enginedge-local-kernel:v1.0
    imagePullPolicy: IfNotPresent  # Cache image locally
```

#### 5.5.6 enginedge-scheduling-model (Model + Prediction Caching)

**1. Model Caching (In-Memory)**:
```python
import pickle
from functools import lru_cache

class ModelCache:
    def __init__(self):
        self._models = {}
    
    @lru_cache(maxsize=5)  # Cache up to 5 model versions
    def get_model(self, version: str):
        if version not in self._models:
            # Load model from storage
            with open(f'/models/scheduling_{version}.pkl', 'rb') as f:
                self._models[version] = pickle.load(f)
        return self._models[version]

# Singleton instance
model_cache = ModelCache()
```

**2. Prediction Caching**:
```python
import hashlib
import json
import redis

class PredictionCache:
    def __init__(self):
        self.redis = redis.Redis(host='redis', port=6379, db=0)
        self.ttl = 3600  # 1 hour
    
    def get_prediction(self, features: dict) -> Optional[dict]:
        cache_key = self._hash_features(features)
        cached = self.redis.get(f"prediction:{cache_key}")
        
        if cached:
            return json.loads(cached)
        return None
    
    def cache_prediction(self, features: dict, prediction: dict):
        cache_key = self._hash_features(features)
        self.redis.setex(
            f"prediction:{cache_key}",
            self.ttl,
            json.dumps(prediction)
        )
    
    def _hash_features(self, features: dict) -> str:
        # Create deterministic hash from features
        canonical = json.dumps(features, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

# Usage
@app.route('/predict', methods=['POST'])
def predict():
    features = request.json
    
    # Check cache
    cached = prediction_cache.get_prediction(features)
    if cached:
        return jsonify({**cached, 'cached': True})
    
    # Run prediction
    model = model_cache.get_model('v1')
    prediction = model.predict(features)
    
    # Cache result
    prediction_cache.cache_prediction(features, prediction)
    
    return jsonify({**prediction, 'cached': False})
```

**Cache Configuration**:
```yaml
Model Cache:
  storage: In-memory (LRU)
  max_versions: 5
  eviction: LRU
  
Prediction Cache:
  storage: Redis
  ttl: 3600s (1 hour)
  eviction: TTL-based
  
Target: 60%+ cache hit rate for predictions
```

### 5.6 Redis Configuration Best Practices

**Production Redis Configuration**:
```conf
# /etc/redis/redis.conf

# Memory management
maxmemory 4gb
maxmemory-policy allkeys-lru  # Evict least recently used keys

# Persistence (choose based on requirements)
save 900 1      # Save if 1 key changed in 900s
save 300 10     # Save if 10 keys changed in 300s
save 60 10000   # Save if 10000 keys changed in 60s

# Or disable persistence for pure cache
# save ""

# Append-only file (more durable)
appendonly yes
appendfsync everysec

# Replication
replicaof <master-ip> 6379  # For replicas

# Performance
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Security
requirepass <strong-password>
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""

# Monitoring
slowlog-log-slower-than 10000  # Log queries > 10ms
slowlog-max-len 128
```

**Redis Cluster for High Availability**:
```yaml
# Redis Sentinel for automatic failover
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-sentinel
data:
  sentinel.conf: |
    sentinel monitor mymaster redis-master 6379 2
    sentinel down-after-milliseconds mymaster 5000
    sentinel parallel-syncs mymaster 1
    sentinel failover-timeout mymaster 10000
```

### 5.7 Cache Monitoring and Metrics

**Key Metrics to Track**:
```yaml
Performance Metrics:
  - cache_hit_ratio (target > 90%)
  - cache_miss_ratio
  - average_cache_latency_ms (target < 5ms)
  - p99_cache_latency_ms (target < 20ms)

Resource Metrics:
  - memory_usage_percentage (alert at > 80%)
  - eviction_rate (high = cache too small)
  - keys_count
  - expired_keys_per_second

Operation Metrics:
  - get_operations_per_second
  - set_operations_per_second
  - delete_operations_per_second
  - failed_operations_per_second

Health Metrics:
  - connection_errors
  - timeout_errors
  - replication_lag_seconds (if using replicas)
```

**Alerting Rules**:
```yaml
Critical:
  - cache_hit_ratio < 70% for 15 minutes
  - memory_usage > 95%
  - replication_lag > 10 seconds
  - cache_unavailable

Warning:
  - cache_hit_ratio < 85% for 30 minutes
  - memory_usage > 80%
  - eviction_rate increasing
  - p99_latency > 50ms
```

### 5.8 Caching Anti-Patterns to Avoid

**1. Cache Everything**
```
❌ Bad: Cache all data regardless of access pattern
✅ Good: Cache hot data (80/20 rule - 20% of data = 80% of requests)
```

**2. No Cache Expiration**
```
❌ Bad: Set cache entries with no TTL
✅ Good: Always set appropriate TTL based on data freshness requirements
```

**3. Large Cache Values**
```
❌ Bad: Cache 10MB objects in Redis
✅ Good: Cache small, frequently accessed data; store large objects in object storage
```

**4. Inconsistent Cache Keys**
```
❌ Bad: user:123, User:123, users:123 (different keys for same data)
✅ Good: Standardized key pattern: namespace:entity:id (user:123)
```

**5. Ignoring Cache Failures**
```
❌ Bad: Application crashes if cache is unavailable
✅ Good: Graceful degradation - fallback to database if cache fails
```

### 5.9 Caching Decision Matrix

| Repository | Primary Cache | Eviction Policy | TTL Range | Hit Ratio Target |
|------------|---------------|-----------------|-----------|------------------|
| **enginedge-core** | Redis (multi-layer) | LRU | 5min - 24hr | > 85% |
| **enginedge-frontend** | CDN + Browser + Redis | TTL | 5min - 1yr | > 95% |
| **enginedge-workers** | Redis (job results) | TTL | 1hr - 24hr | > 30% |
| **enginedge-datalake** | Trino + Spark + MinIO | LRU + TTL | 1hr - 90days | > 70% |
| **enginedge-local-kernel** | None (images only) | N/A | N/A | N/A |
| **enginedge-scheduling-model** | In-memory + Redis | LRU + TTL | 1hr | > 60% |

---

## 6. Database Design

### 6.1 SQL vs NoSQL: The Fundamental Choice

#### SQL Databases (Relational)

**Characteristics**:
- **ACID Guarantees**: Atomicity, Consistency, Isolation, Durability
- **Schema-based**: Predefined structure, strict typing
- **Relationships**: Foreign keys, joins across tables
- **Query Language**: Standardized SQL
- **Transactions**: Strong consistency, multi-row transactions

**When to Use SQL**:
```yaml
Use Cases:
  ✅ Complex relationships between entities
  ✅ Need for ACID transactions
  ✅ Complex queries with joins, aggregations
  ✅ Well-defined schema that changes infrequently
  ✅ Financial data, user accounts, inventory
  ✅ Reporting and analytics with complex queries

Examples:
  - PostgreSQL (general purpose)
  - MySQL (web applications)
  - Amazon Aurora (cloud-native)
```

**Advantages**:
- Data integrity and consistency
- Complex query capabilities
- Mature ecosystem and tools
- Wide developer knowledge base

**Disadvantages**:
- Vertical scaling limitations
- Schema changes can be expensive
- Join performance degrades with scale
- Less flexible for rapidly evolving data models

#### NoSQL Databases (Non-Relational)

**Characteristics**:
- **Flexible Schema**: Schema-less or dynamic schema
- **Horizontal Scaling**: Distributed by design
- **Eventual Consistency**: Often favors availability over consistency
- **Specialized**: Different types for different use cases

**Types of NoSQL Databases**:

**1. Document Stores (MongoDB, CouchDB)**
```json
{
  "user_id": "u123",
  "name": "John Doe",
  "email": "john@example.com",
  "preferences": {
    "theme": "dark",
    "notifications": true
  },
  "tags": ["premium", "early-adopter"]
}
```
- Use Case: User profiles, content management, catalogs
- Pros: Flexible schema, nested data, easy to scale
- Cons: No joins, limited transactions (improving)

**2. Key-Value Stores (Redis, DynamoDB)**
```
key: "session:abc123"
value: {"user_id": "u123", "expires": 1699564800}
```
- Use Case: Caching, sessions, real-time data
- Pros: Extremely fast, simple API, horizontally scalable
- Cons: No complex queries, no relationships

**3. Column-Family Stores (Cassandra, HBase)**
```
Row Key: user:u123
Columns: {name: "John", email: "john@...", created: 1699564800}
```
- Use Case: Time-series data, event logging, IoT
- Pros: High write throughput, compression, wide rows
- Cons: Limited query flexibility, eventual consistency

**4. Graph Databases (Neo4j, Amazon Neptune)**
```
(User:u123)-[:FOLLOWS]->(User:u456)
(User:u123)-[:POSTED]->(Post:p789)
```
- Use Case: Social networks, recommendation engines, knowledge graphs
- Pros: Relationship queries, graph algorithms
- Cons: Smaller ecosystem, specialized use case

**When to Use NoSQL**:
```yaml
Use Cases:
  ✅ Massive scale (millions/billions of records)
  ✅ Flexible or frequently changing schema
  ✅ Denormalized data models
  ✅ High write throughput
  ✅ Geographic distribution
  ✅ Specific access patterns (key-value, document, graph)

Examples:
  - MongoDB (document storage)
  - Redis (caching, sessions)
  - Cassandra (time-series, logs)
  - DynamoDB (serverless, high scale)
```

### 6.2 Database Normalization

**Normal Forms** (Organizing data to reduce redundancy):

**1st Normal Form (1NF)**:
```sql
-- ❌ Not 1NF (multivalued attributes)
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  phone_numbers VARCHAR(200)  -- "555-1234, 555-5678" (comma-separated)
);

-- ✅ 1NF (atomic values)
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE user_phones (
  user_id INT REFERENCES users(id),
  phone_number VARCHAR(20),
  PRIMARY KEY (user_id, phone_number)
);
```

**2nd Normal Form (2NF)**:
```sql
-- ❌ Not 2NF (partial dependency on composite key)
CREATE TABLE order_items (
  order_id INT,
  product_id INT,
  product_name VARCHAR(100),  -- Depends only on product_id
  product_price DECIMAL,      -- Depends only on product_id
  quantity INT,
  PRIMARY KEY (order_id, product_id)
);

-- ✅ 2NF (remove partial dependencies)
CREATE TABLE products (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  price DECIMAL
);

CREATE TABLE order_items (
  order_id INT,
  product_id INT REFERENCES products(id),
  quantity INT,
  PRIMARY KEY (order_id, product_id)
);
```

**3rd Normal Form (3NF)**:
```sql
-- ❌ Not 3NF (transitive dependency)
CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  department_id INT,
  department_name VARCHAR(100),  -- Depends on department_id, not employee id
  department_location VARCHAR(100)
);

-- ✅ 3NF (remove transitive dependencies)
CREATE TABLE departments (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  location VARCHAR(100)
);

CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  department_id INT REFERENCES departments(id)
);
```

**Denormalization** (Trading normalization for performance):
```sql
-- Sometimes we intentionally denormalize for read performance
CREATE TABLE order_summary (
  order_id INT PRIMARY KEY,
  user_id INT,
  user_name VARCHAR(100),        -- Denormalized from users table
  total_amount DECIMAL,
  item_count INT,                 -- Denormalized aggregate
  created_at TIMESTAMP
);

-- Trade-off: Faster reads, but must update multiple places on writes
```

### 6.3 Database Indexing

Indexes are data structures that improve query performance at the cost of write performance and storage.

**Index Types**:

**1. B-Tree Index (Default in most databases)**:
```sql
-- Create index
CREATE INDEX idx_users_email ON users(email);

-- Query optimizer uses index for:
SELECT * FROM users WHERE email = 'john@example.com';  -- Fast (index scan)
SELECT * FROM users WHERE email LIKE 'john%';          -- Fast (index scan)
SELECT * FROM users WHERE email LIKE '%john%';         -- Slow (full table scan)

-- Index structure:
-- B-Tree provides O(log n) lookups
-- Good for: equality, range queries, sorting
```

**2. Hash Index**:
```sql
-- PostgreSQL hash index
CREATE INDEX idx_users_id_hash ON users USING HASH (id);

-- Very fast for equality checks: O(1)
-- Cannot be used for range queries
-- Smaller than B-Tree
```

**3. GiST/GIN Index (Full-Text Search)**:
```sql
-- Full-text search index
CREATE INDEX idx_posts_content_fts ON posts USING GIN (to_tsvector('english', content));

-- Fast full-text search
SELECT * FROM posts WHERE to_tsvector('english', content) @@ to_tsquery('database & design');
```

**4. Composite Index**:
```sql
-- Index on multiple columns
CREATE INDEX idx_users_lastname_firstname ON users(last_name, first_name);

-- Efficient for queries using:
-- ✅ WHERE last_name = 'Smith'
-- ✅ WHERE last_name = 'Smith' AND first_name = 'John'
-- ❌ WHERE first_name = 'John' (can't use index - wrong order)

-- Index column order matters!
```

**5. Partial Index**:
```sql
-- Index only subset of rows
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';

-- Much smaller index, faster updates
-- Only useful for queries filtering on status = 'active'
```

**6. Covering Index (Include Columns)**:
```sql
-- Index includes all columns needed by query
CREATE INDEX idx_users_email_covering ON users(email) INCLUDE (name, created_at);

-- Query can be satisfied entirely from index (no table lookup needed)
SELECT name, created_at FROM users WHERE email = 'john@example.com';
-- Index-only scan (fastest)
```

**Index Best Practices**:
```sql
-- ✅ Index foreign keys
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- ✅ Index columns used in WHERE, JOIN, ORDER BY
CREATE INDEX idx_users_created ON users(created_at);

-- ✅ Use EXPLAIN to verify index usage
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'john@example.com';

-- ❌ Don't over-index (slows writes)
-- ❌ Don't index low-cardinality columns (e.g., boolean)
-- ❌ Don't index small tables (full scan faster)
```

### 6.4 Sharding and Partitioning

**Partitioning** (Vertical splitting within single database):
```sql
-- Range partitioning by date
CREATE TABLE events (
  id BIGSERIAL,
  user_id INT,
  event_type VARCHAR(50),
  created_at TIMESTAMP,
  data JSONB
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE events_2025_11 PARTITION OF events
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE events_2025_12 PARTITION OF events
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Queries automatically route to correct partition
SELECT * FROM events WHERE created_at >= '2025-11-15';
-- Only scans events_2025_11 partition (partition pruning)

-- Benefits:
-- - Faster queries (smaller data sets)
-- - Easier archival (drop old partitions)
-- - Better index performance
```

**Sharding** (Horizontal splitting across multiple databases):
```yaml
# Shard by user_id
Shard Key: user_id

Shard 1 (users 0-999):
  Database: shard1.postgres.local
  Contains: user_id 0-999

Shard 2 (users 1000-1999):
  Database: shard2.postgres.local
  Contains: user_id 1000-1999

Shard 3 (users 2000-2999):
  Database: shard3.postgres.local
  Contains: user_id 2000-2999

# Application routes queries to correct shard
```

**Sharding Strategies**:

**1. Hash-Based Sharding**:
```typescript
function getShardId(userId: number, numShards: number): number {
  return hash(userId) % numShards;
}

const shardId = getShardId(12345, 4);  // Returns 0-3
const dbConnection = shardConnections[shardId];
```
- Pros: Even distribution
- Cons: Difficult to add/remove shards (reshuffling required)

**2. Range-Based Sharding**:
```typescript
function getShardId(userId: number): number {
  if (userId < 100000) return 0;
  if (userId < 200000) return 1;
  if (userId < 300000) return 2;
  return 3;
}
```
- Pros: Easy to add new shards, range queries efficient
- Cons: Potential for uneven distribution (hotspots)

**3. Geographic Sharding**:
```typescript
function getShardId(userCountry: string): string {
  const shardMap = {
    'US': 'us-east-db',
    'UK': 'eu-west-db',
    'JP': 'ap-northeast-db',
  };
  return shardMap[userCountry] || 'us-east-db';
}
```
- Pros: Low latency (data close to users), compliance (data residency)
- Cons: Uneven distribution, cross-shard queries expensive

**Challenges with Sharding**:
```yaml
Problems:
  - Cross-shard queries (expensive)
  - Cross-shard joins (avoid if possible)
  - Distributed transactions (use 2PC or avoid)
  - Resharding (adding/removing shards)
  - Shard key selection (critical - can't change easily)

Solutions:
  - Denormalize data to avoid cross-shard queries
  - Use application-level joins
  - Choose shard key carefully (high cardinality, even distribution)
  - Plan for resharding from day one
```

### 6.5 Database Replication

**Primary-Replica (Master-Slave) Replication**:
```
[Primary DB] ← Writes
      ↓
   (replication)
      ↓
[Replica 1] ← Reads
[Replica 2] ← Reads
[Replica 3] ← Reads
```

**Replication Types**:

**1. Synchronous Replication**:
```sql
-- Write acknowledged only after replicas confirm
-- Pros: Strong consistency
-- Cons: Higher latency, availability depends on replicas
-- Use: Financial transactions, critical data
```

**2. Asynchronous Replication**:
```sql
-- Write acknowledged immediately, replicas catch up later
-- Pros: Low latency, high availability
-- Cons: Replica lag, potential data loss on primary failure
-- Use: Most web applications
```

**3. Semi-Synchronous Replication**:
```sql
-- Wait for at least one replica confirmation
-- Pros: Balance of consistency and performance
-- Cons: Slightly higher latency than async
-- Use: Good default for production systems
```

**PostgreSQL Streaming Replication**:
```sql
-- Primary configuration (postgresql.conf)
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
synchronous_commit = on

-- Replica configuration
primary_conninfo = 'host=primary-db port=5432 user=replicator'
hot_standby = on
```

**Read-Write Splitting**:
```typescript
class DatabaseRouter {
  private primary: Connection;
  private replicas: Connection[];
  private replicaIndex = 0;
  
  async executeQuery(query: string, isWrite: boolean = false) {
    if (isWrite) {
      // All writes go to primary
      return this.primary.query(query);
    } else {
      // Reads distributed across replicas (round-robin)
      const replica = this.replicas[this.replicaIndex];
      this.replicaIndex = (this.replicaIndex + 1) % this.replicas.length;
      return replica.query(query);
    }
  }
}

// Usage
await db.executeQuery('INSERT INTO users ...', true);   // → Primary
await db.executeQuery('SELECT * FROM users ...', false); // → Replica
```

**Handling Replication Lag**:
```typescript
class ReplicationAwareQuery {
  async queryWithConsistency(query: string, consistency: 'strong' | 'eventual') {
    if (consistency === 'strong') {
      // Read from primary for strong consistency
      return this.primary.query(query);
    } else {
      // Read from replica (may be slightly stale)
      const replica = this.getHealthyReplica();
      
      // Check lag
      const lag = await this.getReplicationLag(replica);
      if (lag > 5000) {  // More than 5 seconds behind
        console.warn(`High replication lag: ${lag}ms, falling back to primary`);
        return this.primary.query(query);
      }
      
      return replica.query(query);
    }
  }
  
  async getReplicationLag(replica: Connection): Promise<number> {
    // PostgreSQL: Check replication lag
    const result = await replica.query(`
      SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms
    `);
    return result.rows[0].lag_ms;
  }
}
```

### 6.6 Database Architecture per Repository

#### 6.6.1 enginedge-core (PostgreSQL Primary + Read Replicas)

**Architecture**:
```
[Application Pods]
        ↓
[PgBouncer] (connection pooling)
        ↓
[Primary PostgreSQL] ← Writes
        ↓ (streaming replication)
[Replica 1] ← Reads (analytics)
[Replica 2] ← Reads (API queries)
[Replica 3] ← Reads (background jobs)
```

**Schema Design**:
```sql
-- Users table (3NF normalized)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User profiles (1:1 relationship)
CREATE TABLE user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  bio TEXT,
  avatar_url VARCHAR(500),
  preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interviews (main entity)
CREATE TABLE interviews (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview questions (1:N relationship)
CREATE TABLE interview_questions (
  id BIGSERIAL PRIMARY KEY,
  interview_id BIGINT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer TEXT,
  score DECIMAL(5,2),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE status = 'active';
CREATE INDEX idx_interviews_user_id ON interviews(user_id);
CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_interview_questions_interview_id ON interview_questions(interview_id);

-- Full-text search
CREATE INDEX idx_interviews_fts ON interviews USING GIN (to_tsvector('english', title || ' ' || description));
```

**Partitioning Strategy**:
```sql
-- Partition interviews by created_at (monthly)
CREATE TABLE interviews_partitioned (
  id BIGSERIAL,
  user_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- ... other columns
) PARTITION BY RANGE (created_at);

-- Auto-create partitions
CREATE TABLE interviews_2025_11 PARTITION OF interviews_partitioned
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Background job to create future partitions
-- DROP old partitions after retention period (e.g., 2 years)
```

**Connection Pooling (PgBouncer)**:
```ini
; /etc/pgbouncer/pgbouncer.ini
[databases]
enginedge = host=postgres-primary port=5432 dbname=enginedge

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
max_db_connections = 100
```

**Configuration**:
```yaml
Database:
  Type: PostgreSQL 15
  Primary:
    Size: db.r6g.2xlarge (8 vCPU, 64GB RAM)
    Storage: 1TB SSD (io2)
    IOPS: 10000
  Replicas: 3
    Size: db.r6g.xlarge (4 vCPU, 32GB RAM)
  
Connection Pool:
  Tool: PgBouncer
  Max Connections: 1000
  Pool Size: 25 per pod
  
Backup:
  Frequency: Continuous (WAL archiving)
  Retention: 30 days
  Point-in-time recovery: Enabled
```

#### 6.6.2 enginedge-frontend (Minimal Direct Database Access)

**Strategy**: Frontend primarily uses APIs, minimal direct DB access

**Use Cases for Direct DB**:
```sql
-- Next.js Server-Side Rendering (SSR) queries
-- Keep simple, read-only, cached

-- Example: Blog post rendering
SELECT id, title, content, author, published_at
FROM blog_posts
WHERE slug = $1 AND status = 'published'
LIMIT 1;

-- Use connection pooling (Prisma/pg-pool)
-- Cache results aggressively
-- Fallback to API on error
```

**Prisma Configuration**:
```typescript
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=5&pool_timeout=10',
    },
  },
});

// Close connections on serverless
export const closeDatabaseConnections = async () => {
  await prisma.$disconnect();
};
```

#### 6.6.3 enginedge-workers (Write-Heavy, Queue-Based)

**Database Usage Pattern**:
```sql
-- Workers primarily write job results
-- High INSERT throughput required
-- Batch inserts where possible

-- Example: Batch insert interview results
INSERT INTO interview_results (interview_id, question_id, answer, score, metadata)
VALUES 
  ($1, $2, $3, $4, $5),
  ($6, $7, $8, $9, $10),
  ($11, $12, $13, $14, $15)
ON CONFLICT (interview_id, question_id) DO UPDATE
  SET answer = EXCLUDED.answer,
      score = EXCLUDED.score,
      updated_at = CURRENT_TIMESTAMP;

-- Use prepared statements for performance
-- Use COPY for bulk inserts (faster than INSERT)
```

**Write Optimization**:
```typescript
class BatchWriter {
  private batch: any[] = [];
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  
  constructor(private db: Database) {
    // Auto-flush every 5 seconds
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }
  
  async write(data: any) {
    this.batch.push(data);
    
    if (this.batch.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }
  
  async flush() {
    if (this.batch.length === 0) return;
    
    const data = this.batch.splice(0, this.batch.length);
    
    // Use COPY for bulk insert (10x faster than INSERT)
    const stream = this.db.copyFrom('COPY results (id, data) FROM STDIN WITH CSV');
    for (const row of data) {
      stream.write(`${row.id},${row.data}\n`);
    }
    stream.end();
  }
}
```

#### 6.6.4 enginedge-datalake (Multi-Database Strategy)

**Database Components**:

**1. PostgreSQL (Metadata & Configuration)**:
```sql
-- Airflow metadata database
-- Stores DAG definitions, task state, logs

-- Minimal queries, mostly writes
-- Standard PostgreSQL configuration
```

**2. Trino (Query Federation)**:
```sql
-- Trino connects to multiple data sources
-- Not a database itself, but a query engine

-- Example: Query across S3 and PostgreSQL
SELECT 
  e.event_type,
  u.user_name,
  COUNT(*) as event_count
FROM s3.events.event_log e
JOIN postgresql.public.users u ON e.user_id = u.id
WHERE e.event_date >= DATE '2025-11-01'
GROUP BY 1, 2;
```

**3. MinIO (Object Storage)**:
```yaml
# Not a traditional database
# Stores:
  - Parquet files (columnar data)
  - Avro files (event streams)
  - CSV exports
  - ML model artifacts

# Access via S3 API
# Indexed by object key (S3 prefix patterns)
```

**Data Organization** (Hive-style partitioning):
```
s3://data-lake/
  events/
    year=2025/
      month=11/
        day=01/
          part-00000.parquet
          part-00001.parquet
        day=02/
          part-00000.parquet
  users/
    snapshot_date=2025-11-01/
      users.parquet
```

#### 6.6.5 enginedge-local-kernel (No Database)

**Strategy**: Stateless execution, no persistent database needed

**Temporary Storage**:
```yaml
# Execution results stored in object storage (S3/MinIO)
# Metadata stored in main enginedge-core database
# No dedicated database for kernel service
```

#### 6.6.6 enginedge-scheduling-model (Time-Series Data)

**Database Choice**: PostgreSQL with TimescaleDB extension

**Schema Design**:
```sql
-- Install TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Time-series table for scheduling metrics
CREATE TABLE scheduling_metrics (
  time TIMESTAMPTZ NOT NULL,
  schedule_id INT NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DOUBLE PRECISION,
  metadata JSONB
);

-- Convert to hypertable (TimescaleDB)
SELECT create_hypertable('scheduling_metrics', 'time');

-- Create indexes
CREATE INDEX idx_scheduling_metrics_schedule_id ON scheduling_metrics (schedule_id, time DESC);
CREATE INDEX idx_scheduling_metrics_metric_name ON scheduling_metrics (metric_name, time DESC);

-- Automatic data retention (drop old partitions)
SELECT add_retention_policy('scheduling_metrics', INTERVAL '90 days');

-- Continuous aggregates (materialized views)
CREATE MATERIALIZED VIEW scheduling_daily_stats
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 day', time) AS day,
  schedule_id,
  AVG(metric_value) as avg_value,
  MAX(metric_value) as max_value,
  MIN(metric_value) as min_value
FROM scheduling_metrics
WHERE metric_name = 'optimization_score'
GROUP BY day, schedule_id;

-- Refresh policy (automatic)
SELECT add_continuous_aggregate_policy('scheduling_daily_stats',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour');
```

**Query Patterns**:
```sql
-- Recent metrics (fast - uses hypertable chunks)
SELECT * FROM scheduling_metrics
WHERE schedule_id = 123
  AND time >= NOW() - INTERVAL '7 days'
ORDER BY time DESC;

-- Aggregated stats (fast - uses materialized view)
SELECT * FROM scheduling_daily_stats
WHERE schedule_id = 123
  AND day >= NOW() - INTERVAL '30 days';
```

### 6.7 Transaction Management

**ACID Properties**:
```sql
-- Atomicity: All or nothing
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;  -- Both updates succeed, or both rollback

-- Consistency: Database constraints maintained
-- Isolation: Concurrent transactions don't interfere
-- Durability: Committed data persists through crashes
```

**Isolation Levels**:
```sql
-- 1. Read Uncommitted (lowest isolation, rarely used)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
-- Can read uncommitted data from other transactions (dirty reads)

-- 2. Read Committed (PostgreSQL default)
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- Only see committed data
-- Non-repeatable reads possible

-- 3. Repeatable Read
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Consistent snapshot throughout transaction
-- Phantom reads possible (new rows from other transactions)

-- 4. Serializable (highest isolation)
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- Transactions execute as if serial (no concurrency)
-- Prevents all anomalies
-- Performance cost, may cause serialization failures
```

**Optimistic Locking**:
```sql
-- Version-based optimistic locking
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  version INT DEFAULT 1
);

-- Update with version check
UPDATE documents
SET content = 'new content', version = version + 1
WHERE id = 123 AND version = 5;  -- Only succeeds if version still 5

-- Application checks affected rows
-- If 0 rows affected, conflict occurred (retry or error)
```

**Pessimistic Locking**:
```sql
-- Explicit row locking
BEGIN;
  SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- Lock row
  -- Other transactions wait here
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;  -- Release lock
```

### 6.8 Database Monitoring and Maintenance

**Key Metrics**:
```yaml
Performance:
  - queries_per_second
  - average_query_time
  - slow_query_count (> 1s)
  - connection_count
  - cache_hit_ratio (target > 99%)

Resource Usage:
  - cpu_utilization
  - memory_usage
  - disk_usage
  - iops_usage

Replication:
  - replication_lag_seconds
  - replica_health_status

Locks:
  - lock_wait_events
  - deadlock_count
```

**Maintenance Tasks**:
```sql
-- VACUUM: Reclaim space from deleted rows
VACUUM ANALYZE users;

-- REINDEX: Rebuild indexes
REINDEX TABLE users;

-- Update statistics for query planner
ANALYZE users;

-- Check for bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

### 6.9 Database Decision Matrix

| Repository | Database Type | Reason | Replication | Partitioning |
|------------|---------------|--------|-------------|--------------|
| **enginedge-core** | PostgreSQL | ACID, complex queries, relationships | Primary + 3 replicas | By date (monthly) |
| **enginedge-frontend** | (API-based) | Minimal direct access | N/A | N/A |
| **enginedge-workers** | PostgreSQL | Transactional writes, consistency | Shared with core | By date |
| **enginedge-datalake** | PostgreSQL + MinIO | Metadata (PG) + Data (MinIO) | Primary + 1 replica | Hive-style (S3) |
| **enginedge-local-kernel** | None | Stateless, results in S3 | N/A | N/A |
| **enginedge-scheduling-model** | PostgreSQL + TimescaleDB | Time-series optimization | Primary + 1 replica | Automatic (TimescaleDB) |

---

## 7. Networking and API Design

### 7.1 Networking Fundamentals

#### OSI Model (Simplified)

```
Layer 7: Application (HTTP, HTTPS, gRPC, GraphQL)
Layer 6: Presentation (TLS/SSL, Data encoding)
Layer 5: Session (Authentication, Session management)
Layer 4: Transport (TCP, UDP)
Layer 3: Network (IP routing)
Layer 2: Data Link (MAC addresses)
Layer 1: Physical (Cables, wireless)
```

**For System Design, focus on Layers 4-7:**

#### TCP vs UDP

**TCP (Transmission Control Protocol)**:
```yaml
Characteristics:
  - Connection-oriented (3-way handshake)
  - Reliable delivery (acknowledgments, retransmission)
  - Ordered delivery (packets arrive in sequence)
  - Flow control (prevents overwhelming receiver)
  - Congestion control (prevents network overload)

Use Cases:
  ✅ HTTP/HTTPS (web traffic)
  ✅ Database connections
  ✅ File transfers
  ✅ Email (SMTP)
  ✅ Any application requiring reliability

Trade-offs:
  - Higher latency (handshake, acknowledgments)
  - More overhead (connection state, retransmissions)
```

**UDP (User Datagram Protocol)**:
```yaml
Characteristics:
  - Connectionless (no handshake)
  - Unreliable (no guarantees)
  - Unordered (packets may arrive out of order)
  - Low overhead
  - Fast

Use Cases:
  ✅ Video streaming (some packet loss acceptable)
  ✅ Gaming (low latency critical)
  ✅ DNS queries (single packet request/response)
  ✅ VoIP (real-time audio)
  ✅ Metrics/logging (some loss acceptable)

Trade-offs:
  - No reliability guarantees
  - Application must handle packet loss/reordering
```

#### DNS (Domain Name System)

```
User enters: api.enginedge.com
        ↓
[Browser Cache] → Found? Return IP
        ↓ (miss)
[OS Cache] → Found? Return IP
        ↓ (miss)
[Local DNS Resolver] → Found? Return IP
        ↓ (miss)
[Root DNS Server] → Returns .com nameserver
        ↓
[TLD DNS Server] → Returns enginedge.com nameserver
        ↓
[Authoritative DNS] → Returns 54.123.45.67
        ↓
[Browser] → Connects to 54.123.45.67
```

**DNS Caching and TTL**:
```yaml
# DNS Record
api.enginedge.com.  300  IN  A  54.123.45.67
                    ↑ TTL (5 minutes)

# Clients cache result for 5 minutes
# Allows DNS changes to propagate quickly
# Trade-off: Lower TTL = more DNS queries, faster updates
```

**DNS Strategies**:
```yaml
# Multi-region with health checks
api.enginedge.com:
  Type: A (Address Record)
  Routing: Geolocation + Health Check
  Records:
    - us-east-1: 54.123.45.67 (Primary)
    - eu-west-1: 52.234.56.78 (Secondary)
    - ap-south-1: 13.127.89.90 (Tertiary)
  
  Failover: Automatic (health check based)
  TTL: 60 seconds (fast failover)
```

#### CDN (Content Delivery Network)

```
User Request (London)
        ↓
[CDN Edge (London)] → Cache Hit? Return content
        ↓ (miss)
[Regional CDN (Europe)]
        ↓ (miss)
[Origin Server (US)]
        ↓
[Response travels back, cached at each layer]
```

**Benefits**:
- Reduced latency (content close to users)
- Reduced origin load (95%+ cache hit ratio)
- DDoS protection (absorb attack at edge)
- SSL/TLS termination at edge

### 7.2 HTTP/HTTPS Fundamentals

#### HTTP Methods

```yaml
GET:
  Purpose: Retrieve resource
  Safe: Yes (no side effects)
  Idempotent: Yes (same result on repeat)
  Cacheable: Yes
  Body: No
  Example: GET /api/users/123

POST:
  Purpose: Create resource or submit data
  Safe: No
  Idempotent: No
  Cacheable: Rarely
  Body: Yes
  Example: POST /api/users (create new user)

PUT:
  Purpose: Update/replace entire resource
  Safe: No
  Idempotent: Yes
  Cacheable: No
  Body: Yes
  Example: PUT /api/users/123 (replace user)

PATCH:
  Purpose: Partial update of resource
  Safe: No
  Idempotent: Yes (generally)
  Cacheable: No
  Body: Yes
  Example: PATCH /api/users/123 (update name only)

DELETE:
  Purpose: Remove resource
  Safe: No
  Idempotent: Yes
  Cacheable: No
  Body: No
  Example: DELETE /api/users/123

HEAD:
  Purpose: Get headers only (no body)
  Safe: Yes
  Idempotent: Yes
  Cacheable: Yes
  Example: HEAD /api/users/123 (check if exists)

OPTIONS:
  Purpose: Get allowed methods
  Safe: Yes
  Idempotent: Yes
  Example: OPTIONS /api/users (CORS preflight)
```

#### HTTP Status Codes

```yaml
1xx Informational:
  100 Continue: Request received, client can continue
  101 Switching Protocols: WebSocket upgrade

2xx Success:
  200 OK: Standard success
  201 Created: Resource created successfully
  202 Accepted: Async processing started
  204 No Content: Success but no response body

3xx Redirection:
  301 Moved Permanently: Resource moved (SEO preserving)
  302 Found: Temporary redirect
  304 Not Modified: Cached version still valid
  307 Temporary Redirect: Like 302 but preserve method

4xx Client Errors:
  400 Bad Request: Invalid request syntax
  401 Unauthorized: Authentication required
  403 Forbidden: Authenticated but not authorized
  404 Not Found: Resource doesn't exist
  409 Conflict: Resource conflict (e.g., duplicate)
  422 Unprocessable Entity: Validation failed
  429 Too Many Requests: Rate limit exceeded

5xx Server Errors:
  500 Internal Server Error: Generic server error
  502 Bad Gateway: Upstream server error
  503 Service Unavailable: Temporary overload/maintenance
  504 Gateway Timeout: Upstream timeout
```

#### HTTPS/TLS

```
[Client]
    ↓ (1) Client Hello (supported ciphers, TLS version)
[Server]
    ↓ (2) Server Hello + Certificate (public key)
[Client]
    ↓ (3) Verify certificate (CA signature)
    ↓ (4) Generate session key, encrypt with server public key
[Server]
    ↓ (5) Decrypt session key with private key
    ↓ (6) Encrypted communication using session key
[Encrypted Data Transfer]
```

**TLS Best Practices**:
```yaml
Protocol Version: TLS 1.3 (or minimum TLS 1.2)
Certificate: Let's Encrypt (auto-renewal)
Cipher Suites: Modern, strong ciphers only
HSTS: Enabled (force HTTPS)
Certificate Pinning: For mobile apps (optional)
```

### 7.3 API Design Patterns

#### 7.3.1 REST (Representational State Transfer)

**Principles**:
```yaml
1. Client-Server: Separation of concerns
2. Stateless: Each request contains all needed information
3. Cacheable: Responses marked as cacheable or not
4. Uniform Interface: Consistent resource-based URLs
5. Layered System: Client doesn't know if connected to end server
```

**RESTful API Design**:
```typescript
// Resource-based URLs
GET    /api/v1/users              // List users
GET    /api/v1/users/123          // Get specific user
POST   /api/v1/users              // Create user
PUT    /api/v1/users/123          // Update user (full)
PATCH  /api/v1/users/123          // Update user (partial)
DELETE /api/v1/users/123          // Delete user

// Nested resources
GET    /api/v1/users/123/interviews       // User's interviews
POST   /api/v1/users/123/interviews       // Create interview for user
GET    /api/v1/interviews/456/questions   // Interview's questions

// Query parameters for filtering, sorting, pagination
GET /api/v1/users?status=active&sort=created_at&page=2&limit=20

// Response format (JSON)
{
  "data": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2025-11-09T12:00:00Z"
  },
  "meta": {
    "request_id": "req_abc123"
  }
}

// Error format (RFC 7807 Problem Details)
{
  "type": "https://api.enginedge.com/errors/validation",
  "title": "Validation Failed",
  "status": 422,
  "detail": "Email is required",
  "instance": "/api/v1/users",
  "errors": {
    "email": ["Email is required", "Email must be valid"]
  }
}
```

**REST Best Practices**:
```yaml
✅ Use nouns for resources (not verbs)
  - Good: /api/users
  - Bad: /api/getUsers

✅ Use HTTP methods correctly
  - GET for reading
  - POST for creating
  - PUT/PATCH for updating
  - DELETE for deleting

✅ Use plural nouns
  - Good: /api/users
  - Bad: /api/user

✅ Use nesting for relationships (max 2 levels)
  - Good: /api/users/123/interviews
  - Bad: /api/users/123/interviews/456/questions/789

✅ Version your API
  - /api/v1/users
  - Or via header: Accept: application/vnd.api.v1+json

✅ Use pagination for lists
  - cursor-based (better): ?cursor=xyz&limit=20
  - offset-based (simpler): ?page=2&limit=20

✅ Use filtering and sorting
  - ?filter[status]=active&sort=-created_at

✅ Return appropriate status codes

✅ Include rate limit headers
  - X-RateLimit-Limit: 1000
  - X-RateLimit-Remaining: 456
  - X-RateLimit-Reset: 1699564800
```

**REST Implementation (NestJS)**:
```typescript
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
  ) {
    const users = await this.usersService.findAll({
      page,
      limit,
      status,
    });
    
    return {
      data: users,
      meta: {
        page,
        limit,
        total: users.length,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: 'number' })
  async findOne(@Param('id') id: number) {
    const user = await this.usersService.findOne(id);
    
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    
    return { data: user };
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiBody({ type: CreateUserDto })
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return { data: user };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id') id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateUserDto);
    return { data: user };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: number) {
    await this.usersService.remove(id);
    // 204 No Content (no response body)
  }
}
```

#### 7.3.2 gRPC (Google Remote Procedure Call)

**Characteristics**:
```yaml
Protocol: HTTP/2
Serialization: Protocol Buffers (binary)
Performance: 5-10x faster than JSON REST
Streaming: Built-in (client, server, bidirectional)
Type Safety: Strongly typed contracts
```

**When to Use gRPC**:
```yaml
✅ Service-to-service communication (microservices)
✅ High performance requirements
✅ Real-time streaming
✅ Polyglot environments (client libs for many languages)
✅ Strong typing needed

❌ Browser clients (limited support)
❌ External public APIs (REST is more standard)
❌ Human-readable debugging (binary format)
```

**Protocol Buffer Definition**:
```protobuf
// user.proto
syntax = "proto3";

package enginedge.users;

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (stream User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  rpc DeleteUser(DeleteUserRequest) returns (Empty);
}

message User {
  int64 id = 1;
  string email = 2;
  string name = 3;
  string status = 4;
  int64 created_at = 5;
}

message GetUserRequest {
  int64 id = 1;
}

message ListUsersRequest {
  int32 page = 1;
  int32 limit = 2;
  string status = 3;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
}

message Empty {}
```

**gRPC Implementation (NestJS)**:
```typescript
// user.service.ts
@GrpcService()
export class UserGrpcService {
  constructor(private readonly usersService: UsersService) {}

  @GrpcMethod('UserService', 'GetUser')
  async getUser(data: GetUserRequest): Promise<User> {
    return this.usersService.findOne(data.id);
  }

  @GrpcMethod('UserService', 'ListUsers')
  async *listUsers(data: ListUsersRequest): AsyncGenerator<User> {
    const users = await this.usersService.findAll(data);
    for (const user of users) {
      yield user;
    }
  }

  @GrpcMethod('UserService', 'CreateUser')
  async createUser(data: CreateUserRequest): Promise<User> {
    return this.usersService.create(data);
  }
}

// Client usage
const client = new UserServiceClient('localhost:5000');
const user = await client.getUser({ id: 123 });
```

**gRPC Streaming Types**:
```typescript
// 1. Server streaming (server sends multiple responses)
rpc ListUsers(ListUsersRequest) returns (stream User);

// 2. Client streaming (client sends multiple requests)
rpc BatchCreateUsers(stream CreateUserRequest) returns (BatchResponse);

// 3. Bidirectional streaming (both send multiple messages)
rpc Chat(stream ChatMessage) returns (stream ChatMessage);
```

#### 7.3.3 GraphQL

**Characteristics**:
```yaml
Query Language: Flexible, client-specified queries
Single Endpoint: /graphql (not resource-based)
Strongly Typed: Schema-defined types
Efficient: Request exactly what you need (no over/under-fetching)
```

**When to Use GraphQL**:
```yaml
✅ Frontend applications (React, Vue, etc.)
✅ Complex, nested data requirements
✅ Mobile apps (reduce network requests)
✅ Multiple clients with different data needs
✅ Rapid frontend development

❌ Simple CRUD APIs (REST is simpler)
❌ File uploads (less elegant than REST)
❌ Caching (more complex than REST)
```

**GraphQL Schema**:
```graphql
# schema.graphql
type User {
  id: ID!
  email: String!
  name: String!
  status: UserStatus!
  interviews: [Interview!]!
  createdAt: DateTime!
}

type Interview {
  id: ID!
  title: String!
  description: String
  status: InterviewStatus!
  questions: [Question!]!
  createdAt: DateTime!
}

type Question {
  id: ID!
  text: String!
  answer: String
  score: Float
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum InterviewStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

type Query {
  user(id: ID!): User
  users(status: UserStatus, limit: Int, offset: Int): [User!]!
  interview(id: ID!): Interview
}

type Mutation {
  createUser(email: String!, name: String!): User!
  updateUser(id: ID!, name: String): User!
  deleteUser(id: ID!): Boolean!
  createInterview(userId: ID!, title: String!): Interview!
}

type Subscription {
  userUpdated(id: ID!): User!
  interviewStatusChanged(id: ID!): Interview!
}
```

**GraphQL Queries**:
```graphql
# Query: Get user with interviews (client specifies fields)
query GetUserWithInterviews {
  user(id: "123") {
    id
    name
    email
    interviews {
      id
      title
      status
      questions {
        text
        score
      }
    }
  }
}

# Response: Exactly what was requested
{
  "data": {
    "user": {
      "id": "123",
      "name": "John Doe",
      "email": "john@example.com",
      "interviews": [
        {
          "id": "456",
          "title": "Technical Interview",
          "status": "COMPLETED",
          "questions": [
            {
              "text": "Explain REST vs GraphQL",
              "score": 8.5
            }
          ]
        }
      ]
    }
  }
}

# Mutation: Create user
mutation CreateUser {
  createUser(email: "jane@example.com", name: "Jane Smith") {
    id
    email
    name
    createdAt
  }
}

# Subscription: Real-time updates
subscription OnUserUpdated {
  userUpdated(id: "123") {
    name
    email
    status
  }
}
```

**GraphQL Implementation (NestJS)**:
```typescript
// user.resolver.ts
@Resolver(() => User)
export class UserResolver {
  constructor(
    private readonly usersService: UsersService,
    private readonly interviewsService: InterviewsService,
  ) {}

  @Query(() => User, { nullable: true })
  async user(@Args('id', { type: () => ID }) id: number) {
    return this.usersService.findOne(id);
  }

  @Query(() => [User])
  async users(
    @Args('status', { type: () => UserStatus, nullable: true }) status?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ) {
    return this.usersService.findAll({ status, limit, offset });
  }

  @Mutation(() => User)
  async createUser(
    @Args('email') email: string,
    @Args('name') name: string,
  ) {
    return this.usersService.create({ email, name });
  }

  @ResolveField(() => [Interview])
  async interviews(@Parent() user: User) {
    // Lazy loading (N+1 problem solution: use DataLoader)
    return this.interviewsService.findByUserId(user.id);
  }

  @Subscription(() => User)
  userUpdated(@Args('id', { type: () => ID }) id: number) {
    return this.pubSub.asyncIterator(`user.${id}.updated`);
  }
}
```

**DataLoader (Solving N+1 Problem)**:
```typescript
// Batch loading to avoid N+1 queries
const interviewLoader = new DataLoader(async (userIds: number[]) => {
  // Single query for all user IDs
  const interviews = await this.interviewsService.findByUserIds(userIds);
  
  // Group by user ID
  const grouped = groupBy(interviews, 'userId');
  
  // Return in same order as input
  return userIds.map(id => grouped[id] || []);
});

// Usage in resolver
@ResolveField(() => [Interview])
async interviews(@Parent() user: User, @Context() { interviewLoader }) {
  return interviewLoader.load(user.id);
}
```

### 7.4 API Comparison Matrix

| Feature | REST | gRPC | GraphQL |
|---------|------|------|---------|
| **Protocol** | HTTP/1.1 | HTTP/2 | HTTP/1.1 |
| **Format** | JSON | Protocol Buffers | JSON |
| **Performance** | Moderate | Very Fast | Moderate |
| **Streaming** | No (SSE/WebSocket needed) | Yes (built-in) | Yes (subscriptions) |
| **Browser Support** | Excellent | Limited | Excellent |
| **Learning Curve** | Low | Medium | Medium-High |
| **Caching** | Easy (HTTP caching) | Complex | Complex |
| **Versioning** | URL-based | Proto versioning | Schema evolution |
| **Tooling** | Excellent | Good | Excellent |
| **Best For** | Public APIs, CRUD | Microservices | Complex UIs |

### 7.5 Rate Limiting and Throttling

**Why Rate Limit?**
- Prevent abuse and DDoS attacks
- Ensure fair resource allocation
- Protect backend systems from overload
- Monetization (tiered pricing)

**Rate Limiting Algorithms**:

**1. Token Bucket**:
```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,      // Max tokens
    private refillRate: number,    // Tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  tryConsume(count: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;  // Request allowed
    }
    
    return false;  // Rate limited
  }
  
  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// Usage: 100 requests per second, burst of 200
const limiter = new TokenBucket(200, 100);
if (!limiter.tryConsume()) {
  throw new TooManyRequestsException();
}
```

**2. Leaky Bucket**:
```typescript
// Similar to token bucket, but constant output rate
// Requests queued, processed at fixed rate
// Better for smoothing traffic
```

**3. Fixed Window**:
```typescript
// Simple: 1000 requests per hour
// Window: 12:00-13:00, 13:00-14:00, etc.
// Problem: Burst at window boundaries (1000 at 12:59, 1000 at 13:00)

class FixedWindowLimiter {
  private counts = new Map<string, { count: number; window: number }>();
  
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    
    const current = this.counts.get(key);
    
    if (!current || current.window !== windowStart) {
      this.counts.set(key, { count: 1, window: windowStart });
      return true;
    }
    
    if (current.count < limit) {
      current.count++;
      return true;
    }
    
    return false;
  }
}
```

**4. Sliding Window Log**:
```typescript
// Track each request timestamp
// Count requests in last N seconds
// Accurate but memory-intensive

class SlidingWindowLog {
  private logs = new Map<string, number[]>();
  
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const log = this.logs.get(key) || [];
    
    // Remove old entries
    const cutoff = now - windowMs;
    const recentLog = log.filter(timestamp => timestamp > cutoff);
    
    if (recentLog.length < limit) {
      recentLog.push(now);
      this.logs.set(key, recentLog);
      return true;
    }
    
    return false;
  }
}
```

**5. Sliding Window Counter** (Best balance):
```typescript
// Hybrid: Fixed window + weighted previous window
// Example: Current window 60%, previous window 40%
// Memory efficient, smooth rate limiting

class SlidingWindowCounter {
  private windows = new Map<string, { current: number; previous: number; timestamp: number }>();
  
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    
    let window = this.windows.get(key);
    
    if (!window || window.timestamp !== windowStart) {
      // New window
      window = {
        current: 0,
        previous: window?.current || 0,
        timestamp: windowStart,
      };
      this.windows.set(key, window);
    }
    
    // Calculate weighted count
    const progress = (now - windowStart) / windowMs;
    const weightedCount = (window.previous * (1 - progress)) + window.current;
    
    if (weightedCount < limit) {
      window.current++;
      return true;
    }
    
    return false;
  }
}
```

**Rate Limiting Implementation (NestJS)**:
```typescript
// Using @nestjs/throttler
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,        // Time window in seconds
      limit: 100,     // Max requests per window
    }),
  ],
})
export class AppModule {}

// Apply globally
@UseGuards(ThrottlerGuard)
@Controller()
export class AppController {}

// Or per endpoint
@Throttle(10, 60)  // 10 requests per 60 seconds
@Get('expensive-operation')
async expensiveOp() {
  // ...
}

// Custom key generator (e.g., by user ID instead of IP)
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): string {
    return req.user?.id || req.ip;
  }
}
```

**Rate Limit Response Headers**:
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 456
X-RateLimit-Reset: 1699564800
Retry-After: 60

# When rate limited:
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699564800
Retry-After: 42

{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 42 seconds.",
  "retry_after": 42
}
```

**Distributed Rate Limiting (Redis)**:
```typescript
class RedisRateLimiter {
  constructor(private redis: Redis) {}
  
  async isAllowed(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / (windowSeconds * 1000))}`;
    
    const count = await this.redis.incr(windowKey);
    
    if (count === 1) {
      // First request in window, set expiration
      await this.redis.expire(windowKey, windowSeconds);
    }
    
    return count <= limit;
  }
  
  // More sophisticated: Sliding window with Lua script (atomic)
  async isAllowedSlidingWindow(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}`;
    
    // Lua script for atomic operation
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      
      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      
      -- Count current entries
      local count = redis.call('ZCARD', key)
      
      if count < limit then
        -- Add new entry
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, window / 1000)
        return 1
      else
        return 0
      end
    `;
    
    const result = await this.redis.eval(script, 1, windowKey, now, windowMs, limit);
    return result === 1;
  }
}
```

### 7.6 Performance Metrics

#### Key Metrics to Track

**Latency Percentiles**:
```yaml
P50 (Median): 50% of requests faster than this
  - Typical user experience
  - Target: < 100ms for API calls

P95: 95% of requests faster than this
  - Most users' experience
  - Target: < 200ms for API calls

P99: 99% of requests faster than this
  - Worst case for most users
  - Target: < 500ms for API calls

P99.9: 99.9% of requests faster than this
  - Edge cases, potential problems
  - Target: < 1s for API calls

Why percentiles > average:
  - Average can be misleading (outliers)
  - Median (P50) more representative
  - P99 shows tail latency (important for UX)
```

**Throughput Metrics**:
```yaml
QPS (Queries Per Second):
  - Number of requests handled per second
  - Measures system capacity
  - Target: > 10,000 QPS for enginedge-core

RPS (Requests Per Second):
  - Same as QPS, different terminology
  
TPS (Transactions Per Second):
  - For database operations
  - Target: > 5,000 TPS for PostgreSQL
```

**Error Rates**:
```yaml
Error Rate: Percentage of failed requests
  - 4xx errors: Client errors (validation, auth)
  - 5xx errors: Server errors (bugs, overload)
  - Target: < 0.1% for 5xx errors

Success Rate: Percentage of successful requests
  - Target: > 99.9%
```

**Availability Metrics**:
```yaml
Uptime: Percentage of time system is operational
  - 99% (2-nines): 3.65 days downtime/year
  - 99.9% (3-nines): 8.76 hours downtime/year
  - 99.99% (4-nines): 52.56 minutes downtime/year
  - 99.999% (5-nines): 5.26 minutes downtime/year
  
MTBF (Mean Time Between Failures):
  - Average time system runs before failure
  - Higher is better

MTTR (Mean Time To Recovery):
  - Average time to restore after failure
  - Lower is better

Availability = MTBF / (MTBF + MTTR)
```

**Monitoring Implementation**:
```typescript
// Prometheus metrics
import { Counter, Histogram, Gauge } from 'prom-client';

// Request counter
const requestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// Request duration histogram
const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],  // Buckets for percentile calculation
});

// Active connections gauge
const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active connections',
});

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    requestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    });
    
    requestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    }, duration);
  });
  
  next();
});
```

### 7.7 API Design per Repository

#### 7.7.1 enginedge-core (REST + WebSocket)

**Primary API**: RESTful HTTP API

```typescript
// Base URL: https://api.enginedge.com/v1

// Authentication endpoints
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /auth/me

// User endpoints
GET    /users
GET    /users/:id
POST   /users
PATCH  /users/:id
DELETE /users/:id
GET    /users/:id/interviews

// Interview endpoints
GET    /interviews
GET    /interviews/:id
POST   /interviews
PATCH  /interviews/:id
DELETE /interviews/:id
POST   /interviews/:id/start
POST   /interviews/:id/submit

// Real-time updates (WebSocket)
WS     /ws/interviews/:id

// Health checks
GET    /health
GET    /health/ready
```

**Configuration**:
```yaml
Protocol: HTTPS (TLS 1.3)
Format: JSON
Authentication: JWT (Bearer tokens)
Rate Limiting: 1000 req/min per user, 100 req/min per IP
Versioning: URL-based (/v1, /v2)
CORS: Enabled for frontend domains
Compression: gzip
```

#### 7.7.2 enginedge-frontend (Next.js API Routes)

**API Routes** (Internal, used by frontend only):

```typescript
// pages/api/...

// Server-side only endpoints
GET    /api/session
POST   /api/logout

// Proxy to backend (adds auth headers)
GET    /api/users/[id]
POST   /api/interviews
```

**Configuration**:
```yaml
Protocol: HTTPS
Format: JSON
Authentication: Cookie-based sessions
Rate Limiting: Inherited from enginedge-core
Note: Most requests go directly to enginedge-core API
```

#### 7.7.3 enginedge-workers (No External API)

**Communication**: Message queue only (Kafka/RabbitMQ)

```yaml
# Workers consume from queue, don't expose HTTP API
# Internal health check endpoint for Kubernetes
GET /health (internal only)
```

#### 7.7.4 enginedge-datalake (SQL Query API)

**Trino HTTP API** (SQL over HTTP):

```typescript
// Submit query
POST   /v1/statement
Body: {
  "query": "SELECT * FROM events WHERE date = '2025-11-09'",
  "catalog": "hive",
  "schema": "default"
}

// Get query results
GET    /v1/statement/:queryId

// Cancel query
DELETE /v1/statement/:queryId
```

**Airflow REST API**:
```typescript
// DAG operations
GET    /api/v1/dags
POST   /api/v1/dags/:dag_id/dagRuns
GET    /api/v1/dags/:dag_id/dagRuns/:dag_run_id
```

#### 7.7.5 enginedge-local-kernel (gRPC)

**Internal gRPC API** (service-to-service):

```protobuf
service KernelService {
  rpc ExecuteCode(ExecuteRequest) returns (ExecuteResponse);
  rpc GetExecutionStatus(StatusRequest) returns (StatusResponse);
  rpc CancelExecution(CancelRequest) returns (Empty);
}

message ExecuteRequest {
  string code = 1;
  string language = 2;
  int32 timeout_seconds = 3;
  map<string, string> environment = 4;
}

message ExecuteResponse {
  string execution_id = 1;
  string stdout = 2;
  string stderr = 3;
  int32 exit_code = 4;
  int64 execution_time_ms = 5;
}
```

**Why gRPC**:
- High performance (critical for code execution)
- Streaming support (for long-running executions)
- Type safety (prevent errors)
- Internal only (no browser compatibility needed)

#### 7.7.6 enginedge-scheduling-model (REST)

**Inference API**:

```typescript
// Prediction endpoint
POST   /api/v1/predict
Body: {
  "features": {
    "user_availability": [...],
    "interviewer_availability": [...],
    "preferences": {...}
  }
}

Response: {
  "schedule": {
    "recommended_time": "2025-11-10T14:00:00Z",
    "confidence": 0.92,
    "alternatives": [...]
  }
}

// Model info
GET    /api/v1/model/info
GET    /api/v1/model/metrics

// Health check
GET    /health
```

### 7.8 API Decision Matrix

| Repository | Protocol | Format | Authentication | Rate Limiting | Use Case |
|------------|----------|--------|----------------|---------------|----------|
| **enginedge-core** | REST (HTTP/2) | JSON | JWT | 1000/min | Public API |
| **enginedge-frontend** | REST (HTTP/1.1) | JSON | Cookie | N/A | Internal proxy |
| **enginedge-workers** | N/A | N/A | N/A | N/A | Queue-based |
| **enginedge-datalake** | REST (SQL) | JSON | Token | 100/min | Analytics |
| **enginedge-local-kernel** | gRPC (HTTP/2) | Protobuf | mTLS | 1000/min | Internal service |
| **enginedge-scheduling-model** | REST (HTTP/2) | JSON | Token | 500/min | ML inference |

---

## 8. Performance Metrics and Monitoring

### 8.1 Observability Pillars

**Three Pillars of Observability**:
```
1. Metrics: Numerical measurements over time (CPU, latency, QPS)
2. Logs: Discrete events with context (errors, transactions)
3. Traces: Request flow across services (distributed tracing)
```

### 8.2 Metrics Collection Strategy

**Per Repository Metrics**:

**enginedge-core**:
```yaml
Application Metrics:
  - http_requests_total (counter)
  - http_request_duration_seconds (histogram)
  - active_users_count (gauge)
  - database_query_duration_seconds (histogram)
  - cache_hit_ratio (gauge)
  - jwt_verification_errors_total (counter)

System Metrics:
  - process_cpu_usage_percent
  - process_memory_bytes
  - nodejs_heap_size_bytes
  - nodejs_event_loop_lag_seconds

Business Metrics:
  - interviews_created_total
  - interviews_completed_total
  - user_registrations_total
```

**Prometheus Configuration**:
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'enginedge-core'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: enginedge-core
        action: keep
      - source_labels: [__meta_kubernetes_pod_ip]
        target_label: instance
```

### 8.3 Logging Strategy

**Structured Logging**:
```typescript
import { Logger } from '@nestjs/common';

const logger = new Logger('UserService');

// ✅ Good: Structured logging
logger.log({
  message: 'User created',
  userId: user.id,
  email: user.email,
  requestId: context.requestId,
  duration: 45,
  timestamp: new Date().toISOString(),
});

// ❌ Bad: Unstructured logging
logger.log(`User ${user.email} created with ID ${user.id}`);
```

**Log Levels**:
```yaml
ERROR: System errors, exceptions (alert immediately)
WARN: Potential issues (investigate soon)
INFO: Important events (user actions, system state changes)
DEBUG: Detailed debugging (development only)
TRACE: Very verbose (rarely used)
```

### 8.4 Distributed Tracing

**OpenTelemetry Implementation**:
```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('enginedge-core');

async function processInterview(interviewId: string) {
  // Start span
  const span = tracer.startSpan('process_interview', {
    attributes: {
      'interview.id': interviewId,
      'service.name': 'enginedge-core',
    },
  });

  try {
    // Child span for database query
    const dbSpan = tracer.startSpan('database.query', {
      parent: span,
    });
    
    const interview = await db.findInterview(interviewId);
    dbSpan.end();

    // Child span for external API call
    const apiSpan = tracer.startSpan('api.call.kernel');
    const result = await kernelService.execute(interview.code);
    apiSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
}
```

### 8.5 Alerting Rules

**Critical Alerts** (PagerDuty):
```yaml
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 5m
  annotations:
    summary: "High error rate detected"
    
- alert: ServiceDown
  expr: up{job="enginedge-core"} == 0
  for: 2m
  annotations:
    summary: "Service is down"

- alert: DatabaseConnectionPoolExhausted
  expr: pg_pool_active_connections / pg_pool_max_connections > 0.9
  for: 5m
  annotations:
    summary: "Database connection pool near capacity"
```

**Warning Alerts** (Slack):
```yaml
- alert: HighLatency
  expr: histogram_quantile(0.99, http_request_duration_seconds) > 1
  for: 10m
  annotations:
    summary: "P99 latency above 1 second"

- alert: CacheHitRatioLow
  expr: cache_hit_ratio < 0.8
  for: 15m
  annotations:
    summary: "Cache hit ratio below 80%"
```

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Week 1: Infrastructure Setup**
- [ ] Set up Kubernetes clusters (dev, staging, prod)
- [ ] Configure PostgreSQL with replication
- [ ] Deploy Redis cluster
- [ ] Set up monitoring stack (Prometheus, Grafana, Jaeger)
- [ ] Configure CI/CD pipelines

**Week 2: Core Services**
- [ ] Implement enginedge-core REST API with rate limiting
- [ ] Set up PgBouncer connection pooling
- [ ] Implement JWT authentication
- [ ] Add structured logging
- [ ] Deploy to dev environment

**Week 3: Frontend & Workers**
- [ ] Deploy enginedge-frontend with Next.js ISR
- [ ] Configure CDN (CloudFront/Cloudflare)
- [ ] Set up enginedge-workers with Kafka
- [ ] Implement job processing with exactly-once semantics
- [ ] Add health checks and liveness probes

**Week 4: Testing & Validation**
- [ ] Load testing (target 10,000 QPS)
- [ ] Failover testing (simulate node failures)
- [ ] Validate monitoring and alerting
- [ ] Document APIs (OpenAPI/Swagger)
- [ ] Security audit

### Phase 2: Optimization (Weeks 5-8)

**Week 5: Caching Layer**
- [ ] Implement multi-layer caching strategy
- [ ] Add Redis cache for API responses
- [ ] Configure query result caching
- [ ] Optimize cache hit ratios (target > 85%)

**Week 6: Database Optimization**
- [ ] Add database indexes based on query patterns
- [ ] Implement partitioning for large tables
- [ ] Set up read replicas
- [ ] Optimize slow queries (< 100ms P95)

**Week 7: Advanced Features**
- [ ] Implement gRPC for enginedge-local-kernel
- [ ] Add WebSocket support for real-time updates
- [ ] Set up distributed tracing
- [ ] Implement circuit breakers

**Week 8: Performance Tuning**
- [ ] Optimize HPA configurations
- [ ] Tune connection pools
- [ ] Reduce P99 latency (target < 500ms)
- [ ] Achieve 99.9% availability

### Phase 3: Scale & Polish (Weeks 9-12)

**Week 9: Data Lake**
- [ ] Deploy enginedge-datalake components
- [ ] Configure Trino for query federation
- [ ] Set up Spark for ETL pipelines
- [ ] Implement data retention policies

**Week 10: ML Infrastructure**
- [ ] Deploy enginedge-scheduling-model
- [ ] Set up model versioning and A/B testing
- [ ] Implement prediction caching
- [ ] Configure TimescaleDB for metrics

**Week 11: Reliability Engineering**
- [ ] Chaos engineering tests
- [ ] Disaster recovery drills
- [ ] Multi-region failover testing
- [ ] Backup and restore validation

**Week 12: Production Readiness**
- [ ] Final security audit
- [ ] Performance benchmarking
- [ ] Documentation completion
- [ ] Runbook creation
- [ ] Go-live checklist

---

## 10. Appendix: Reference Architecture Diagrams

### 10.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USERS                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   CDN / CloudFront   │
              │  (Static Assets)     │
              └──────────┬───────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │  Load Balancer (ALB/NGINX)    │
         └───────┬───────────────────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Frontend │ │  Core   │ │  Model  │
│ Next.js │ │  API    │ │Inference│
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     │      ┌────┴────┐      │
     │      │         │      │
     ▼      ▼         ▼      ▼
┌────────────────────────────────┐
│     PostgreSQL (Primary)       │
│     + Read Replicas (3)        │
└────────────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│     Redis Cluster (Cache)      │
└────────────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│  Kafka (Message Queue)         │
└────┬───────────────────────────┘
     │
     ▼
┌─────────────┐     ┌────────────┐
│   Workers   │────▶│   Kernel   │
│ (Interview) │     │ (Execution)│
└─────────────┘     └────────────┘
     │
     ▼
┌────────────────────────────────┐
│  Data Lake (MinIO + Trino)     │
└────────────────────────────────┘
```

### 10.2 Request Flow Example

```
User Request: GET /api/v1/users/123
         │
         ▼
    [CDN Check]
         │ (miss)
         ▼
    [Load Balancer] ─────┐
         │               │ (health check)
         ▼               ▼
    [enginedge-core Pod 1, 2, 3...] (least connections)
         │
         ▼
    [Rate Limiter Check] (Redis)
         │ (allowed)
         ▼
    [JWT Verification] (cached in Redis)
         │ (valid)
         ▼
    [Response Cache Check] (Redis)
         │ (miss)
         ▼
    [Database Query] (Read Replica)
         │
         ▼
    [Cache Result] (Redis, TTL 300s)
         │
         ▼
    [Return Response]
         │
         ▼
    [Record Metrics] (Prometheus)
```

### 10.3 Data Flow Architecture

```
Application Events
         │
         ▼
   [Kafka Topics]
         │
         ├─────┐
         │     │
         ▼     ▼
    [Workers] [Streaming to MinIO]
         │          │
         ▼          ▼
   [PostgreSQL] [S3/MinIO]
         │          │
         │          ▼
         │    [Spark ETL]
         │          │
         │          ▼
         │    [Parquet Files]
         │          │
         │          ▼
         └────▶ [Trino]
                   │
                   ▼
            [Analytics Dashboard]
```

### 10.4 Monitoring Stack

```
┌─────────────────────────────────┐
│      Application Services       │
│  (Core, Frontend, Workers...)   │
└────────┬────────────────────────┘
         │ (metrics endpoint /metrics)
         ▼
┌─────────────────────────────────┐
│       Prometheus                │
│   (Metrics Collection)          │
└────────┬────────────────────────┘
         │
         ├─────────────┬──────────┐
         ▼             ▼          ▼
    [Grafana]    [AlertManager] [Jaeger]
    (Dashboards) (Alerts)       (Tracing)
         │             │          │
         │             ├──────────┤
         │             │          │
         ▼             ▼          ▼
    [Visualize]   [PagerDuty]  [Trace Viz]
                  [Slack]
```

---

## Document Control

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-09 | Initial document structure | EnginEdge Team |
| 2.0 | 2025-11-09 | Complete all 8 sections | EnginEdge Team |

---

## Summary

This System Design Implementation Plan provides a comprehensive, FAANG+ quality blueprint for implementing core system design principles across the EnginEdge split repository architecture. The plan covers:

✅ **Scalability**: Horizontal and vertical scaling strategies per repository  
✅ **CAP/PACELC**: Consistency and availability trade-offs with specific implementations  
✅ **Load Balancing**: Algorithm selection and configuration for each service  
✅ **Caching**: Multi-layer caching with eviction policies and patterns  
✅ **Database Design**: SQL/NoSQL choices, normalization, indexing, sharding, replication  
✅ **Networking & APIs**: REST, gRPC, GraphQL with rate limiting and performance metrics  
✅ **Monitoring**: Comprehensive observability strategy  
✅ **Implementation Roadmap**: 12-week phased rollout plan  

### Key Takeaways

1. **No One-Size-Fits-All**: Each repository has unique requirements requiring tailored solutions
2. **Trade-offs Are Inevitable**: Every design decision involves trade-offs (consistency vs. availability, latency vs. throughput)
3. **Measure Everything**: Comprehensive monitoring and metrics are essential for informed decisions
4. **Start Simple, Scale Smart**: Begin with simpler solutions, add complexity only when needed
5. **Plan for Failure**: Design for resilience with redundancy, health checks, and graceful degradation

### Next Steps

1. **Review** this plan with engineering leads and stakeholders
2. **Validate** assumptions with load testing and prototypes
3. **Prioritize** implementation based on business needs
4. **Execute** phased rollout per roadmap
5. **Iterate** based on real-world performance and feedback

**This plan is a living document** and should be updated as the system evolves and new patterns emerge.

---

**Document prepared by:** EnginEdge Engineering Team  
**Date:** November 9, 2025  
**Classification:** Internal - Engineering Reference  
**Questions?** Contact the Platform Engineering team

---

## Document Control

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-09 | Initial document structure | EnginEdge Team |

---

**Next Steps:**
1. Review and validate architectural assumptions with stakeholders
2. Complete detailed sections for each system design principle
3. Create implementation tickets and assign to teams
4. Establish monitoring and success criteria
5. Begin phased rollout starting with non-critical services
