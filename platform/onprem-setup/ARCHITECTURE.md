# EnginEdge On-Premises Architecture

## Overview

EnginEdge consists of two main components:
1. **Core Platform** - Main application services (API Gateway, Workers, Orchestration)
2. **Data Lake** - Big data processing and analytics infrastructure

Both run in the same Kubernetes cluster but can be deployed independently.

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EnginEdge Kubernetes Cluster                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    CORE PLATFORM                             │  │
│  │                                                              │  │
│  │  ┌──────────────┐         ┌──────────────┐                   │  │
│  │  │ API Gateway  │────────▶│  Workers     │                   │  │
│  │  │  (Port 3001) │(Sync)   │  (Multiple)  │                   │  │
│  │  └──────────────┘         └──────▲───────┘                   │  │
│  │                                  │                           │  │
│  │                       (Async via Kafka)                      │  │
│  │                                  │                           │  │
│  │                           ┌──────▼───────┐                   │  │
│  │                           │   Hexagon    │                   │  │
│  │                           │ (Orchestrator)│                  │  │
│  │                           └──────────────┘                   │  │
│  │                                  │                           │  │
│  │  ┌──────▼───────────────────▼────▼──────────────────────▼──┐   │  │
│  │  │              Infrastructure Services                 │   │  │
│  │  │  • MongoDB (Application Data)                       │   │  │
│  │  │  • Kafka (Message Broker)                           │   │  │
│  │  │  • Redis (Cache)                                    │   │  │
│  │  │  • MinIO (Object Storage - Shared with Datalake)   │   │  │
│  │  │  • PostgreSQL (Metadata - Shared with Datalake)   │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    DATA LAKE                                  │  │
│  │                                                              │  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │  │
│  │  │    Trino     │    │ Apache Spark │    │   Airflow    │  │  │
│  │  │ (SQL Query)  │    │ (Processing)│    │(Orchestration)│  │  │
│  │  └──────────────┘    └──────────────┘    └──────────────┘  │  │
│  │         │                   │                    │            │  │
│  │         │                   │                    │            │  │
│  │  ┌──────▼───────────────────▼───────────────────▼──────┐   │  │
│  │  │              Data Lake Services                     │   │  │
│  │  │  • MinIO (Object Storage - Shared)                  │   │  │
│  │  │  • PostgreSQL (Metadata - Shared)                 │   │  │
│  │  │  • Hive Metastore (Table Metadata)                 │   │  │
│  │  │  • Jupyter (Notebooks)                             │   │  │
│  │  │  • Marquez (Data Lineage)                          │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              OBSERVABILITY STACK                            │  │
│  │  • Prometheus (Metrics)                                     │  │
│  │  • Grafana (Dashboards)                                     │  │
│  │  • ServiceMonitors (Auto-discovery)                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Platform Components

### Entry Point
- **API Gateway** (Port 3001 internal)
  - Routes HTTP requests to appropriate worker services (Synchronous)
  - Handles authentication/authorization for WebSocket connections and administrative routes
  - Proxies datalake services (admin-only)

### Orchestration Layer
- **Hexagon** (Orchestrator)
  - Central asynchronous, event-driven orchestrator
  - Manages complex multi-worker workflows via Kafka
  - Manages persistent workflow state
  - Connects to MongoDB, Kafka, Redis

### Worker Services
- **Identity Worker** - Authentication & authorization
- **Assistant Worker** - LLM interactions
- **Agent Tool Worker** - Tool execution
- **Data Processing Worker** - Data transformations
- **Interview Worker** - Interview management
- **Resume Worker** - Resume processing
- **LaTeX Worker** - Document generation
- **Scheduling Worker** - Scheduling logic
- **News Worker** - News ingestion

### Supporting Services
- **Scheduling Model** - ML model for scheduling
- **spaCy Service** - NLP processing
- **Wolfram Kernel** - Mathematical computations

### Infrastructure (Shared)
- **MongoDB** - Application database
- **Kafka** - Message broker for async communication
- **Redis** - Caching and session storage
- **MinIO** - Object storage (S3-compatible, shared with datalake)
- **PostgreSQL** - Metadata store (shared with datalake)

