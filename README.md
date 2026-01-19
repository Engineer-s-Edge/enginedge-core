# EnginEdge Core

> Enterprise microservices backbone: API Gateway routing, Hexagon orchestration service, and production-ready Kubernetes infrastructure for the EnginEdge platform.

[![NestJS](https://img.shields.io/badge/NestJS-10.0+-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5?logo=kubernetes)](https://kubernetes.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-2.8+-231F20?logo=apache-kafka)](https://kafka.apache.org/)

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Services](#core-services)
  - [API Gateway](#api-gateway)
  - [Hexagon Orchestrator](#hexagon-orchestrator)
- [Platform Infrastructure](#platform-infrastructure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Security](#security)
- [Contributing](#contributing)

## Overview

**EnginEdge Core** is the foundational infrastructure layer of the EnginEdge platform, providing:

- **🚪 API Gateway**: Central entry point for all HTTP/WebSocket traffic with JWT authentication, RBAC, and intelligent routing
- **🎯 Hexagon Orchestrator**: Asynchronous workflow orchestration engine using hexagonal architecture and Kafka messaging
- **☸️ Kubernetes Infrastructure**: Production-ready K8s manifests, Helm charts, and deployment automation
- **🐳 Docker Compose**: Local development environment with all dependencies
- **🔧 Control Center**: Platform management and deployment tools
- **📊 Observability**: Prometheus metrics, Grafana dashboards, and distributed tracing

### System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        EnginEdge Core                             │
└──────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
        ┌───────▼────────┐             ┌───────▼────────┐
        │  API Gateway   │             │    Hexagon     │
        │   (Port 3001)  │             │  (Port 3000)   │
        │                │             │                │
        │ • HTTP Routing │             │ • Async Kafka  │
        │ • WebSocket    │             │ • Orchestration│
        │ • JWT Auth     │             │ • State Mgmt   │
        │ • RBAC         │             │ • Worker Coord │
        │ • Rate Limit   │             │ • Health Checks│
        └────────┬───────┘             └────────┬───────┘
                 │                              │
                 └──────────────┬───────────────┘
                                │
        ┌───────────────────────▼────────────────────────┐
        │              Worker Services                    │
        ├────────────────────────────────────────────────┤
        │ • assistant-worker    • resume-worker          │
        │ • interview-worker    • latex-worker           │
        │ • scheduling-worker   • data-processing-worker │
        │ • agent-tool-worker   • identity-worker        │
        └────────────────────────────────────────────────┘
                                │
        ┌───────────────────────▼────────────────────────┐
        │           Infrastructure Layer                  │
        ├────────────────────────────────────────────────┤
        │ • MongoDB         • Redis         • PostgreSQL │
        │ • Apache Kafka    • MinIO         • Trino      │
        │ • Prometheus      • Grafana       • Loki       │
        └────────────────────────────────────────────────┘
```

## Architecture

### Design Principles

1. **Microservices**: Loosely coupled, independently deployable services
2. **Event-Driven**: Asynchronous communication via Apache Kafka
3. **Hexagonal Architecture**: Clean separation of business logic from infrastructure
4. **Cloud-Native**: Kubernetes-first with 12-factor app principles
5. **Security by Default**: JWT authentication, RBAC, network policies, and secret management

### Communication Patterns

| Pattern | Use Case | Technology | Example |
|---------|----------|------------|---------|
| **Synchronous** | Real-time API requests | HTTP/REST via API Gateway | User authentication, data queries |
| **Asynchronous** | Long-running workflows | Kafka via Hexagon | Resume analysis, interview processing |
| **Bi-directional** | Real-time updates | WebSocket via API Gateway | Live interview sessions, chat |
| **Batch** | Scheduled jobs | Cron/Airflow | Data aggregation, reports |

## Core Services

### API Gateway

**Location:** `api-gateway/`  
**Port:** `3001`  
**Purpose:** Central HTTP/WebSocket entry point with authentication and routing

#### Key Features

- ✅ **JWT Authentication** - Secure token-based auth with refresh tokens
- ✅ **Role-Based Access Control (RBAC)** - Admin/user permission levels
- ✅ **Service Proxying** - Routes requests to appropriate worker services
- ✅ **WebSocket Gateway** - Real-time bidirectional communication
- ✅ **Rate Limiting** - Per-IP and per-route throttling
- ✅ **Admin-Only Routes** - Protected datalake UI access (`/api/datalake/*`)
- ✅ **Health Monitoring** - Service health checks and status endpoints
- ✅ **Prometheus Metrics** - Request latency, error rates, throughput

#### Quick Start

```bash
cd api-gateway/
npm install
npm run start:dev    # Development mode with hot reload
npm test             # Run unit tests
npm run build        # Production build
npm start            # Run production build
```

#### Environment Variables

```bash
PORT=3001
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
IDENTITY_WORKER_URL=http://identity-worker:3000
ASSISTANT_WORKER_URL=http://assistant-worker:3001
# ... see api-gateway/README.md for full list
```

📘 **[Full API Gateway Documentation →](./api-gateway/README.md)**

---

### Hexagon Orchestrator

**Location:** `hexagon/`  
**Port:** `3000`  
**Purpose:** Asynchronous workflow orchestration and state management

#### Key Features

- ✅ **Hexagonal Architecture** - Clean, testable, maintainable code structure
- ✅ **Kafka Integration** - Event-driven communication with workers
- ✅ **Workflow Orchestration** - Coordinate complex multi-step processes
- ✅ **State Management** - Track long-running job status and results
- ✅ **Worker Discovery** - Kubernetes-native service discovery
- ✅ **Health Monitoring** - Worker health checks and automatic failover
- ✅ **Result Aggregation** - Combine outputs from multiple workers
- ✅ **Correlation IDs** - Distributed tracing across services

#### Architecture Layers

```
hexagon/
├── domain/              # Business logic (pure TypeScript)
│   ├── entities/        # Core domain objects
│   └── services/        # Domain services
├── application/         # Application orchestration
│   ├── ports/           # Interface definitions
│   ├── services/        # Application services
│   └── use-cases/       # Business workflows
└── infrastructure/      # External integrations
    ├── controllers/     # HTTP endpoints
    ├── adapters/        # Port implementations
    │   ├── kafka-publisher.adapter.ts
    │   └── worker-registry.adapter.ts
    └── modules/         # NestJS modules
```

#### Quick Start

```bash
cd hexagon/
npm install
npm run start:dev              # Development mode
npm run test:unit              # Unit tests (domain layer)
npm run test:integration       # Integration tests
npm run test:e2e               # End-to-end tests
```

#### Supported Task Types

- `EXECUTE_ASSISTANT` - AI chat and document analysis
- `SCHEDULE_HABITS` - Task scheduling and automation
- `PROCESS_DOCUMENT` - OCR and document parsing
- `GENERATE_LATEX` - Mathematical typesetting
- `ANALYZE_RESUME` - Resume parsing and job matching
- `PROCESS_INTERVIEW` - Video/audio interview analysis

📘 **[Full Hexagon Documentation →](./hexagon/README.md)**

---

## Platform Infrastructure

### Kubernetes Deployments

**Location:** `platform/k8s/`

#### Development Environment (`dev/`)

- **Apps:** Full application deployments for all services
- **Charts:** Reusable Helm charts (worker-generic, database-generic)
- **Config:** ConfigMaps and environment configurations
- **Secrets:** Secret templates (`.example` files for safety)
- **Observability:** Prometheus, Grafana, Loki stack

#### Production Environment (`prod/`)

- **Network Policies:** Pod-to-pod communication restrictions
- **RBAC:** Kubernetes role-based access control
- **Autoscaling:** HorizontalPodAutoscaler configurations
- **Ingress:** NGINX ingress with TLS termination
- **Security:** Pod security policies and admission controllers

#### Quick Deploy

```bash
# Deploy all services to development
cd platform/k8s/dev/
./scripts/deploy_k8s_all.sh

# Deploy to production
cd platform/k8s/prod/
./scripts/deploy-enginedge-onprem.sh

# Destroy all resources
./scripts/destroy_k8s_all.sh
```

### Docker Compose

**Location:** `platform/docker-compose.yml`

Local development environment with:
- ✅ All worker services
- ✅ MongoDB, Redis, PostgreSQL
- ✅ Apache Kafka + Zookeeper
- ✅ MinIO (S3-compatible storage)
- ✅ Prometheus + Grafana
- ✅ Hot reload for development

```bash
# Start entire stack
docker-compose -f platform/docker-compose.yml up -d

# View logs
docker-compose -f platform/docker-compose.yml logs -f

# Stop all services
docker-compose -f platform/docker-compose.yml down
```

### Control Center

**Location:** `platform/control-center/`

Python-based deployment and management CLI:

```bash
cd platform/control-center/
python control-center.py --help

# Deploy all services
python control-center.py deploy --env dev

# Check cluster health
python control-center.py status

# Scale a service
python control-center.py scale --service assistant-worker --replicas 3
```

### On-Premise Setup

**Location:** `platform/onprem-setup/`

Comprehensive guides for bare-metal/VM deployments:

- **Architecture Guide:** System design and networking
- **Kubeadm Setup:** Multi-node Kubernetes cluster installation
- **Ingress Installation:** NGINX ingress controller setup
- **GitHub Actions Runners:** Self-hosted CI/CD runners
- **Network Configuration:** Firewall, DNS, and load balancing

📘 **[On-Premise Setup Guide →](./platform/onprem-setup/README.md)**

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm 9+
- **Docker** 24+ and Docker Compose 2+
- **Kubernetes** 1.28+ (for production deployment)
- **Helm** 3+ (for Kubernetes deployments)
- **kubectl** (configured with cluster access)

### Local Development

#### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/Engineer-s-Edge/enginedge-core.git
cd enginedge-core/

# Start all services
docker-compose -f platform/docker-compose.yml up -d

# Verify services are running
docker-compose ps

# Access services
# API Gateway: http://localhost:3001
# Hexagon: http://localhost:3000
# Grafana: http://localhost:3002 (admin/admin)
# Prometheus: http://localhost:9090
```

#### Option 2: Standalone Services

```bash
# Terminal 1: Start API Gateway
cd api-gateway/
npm install
npm run start:dev

# Terminal 2: Start Hexagon
cd hexagon/
npm install
npm run start:dev

# Terminal 3: Start infrastructure (MongoDB, Kafka, etc.)
docker-compose -f platform/docker-compose.yml up mongodb kafka redis
```

### Development Workflow

1. **Make changes** to service code in `api-gateway/` or `hexagon/`
2. **Run linting:** `npm run lint:check`
3. **Run tests:** `npm test`
4. **Format code:** `npm run format`
5. **Build:** `npm run build`
6. **Commit and push** - CI/CD will automatically run checks

### Running Tests

```bash
# API Gateway tests
cd api-gateway/
npm test                  # All tests
npm run test:cov          # With coverage

# Hexagon tests
cd hexagon/
npm run test:unit         # Unit tests (domain layer)
npm run test:integration  # Integration tests
npm run test:e2e          # End-to-end tests
npm run test:cov          # Coverage report
```

---

## Deployment

### GitHub Container Registry (GHCR)

Images are automatically built and pushed by CI/CD:

```bash
ghcr.io/engineer-s-edge/api-gateway:latest
ghcr.io/engineer-s-edge/hexagon:latest
```

### Manual Docker Build

```bash
# Build API Gateway
cd api-gateway/
docker build -t ghcr.io/engineer-s-edge/api-gateway:v1.0.0 .
docker push ghcr.io/engineer-s-edge/api-gateway:v1.0.0

# Build Hexagon
cd hexagon/
docker build -t ghcr.io/engineer-s-edge/hexagon:v1.0.0 .
docker push ghcr.io/engineer-s-edge/hexagon:v1.0.0
```

### Kubernetes Deployment

#### Using Kubectl

```bash
# Create namespace
kubectl create namespace enginedge

# Create image pull secret
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  --namespace=enginedge

# Deploy API Gateway
kubectl apply -f platform/k8s/dev/apps/api-gateway/ -n enginedge

# Deploy Hexagon
kubectl apply -f platform/k8s/dev/apps/hexagon/ -n enginedge

# Check deployments
kubectl get pods -n enginedge
kubectl get svc -n enginedge
```

#### Using Helm

```bash
# API Gateway
helm upgrade --install api-gateway \
  platform/k8s/dev/charts/worker-generic \
  --set image.repository=ghcr.io/engineer-s-edge/api-gateway \
  --set image.tag=latest \
  --set service.port=3001 \
  --namespace enginedge

# Hexagon
helm upgrade --install hexagon \
  platform/k8s/dev/charts/worker-generic \
  --set image.repository=ghcr.io/engineer-s-edge/hexagon \
  --set image.tag=latest \
  --set service.port=3000 \
  --namespace enginedge
```

#### Using Deployment Scripts

```bash
# Deploy everything (dev environment)
cd platform/scripts/
./deploy_k8s_all.sh

# Deploy everything (production)
./deploy-enginedge-onprem.sh

# Destroy all resources
./destroy_k8s_all.sh
```

### Environment Configuration

#### Kubernetes Secrets

```bash
# Create from file
kubectl create secret generic enginedge-secrets \
  --from-file=.env \
  --namespace=enginedge

# Or create manually
kubectl create secret generic enginedge-secrets \
  --from-literal=JWT_SECRET=your-secret-key \
  --from-literal=MONGODB_URI=mongodb://... \
  --namespace=enginedge
```

#### ConfigMaps

```bash
# Create ConfigMap
kubectl create configmap enginedge-config \
  --from-env-file=.env.example \
  --namespace=enginedge

# Or apply from YAML
kubectl apply -f platform/k8s/dev/config/configmap.yaml
```

---

## Monitoring & Observability

### Health Checks

```bash
# API Gateway health
curl http://localhost:3001/health

# Hexagon health
curl http://localhost:3000/health

# Kubernetes liveness probes
kubectl get pods -n enginedge
kubectl describe pod <pod-name> -n enginedge
```

### Prometheus Metrics

```bash
# API Gateway metrics
curl http://localhost:3001/metrics

# Hexagon metrics
curl http://localhost:3000/metrics

# Access Prometheus UI
# Local: http://localhost:9090
# Kubernetes: kubectl port-forward svc/prometheus 9090:9090 -n enginedge
```

### Grafana Dashboards

Pre-configured dashboards available at `http://localhost:3002` (admin/admin):

- **API Gateway Dashboard** - Request rates, latency, error rates
- **Hexagon Dashboard** - Workflow status, worker health, queue depth
- **System Dashboard** - CPU, memory, disk, network metrics
- **Kafka Dashboard** - Message throughput, lag, partitions

### Log Aggregation

```bash
# View logs locally
docker-compose logs -f api-gateway
docker-compose logs -f hexagon

# Kubernetes logs
kubectl logs -f deployment/api-gateway -n enginedge
kubectl logs -f deployment/hexagon -n enginedge

# Loki queries (in Grafana)
{app="api-gateway"} |= "error"
{app="hexagon"} | json | status="failed"
```

### Distributed Tracing

Correlation IDs are automatically generated and propagated:

```json
{
  "timestamp": "2026-01-18T10:30:00Z",
  "level": "info",
  "message": "Request processed",
  "correlationId": "req_abc123",
  "service": "api-gateway",
  "duration": 125
}
```

---

## Security

### Authentication & Authorization

- **JWT Tokens** - Signed with HS256 algorithm
- **RBAC** - Role-based access control (admin, user)
- **API Keys** - Service-to-service authentication
- **TLS/HTTPS** - Encrypted communication in production

### Network Security

- **Network Policies** - Restrict pod-to-pod communication
- **Ingress TLS** - HTTPS termination at ingress
- **Service Mesh** - Optional Istio integration for mTLS
- **Firewall Rules** - Restrict external access

### Secret Management

```bash
# Kubernetes Secrets (base64 encoded)
kubectl create secret generic jwt-secret \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  --namespace=enginedge

# External Secrets Operator (recommended)
# Integrate with AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault
```

### Security Best Practices

1. ✅ Rotate JWT secrets regularly
2. ✅ Use strong, random passwords for databases
3. ✅ Enable HTTPS/TLS in production
4. ✅ Implement rate limiting and DDoS protection
5. ✅ Regular security scanning (Trivy, Snyk)
6. ✅ Follow principle of least privilege
7. ✅ Enable audit logging
8. ✅ Keep dependencies up to date

---

## Repository Structure

```
enginedge-core/
├── api-gateway/                 # API Gateway service (NestJS)
│   ├── src/
│   │   ├── auth/               # JWT authentication & RBAC
│   │   ├── proxy/              # Service proxying logic
│   │   ├── websocket/          # WebSocket gateway
│   │   └── health/             # Health check endpoints
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── hexagon/                     # Hexagon orchestrator (NestJS)
│   ├── src/
│   │   ├── domain/             # Business logic (entities, services)
│   │   ├── application/        # Use cases & ports
│   │   └── infrastructure/     # Adapters & controllers
│   ├── test/                   # Unit, integration, e2e tests
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── platform/                    # Infrastructure & deployment
│   ├── k8s/                    # Kubernetes manifests
│   │   ├── dev/                # Development environment
│   │   │   ├── apps/           # Application deployments
│   │   │   ├── charts/         # Helm charts
│   │   │   ├── config/         # ConfigMaps
│   │   │   ├── secrets/        # Secret templates (.example)
│   │   │   └── observability/  # Prometheus, Grafana
│   │   └── prod/               # Production environment
│   │       ├── apps/
│   │       ├── network-policies/
│   │       ├── rbac/
│   │       └── ingress/
│   │
│   ├── control-center/         # Python deployment CLI
│   │   ├── control-center.py
│   │   └── requirements.txt
│   │
│   ├── onprem-setup/           # Bare-metal deployment guides
│   │   ├── ARCHITECTURE.md
│   │   ├── scripts/
│   │   └── README.md
│   │
│   ├── scripts/                # Automation scripts
│   │   ├── deploy_k8s_all.sh
│   │   ├── destroy_k8s_all.sh
│   │   └── build-push-ghcr.ps1
│   │
│   ├── docker-compose.yml      # Local development stack
│   ├── Dockerfile              # Multi-service build
│   └── kind-config.yaml        # Local Kubernetes (KIND)
│
├── .github/
│   └── workflows/
│       ├── api-gateway-ci.yml  # API Gateway CI/CD
│       └── core-hexagon-ci.yml # Hexagon CI/CD
│
├── .gitignore
├── .gitattributes
├── README.md                    # This file
└── enginedge-deploy.zip        # Pre-packaged deployment bundle
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### API Gateway CI (`api-gateway-ci.yml`)

**Triggers:**
- Push to `main` or `dev` branches (when `api-gateway/**` changes)
- Pull requests targeting `main` or `dev`

**Steps:**
1. ✅ Checkout code
2. ✅ Setup Node.js 18
3. ✅ Install dependencies (`npm ci`)
4. ✅ Lint code (`npm run lint:check`)
5. ✅ Format check (`npm run format:check`)
6. ✅ Run tests (`npm test`)
7. ✅ Build Docker image
8. ✅ Push to GHCR (on `main` branch)
9. ✅ Deploy to Kubernetes (on `main` branch)

#### Hexagon CI (`core-hexagon-ci.yml`)

**Triggers:**
- Push to `main` or `dev` branches (when `hexagon/**` changes)
- Pull requests targeting `main` or `dev`

**Steps:**
1. ✅ Checkout code
2. ✅ Setup Node.js 18
3. ✅ Install dependencies (`npm ci`)
4. ✅ Lint code (`npm run lint:check`)
5. ✅ Format check (`npm run format:check`)
6. ✅ Run unit tests (`npm run test:unit`)
7. ✅ Run integration tests (`npm run test:integration`)
8. ✅ Build Docker image
9. ✅ Push to GHCR (on `main` branch)
10. ✅ Deploy to Kubernetes (on `main` branch)

### Required Secrets

```bash
# GitHub Repository Secrets
GHCR_TOKEN              # GitHub Personal Access Token (packages:write)
KUBECONFIG_B64          # Base64-encoded kubeconfig for K8s deployment
JWT_SECRET              # JWT signing secret
MONGODB_URI             # MongoDB connection string
KAFKA_BROKERS           # Kafka broker addresses
```

---

## Contributing

### Development Guidelines

1. **Follow TypeScript Best Practices**
   - Use strict typing (avoid `any`)
   - Leverage interfaces and type guards
   - Document complex types

2. **Hexagonal Architecture (for Hexagon)**
   - Domain logic must be pure (no external dependencies)
   - Ports are interfaces, not concrete classes
   - Adapters implement ports
   - Infrastructure depends on application, not vice versa

3. **Testing Requirements**
   - Unit tests for business logic
   - Integration tests for adapters
   - E2E tests for critical workflows
   - Minimum 80% code coverage

4. **Code Quality**
   - Run `npm run lint:check` before committing
   - Run `npm run format` to auto-format
   - Keep functions small and focused (< 50 lines)
   - Use meaningful variable/function names

### Pull Request Process

1. **Create a feature branch** from `dev`
   ```bash
   git checkout -b feature/your-feature-name dev
   ```

2. **Make your changes** and commit
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. **Push and open PR**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Ensure CI passes** - All checks must be green
5. **Request review** from at least one maintainer
6. **Merge to dev**, then `dev` → `main` for production

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

---

## Troubleshooting

### Common Issues

#### API Gateway not starting

```bash
# Check logs
docker logs api-gateway

# Common causes:
# - JWT_SECRET not set
# - Port 3001 already in use
# - Worker service URLs incorrect

# Solution:
# Verify environment variables in .env
# Check port availability: lsof -i :3001
```

#### Hexagon not connecting to Kafka

```bash
# Check Kafka status
docker ps | grep kafka

# Test Kafka connectivity
docker exec -it kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Verify KAFKA_BROKERS environment variable
kubectl get configmap enginedge-config -o yaml | grep KAFKA
```

#### Worker services not responding

```bash
# Check worker health
curl http://localhost:3001/health/workers

# Verify service discovery
kubectl get svc -n enginedge

# Check worker logs
kubectl logs -f deployment/assistant-worker -n enginedge
```

#### Database connection errors

```bash
# MongoDB
docker exec -it mongodb mongosh --eval "db.runCommand({ ping: 1 })"

# Redis
docker exec -it redis redis-cli PING

# PostgreSQL
docker exec -it postgres psql -U enginedge -c "SELECT 1;"
```

### Debug Mode

```bash
# API Gateway debug mode
cd api-gateway/
npm run start:debug

# Hexagon debug mode
cd hexagon/
npm run start:debug

# Attach debugger on port 9229
```

### Performance Issues

```bash
# Check resource usage
kubectl top pods -n enginedge

# Increase replicas
kubectl scale deployment api-gateway --replicas=3 -n enginedge

# Check Prometheus metrics for bottlenecks
curl http://localhost:9090/api/v1/query?query=rate(http_request_duration_seconds[5m])
```

---

## License

Private - All Rights Reserved

Copyright © 2026 EnginEdge. Unauthorized copying, distribution, or use is strictly prohibited.

---

## Support

For issues, questions, or contributions:

- **Documentation:** See service-specific READMEs in `api-gateway/` and `hexagon/`
- **Issues:** GitHub Issues (internal use only)
- **Contact:** engineering@enginedge.com

---

**Built with ❤️ by the EnginEdge Team**

*Powering intelligent engineering workflows with modern cloud-native infrastructure*
