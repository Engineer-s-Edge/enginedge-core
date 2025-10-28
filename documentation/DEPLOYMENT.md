# EnginEdge Main Hexagon - Deployment Guide

> Complete deployment documentation for the EnginEdge main orchestrator service.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Configuration](#configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

## Overview

The EnginEdge Main Hexagon is deployed as a containerized service that orchestrates AI/ML workloads across specialized worker nodes. This guide covers deployment strategies from local development to production Kubernetes clusters.

### Architecture Components

```
┌─────────────────┐    ┌─────────────────┐
│   Main Hexagon  │────│     Kafka       │
│   (NestJS API)  │    │   Message Bus   │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌─────────────┐   ┌─────────────┐
│  Worker 1   │   │  Worker 2   │
│   (LLM)     │   │ (Data Proc) │
└─────────────┘   └─────────────┘
```

### Deployment Options

1. **Local Development**: Single container with docker-compose
2. **Docker**: Standalone container deployment
3. **Kubernetes**: Production-ready orchestrated deployment
4. **Helm**: Package-based deployment

## Prerequisites

### System Requirements

- **CPU**: 2+ cores recommended
- **Memory**: 4GB+ RAM
- **Storage**: 10GB+ available space
- **Network**: Access to Kafka cluster and worker nodes

### External Dependencies

- **Apache Kafka**: Message broker for worker communication
- **PostgreSQL**: Primary database for request persistence
- **Redis**: Caching and worker registry
- **Worker Nodes**: At least one worker node running

### Software Requirements

- **Docker**: 20.10+ for containerization
- **Kubernetes**: 1.24+ for orchestration (optional)
- **Helm**: 3.0+ for package management (optional)

## Local Development

### Docker Compose Setup

Create a `docker-compose.dev.yml` file for local development:

```yaml
version: '3.8'
services:
  main-hexagon:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - KAFKA_BROKERS=kafka:9092
      - DATABASE_URL=postgresql://user:password@postgres:5432/enginedge
      - REDIS_URL=redis://redis:6379
    depends_on:
      - kafka
      - postgres
      - redis
    volumes:
      - .:/app
      - /app/node_modules
    networks:
      - enginedge-dev

  kafka:
    image: confluentinc/cp-kafka:7.3.0
    ports:
      - "9092:9092"
    environment:
      - KAFKA_BROKER_ID=1
      - KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka:29092
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
    depends_on:
      - zookeeper
    networks:
      - enginedge-dev

  zookeeper:
    image: confluentinc/cp-zookeeper:7.3.0
    environment:
      - ZOOKEEPER_CLIENT_PORT=2181
      - ZOOKEEPER_TICK_TIME=2000
    networks:
      - enginedge-dev

  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=enginedge
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - enginedge-dev

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - enginedge-dev

volumes:
  postgres_data:

networks:
  enginedge-dev:
    driver: bridge
```

### Development Dockerfile

```dockerfile
FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=base /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S enginedge -u 1001

USER enginedge

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Running Locally

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f main-hexagon

# Run tests
docker-compose -f docker-compose.dev.yml exec main-hexagon npm test

# Stop services
docker-compose -f docker-compose.dev.yml down
```

## Docker Deployment

### Production Dockerfile

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S enginedge -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Change ownership
RUN chown -R enginedge:nodejs /app
USER enginedge

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

### Building and Running

```bash
# Build the image
docker build -t enginedge/main-hexagon:latest .

# Run with environment variables
docker run -d \
  --name main-hexagon \
  -p 3000:3000 \
  -e KAFKA_BROKERS=kafka.example.com:9092 \
  -e DATABASE_URL=postgresql://user:password@db.example.com:5432/enginedge \
  -e REDIS_URL=redis://redis.example.com:6379 \
  -e API_KEYS=your-api-key-here \
  enginedge/main-hexagon:latest
```

## Kubernetes Deployment

### Namespace Setup

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: enginedge
  labels:
    name: enginedge
    app: main-hexagon
```

### ConfigMap for Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: main-hexagon-config
  namespace: enginedge
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  HEALTH_CHECK_INTERVAL: "30"
  REQUEST_TIMEOUT: "300"
  WORKER_HEALTH_CHECK_TIMEOUT: "10"
```

### Secret for Sensitive Data

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: main-hexagon-secrets
  namespace: enginedge
type: Opaque
data:
  # Base64 encoded values
  DATABASE_URL: cG9zdGdyZXM6Ly91c2VyOnBhc3NAZGJfaG9zdDo1NDMyL2VuZ2luZWRnZQ==
  REDIS_URL: cmVkaXM6Ly9yZWRpc19ob3N0OjYzNzk=
  API_KEYS: eW91ci1hcGkta2V5LWhlcmU=
  KAFKA_USERNAME: a2Fma2FfdXNlcg==
  KAFKA_PASSWORD: a2Fma2FfcGFzcw==
```

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: main-hexagon
  namespace: enginedge
  labels:
    app: main-hexagon
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: main-hexagon
  template:
    metadata:
      labels:
        app: main-hexagon
        version: v1
    spec:
      containers:
      - name: main-hexagon
        image: enginedge/main-hexagon:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: main-hexagon-config
              key: NODE_ENV
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: main-hexagon-secrets
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: main-hexagon-secrets
              key: REDIS_URL
        - name: API_KEYS
          valueFrom:
            secretKeyRef:
              name: main-hexagon-secrets
              key: API_KEYS
        - name: KAFKA_BROKERS
          value: "kafka-cluster.enginedge.svc.cluster.local:9092"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
        startupProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 6
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: main-hexagon
              topologyKey: kubernetes.io/hostname
```

### Service Manifest

```yaml
apiVersion: v1
kind: Service
metadata:
  name: main-hexagon
  namespace: enginedge
  labels:
    app: main-hexagon
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: main-hexagon
```

### Ingress Manifest

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: main-hexagon
  namespace: enginedge
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.enginedge.com
    secretName: main-hexagon-tls
  rules:
  - host: api.enginedge.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: main-hexagon
            port:
              number: 80
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: main-hexagon-hpa
  namespace: enginedge
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: main-hexagon
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment (development/production) | development | No |
| `PORT` | HTTP server port | 3000 | No |
| `KAFKA_BROKERS` | Kafka broker addresses | localhost:9092 | Yes |
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `REDIS_URL` | Redis connection string | - | Yes |
| `API_KEYS` | Comma-separated API keys | - | Yes |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info | No |
| `REQUEST_TIMEOUT` | Request timeout in seconds | 300 | No |
| `HEALTH_CHECK_INTERVAL` | Health check interval in seconds | 30 | No |

### Database Configuration

The service uses PostgreSQL with the following schema:

```sql
-- Requests table
CREATE TABLE requests (
  id UUID PRIMARY KEY,
  task_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Request results table
CREATE TABLE request_results (
  id UUID PRIMARY KEY,
  request_id UUID REFERENCES requests(id),
  status VARCHAR(20) NOT NULL,
  result JSONB,
  error TEXT,
  processing_time INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Worker registry table
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
  capabilities JSONB,
  last_health_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Redis Configuration

Redis is used for:
- Worker health status caching
- Request status caching
- Rate limiting data
- Session storage (if needed)

## Monitoring & Observability

### Health Checks

The service provides multiple health check endpoints:

- `GET /health`: Overall system health
- `GET /ready`: Readiness for traffic
- `GET /live`: Liveness check

### Metrics

The service exposes Prometheus metrics at `/metrics`:

```prometheus
# Request metrics
enginedge_requests_total{status="success"} 15432
enginedge_requests_total{status="error"} 168
enginedge_request_duration_seconds{quantile="0.5"} 2.5
enginedge_request_duration_seconds{quantile="0.95"} 15.0

# Worker metrics
enginedge_workers_active_total 6
enginedge_worker_health_status{worker_type="llm", status="healthy"} 1

# System metrics
enginedge_memory_usage_bytes 536870912
enginedge_cpu_usage_percent 45.2
```

### Logging

Structured JSON logging with configurable levels:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "message": "Request processed successfully",
  "requestId": "req_1234567890abcdef",
  "workerType": "llm",
  "processingTime": 2500,
  "correlationId": "corr_789"
}
```

### Distributed Tracing

Integration with Jaeger for distributed tracing:

```yaml
# Add to deployment env vars
- name: JAEGER_AGENT_HOST
  value: "jaeger-agent.observability.svc.cluster.local"
- name: JAEGER_AGENT_PORT
  value: "6831"
- name: JAEGER_SERVICE_NAME
  value: "main-hexagon"
```

## Scaling

### Vertical Scaling

Increase resource limits based on load:

```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Horizontal Scaling

Use HPA for automatic scaling based on metrics:

```yaml
metrics:
- type: External
  external:
    metric:
      name: kafka_consumergroup_lag
      selector:
        matchLabels:
          topic: requests
      target:
        type: AverageValue
        averageValue: "100"
```

### Database Scaling

- Use connection pooling (PgBouncer)
- Implement read replicas for queries
- Use Redis for caching frequently accessed data

### Kafka Scaling

- Increase partition count for high-throughput topics
- Use topic replication for fault tolerance
- Implement consumer group scaling

## Troubleshooting

### Common Issues

#### High Latency

**Symptoms**: Requests taking longer than expected

**Diagnosis**:
```bash
# Check pod resource usage
kubectl top pods -n enginedge

# Check Kafka consumer lag
kubectl exec -it kafka-pod -- kafka-consumer-groups --describe --group main-hexagon
```

**Solutions**:
- Increase CPU/memory limits
- Scale horizontally
- Optimize database queries
- Check network latency to workers

#### Worker Unavailability

**Symptoms**: Requests failing with "No eligible workers"

**Diagnosis**:
```bash
# Check worker health
curl http://main-hexagon/health

# Check worker pod status
kubectl get pods -n enginedge -l app=worker
```

**Solutions**:
- Restart unhealthy worker pods
- Check worker resource constraints
- Verify network connectivity
- Review worker logs for errors

#### Database Connection Issues

**Symptoms**: "Connection timeout" errors

**Diagnosis**:
```bash
# Check database connectivity
kubectl exec -it main-hexagon-pod -- nc -zv postgres-host 5432

# Check connection pool usage
kubectl logs -f main-hexagon-pod | grep "connection pool"
```

**Solutions**:
- Increase connection pool size
- Check database resource usage
- Verify connection string
- Implement connection retry logic

#### Memory Issues

**Symptoms**: OOMKilled pods

**Diagnosis**:
```bash
# Check memory usage
kubectl logs main-hexagon-pod | grep "heap used"

# Check for memory leaks
kubectl exec main-hexagon-pod -- node --inspect
```

**Solutions**:
- Increase memory limits
- Implement memory profiling
- Check for memory leaks in application code
- Optimize data structures

### Debug Commands

```bash
# View recent logs
kubectl logs -f deployment/main-hexagon -n enginedge --tail=100

# Debug pod
kubectl exec -it main-hexagon-pod -n enginedge -- /bin/sh

# Check network policies
kubectl get networkpolicies -n enginedge

# View events
kubectl get events -n enginedge --sort-by=.metadata.creationTimestamp

# Check resource quotas
kubectl describe resourcequota -n enginedge
```

### Performance Tuning

```yaml
# JVM-like options for Node.js
env:
- name: NODE_OPTIONS
  value: "--max-old-space-size=1024 --optimize-for-size"
```

```javascript
// Connection pooling configuration
export const databaseConfig = {
  poolSize: 10,
  retryDelay: 3000,
  retryAttempts: 3,
  acquireTimeoutMillis: 60000,
  idleTimeoutMillis: 300000,
};
```

This deployment guide provides a comprehensive foundation for deploying the EnginEdge Main Hexagon in various environments, from local development to production Kubernetes clusters.