## Data Lake Components

### Query & Processing
- **Trino** (Port 8090)
  - Distributed SQL query engine
  - Query data in MinIO
  - Access via API Gateway: `/datalake/trino/*`

- **Apache Spark** (Port 8080)
  - Distributed data processing
  - ETL jobs, batch processing
  - ML workloads
  - Access via API Gateway: `/datalake/spark/*`

### Orchestration
- **Apache Airflow** (Port 8082)
  - Workflow orchestration
  - ETL pipeline scheduling
  - DAG management
  - Access via API Gateway: `/datalake/airflow/*`

### Analytics
- **Jupyter Lab** (Port 8888)
  - Interactive notebooks
  - Data exploration
  - Visualization
  - Access via API Gateway: `/datalake/jupyter/*`

### Metadata & Lineage
- **Hive Metastore**
  - Table schemas and metadata
  - Data catalog

- **Marquez** (Port 5000)
  - Data lineage tracking
  - Transformation history
  - Access via API Gateway: `/datalake/marquez/*`

### Storage (Shared with Platform)
- **MinIO** (Port 9000/9001)
  - S3-compatible object storage
  - Used by both platform and datalake
  - Access via API Gateway: `/datalake/minio/*`

- **PostgreSQL** (Port 5432)
  - Metadata storage
  - Airflow database
  - Hive Metastore database

## Multi-Node Distribution

### Recommended Node Allocation (4 Nodes)

**Master Node (Control Plane)**
- Kubernetes control plane components only
- Optional: lightweight observability agents
- 8GB RAM / 4 CPU cores / 50GB disk

**Worker Node 1 – Core + Infrastructure**
- API Gateway, Hexagon, Identity Worker
- MongoDB, Kafka, Redis (stateful sets)
- Optional: Prometheus/Grafana if you want them closer to core services
- 16GB RAM / 4–6 CPU cores / 100GB disk

**Worker Node 2 – Worker Services**
- Assistant/Interview/Resume/Data-processing/Latex/Scheduling workers
- Keeps CPU-heavy workloads away from infra
- 16–24GB RAM / 6–8 CPU cores / 50–100GB disk

**Worker Node 3 – Dedicated Data Lake & ML Node**
- **Data Lake**: Trino, Spark master + workers, Airflow scheduler/web, Jupyter, Marquez, Hive Metastore
- **ML Services**: scheduling-model (PyTorch), spaCy Service (NLP), wolfram-kernel (math)
- MinIO & PostgreSQL can be pinned here (recommended) while staying accessible cluster-wide
- Ideal target for future GPU/accelerator hardware
- 48–64GB RAM / 10–12 CPU cores / 200–300GB fast disk (NVMe preferred)

### Pod Distribution Strategy

Kubernetes automatically distributes pods across nodes based on:
- Resource availability (CPU/RAM)
- Node health
- Pod affinity/anti-affinity rules

**Example Distribution:**
```
Worker Node 1 (Core + Infra):
  - api-gateway (2 replicas)
  - hexagon (1 replica)
  - identity-worker (1 replica)
  - mongodb statefulset (2 pods)
  - kafka statefulset (1 pod)
  - redis statefulset (1 pod)

Worker Node 2 (Workers):
  - assistant-worker (3 replicas)
  - resume-worker (2 replicas)
  - interview-worker (2 replicas)
  - data-processing-worker (2 replicas)
  - latex-worker (1 replica)
  - scheduling-worker (1 replica)

Worker Node 3 (Dedicated Data Lake & ML):
  - trino (1 replica)
  - spark-master (1 replica)
  - spark-worker (3 replicas)
  - airflow web/scheduler (1 replica each)
  - jupyter (1 replica)
  - marquez (1 replica)
  - hive-metastore (1 replica)
  - ML services: scheduling-model, spaCy Service, wolfram-kernel
  - minio (statefulset) – pinned here via node affinity
  - postgres (statefulset) – pinned here via node affinity
```

## Service Communication

### Internal Communication
- Services communicate via Kubernetes service names
- Example: `http://api-gateway:8080`, `http://mongodb-service:27017`
- All within the same cluster network

### External Access
- **API Gateway** - Main entry point (NodePort/Ingress)
- **Datalake Services** - Proxied through API Gateway (admin-only)
- **Grafana** - Monitoring dashboards (NodePort/Ingress)
- **Prometheus** - Metrics collection (internal)

### Data Flow Examples

**User Request Flow:**
```
User → API Gateway → Hexagon → Worker → MongoDB/Kafka
```

**Data Lake Access:**
```
Admin User → API Gateway (JWT auth) → Trino/Airflow/Spark
```

**Data Processing:**
```
Airflow DAG → Spark Job → MinIO (read/write) → Trino (query)
```

## Shared Resources

### MinIO (Object Storage)
- **Platform uses**: File storage, document storage
- **Datalake uses**: Raw data, processed data, data lake buckets
- **Access**: Both services use same MinIO instance
- **Namespace**: Different buckets for platform vs datalake

### PostgreSQL
- **Platform uses**: Metadata (if needed)
- **Datalake uses**: 
  - Airflow database
  - Hive Metastore database
- **Access**: Separate databases, same PostgreSQL instance

## Deployment Order

### Phase 1: Core Platform
1. Infrastructure (MongoDB, Kafka, Redis, MinIO, PostgreSQL)
2. Core Services (API Gateway, Hexagon, Identity Worker)
3. Workers (all worker services)
4. Supporting Services (spaCy, scheduling-model, etc.)

### Phase 2: Data Lake & ML Services (Optional)
1. Join the dedicated Data Lake node to the cluster (`setup-worker-node.sh`)
2. Pin MinIO and PostgreSQL to the Data Lake node (nodeSelector/nodeAffinity)
3. Deploy ML services (scheduling-model, spaCy Service, wolfram-kernel) with node affinity to Data Lake node
4. Deploy Hive Metastore
5. Deploy Trino
6. Deploy Spark (Master + Workers) — scale workers on Data Lake node
7. Deploy Airflow
8. Deploy Jupyter
9. Deploy Marquez

### Phase 3: Observability
1. Prometheus Stack
2. ServiceMonitors
3. Grafana Dashboards

## Resource Requirements

### Per Node Specifications (Based on Actual Service Requirements)

**Master Node (Control Plane)**
- **RAM**: 4–8GB (control plane components only, ~2–3GB actual usage)
- **CPU**: 2–4 cores (minimal CPU usage)
- **Disk**: 30GB (OS + Kubernetes + logs; 50GB is excessive for control plane only)
- **Note**: If you remove the taint to run pods here, increase to 8GB RAM

**Worker Node 1 (Core + Infrastructure)**
- **RAM**: 16GB (MongoDB 2Gi, Kafka 3Gi, Redis 256Mi, API Gateway 2Gi, Hexagon 1Gi, Identity 1Gi, system ~2GB)
- **CPU**: 4–6 cores (MongoDB 1 core, Kafka 1 core, others minimal)
- **Disk**: 50–80GB (MongoDB data ~2Gi, Kafka logs 8Gi, system ~10GB, headroom for growth)
- **Services**: API Gateway, Hexagon, Identity Worker, MongoDB, Kafka, Redis

**Worker Node 2 (Worker Services)**
- **RAM**: 16–20GB (assistant-worker 6Gi, resume-worker 4Gi, interview-worker 2Gi, data-processing 2Gi, others ~2Gi, system ~2GB)
- **CPU**: 6–8 cores (multiple workers with varying CPU needs)
- **Disk**: 50–100GB (mostly stateless services, minimal disk usage)
- **Services**: All worker pods (assistant, resume, interview, data-processing, latex, scheduling workers)

**Worker Node 3 (Dedicated Data Lake & ML)**
- **RAM (Minimal/Light Usage)**: 12–16GB
  - Data Lake (minimal config, single replicas): Trino 1Gi, Spark Master 512Mi, Spark Worker 512Mi, Airflow 512Mi, Hive Metastore 256Mi, Marquez 384Mi, Jupyter 256Mi, MinIO 256Mi, PostgreSQL 128Mi = ~3.5–4Gi
  - ML Services: spaCy 2Gi, scheduling-model 1Gi, wolfram-kernel 512Mi = ~3.5Gi
  - System overhead: ~2–3GB
  - **Total minimum: ~9–10.5GB → 12–16GB recommended** (with headroom)
- **RAM (Production/Heavy Usage)**: 48–64GB
  - Data Lake (production config): Trino 16Gi, Spark Master 8Gi, Spark Workers 48Gi (3 replicas), Airflow 4Gi, Jupyter 4Gi, Hive Metastore 4Gi, Marquez 2Gi, MinIO 1Gi, PostgreSQL 2Gi = ~89Gi
  - ML Services: spaCy 6Gi, scheduling-model 2Gi, wolfram-kernel 1Gi = ~9Gi
  - System overhead: ~4GB
  - **Total: ~102Gi → 48–64GB with overcommit** (not all services at 100% simultaneously)
- **CPU**: 4–6 cores (minimal) to 10–12 cores (production)
- **Disk**: 50–100GB (minimal) to 200–300GB (production with data growth)
- **Services**: Entire data lake stack + ML services (scheduling-model, spaCy, wolfram-kernel) + MinIO & PostgreSQL (pinned here)
- **Note**: Use `values-local.yaml` or `values-dev.yaml` for minimal resource deployment

### Total Cluster
- **Minimum (core only)**: 36–40GB RAM, 12 CPU cores (Master 4GB + Worker1 16GB + Worker2 16–20GB)
- **Minimal (with data lake & ML, light usage)**: 48–56GB RAM, 16–18 CPU cores (4 nodes: Master 4–8GB + Worker1 16GB + Worker2 16–20GB + DataLake 12–16GB)
- **Recommended (with data lake & ML, production)**: 92–104GB RAM, 22–30 CPU cores (4 nodes: Master 4–8GB + Worker1 16GB + Worker2 16–20GB + DataLake 48–64GB)
- **Future scale**: Add additional worker or GPU nodes as needed; kubeadm join handles expansion

### Resource Calculation Notes
- **RAM requests** are guaranteed allocations; **limits** are maximums
- Actual usage typically falls between requests and limits
- System overhead (~2–4GB per node) includes OS, kubelet, CNI, and Kubernetes components
- Disk includes OS (~10GB), container images (~5–10GB), and persistent volume data
- Data Lake node requires more resources due to Spark workers and data processing workloads

## Network Architecture

### Virtual Switch Setup
- All VMs connected to same virtual switch
- Static IPs recommended (192.168.100.x)
- Pod network: 10.244.0.0/16 (Calico)

### Service Discovery
- Kubernetes DNS resolves service names
- Example: `mongodb-service.default.svc.cluster.local`
- Short form: `mongodb-service` (within same namespace)

## Security

### Authentication
- **API Gateway**: JWT tokens
- **Identity Worker**: Manages user authentication
- **Datalake Access**: Admin role required

### Network Policies
- Default deny (if enabled)
- Services can only communicate with allowed peers
- Datalake isolated from platform (except via API Gateway)

## Monitoring

### Metrics
- All services expose `/metrics` endpoints
- Prometheus scrapes via ServiceMonitors
- Grafana dashboards for visualization

### Logs
- Container logs via `kubectl logs`
- Centralized logging (optional: Loki/ELK)

### Health Checks
- `/health` endpoints on services
- Kubernetes liveness/readiness probes
- Prometheus alerting rules

## Scaling

### Horizontal Pod Autoscaling (HPA)
- Workers scale based on CPU/memory
- Configured per service
- Requires metrics-server

### Node Scaling
- Add worker nodes: `kubeadm join`
- Kubernetes automatically uses new nodes
- Pods redistribute automatically

## Backup Strategy

### Critical Data
- **MongoDB**: Regular backups (mongodump)
- **PostgreSQL**: Regular backups (pg_dump)
- **MinIO**: Bucket replication or backups
- **etcd**: Kubernetes cluster state backups

### Persistent Volumes
- All stateful services use PersistentVolumes
- Data survives pod restarts
- Backup PV data regularly

---

**Last Updated**: 2025-01-XX  
**Version**: 1.0.0

