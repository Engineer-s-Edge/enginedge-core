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
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │  │
│  │  │ API Gateway  │───▶│   Hexagon    │───▶│  Workers     │  │  │
│  │  │  (Port 8080) │    │ (Orchestrator)│    │  (Multiple)  │  │  │
│  │  └──────────────┘    └──────────────┘    └──────────────┘  │  │
│  │         │                   │                    │            │  │
│  │         │                   │                    │            │  │
│  │  ┌──────▼───────────────────▼───────────────────▼──────┐   │  │
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
- **API Gateway** (Port 8080)
  - Routes requests to appropriate services
  - Handles authentication/authorization
  - Proxies datalake services (admin-only)

### Orchestration Layer
- **Hexagon** (Main Node)
  - Central orchestrator
  - Manages workflows
  - Coordinates worker services
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

### Recommended Node Allocation

**Master Node (Control Plane)**
- Kubernetes control plane components
- Lightweight services (optional)

**Worker Node 1**
- Core Platform Services:
  - API Gateway
  - Hexagon
  - Identity Worker
  - Infrastructure: MongoDB, Kafka, Redis

**Worker Node 2**
- Worker Services:
  - All worker pods (assistant, resume, interview, etc.)
  - Supporting services (spaCy, scheduling-model)
- Data Lake:
  - Trino
  - Spark Master/Workers
  - Airflow

**Worker Node 3 (Optional)**
- Data Lake Heavy Services:
  - Jupyter
  - Marquez
  - Additional Spark workers
- Shared Infrastructure:
  - MinIO
  - PostgreSQL

### Pod Distribution Strategy

Kubernetes automatically distributes pods across nodes based on:
- Resource availability (CPU/RAM)
- Node health
- Pod affinity/anti-affinity rules

**Example Distribution:**
```
Worker Node 1:
  - api-gateway (2 replicas)
  - hexagon (1 replica)
  - mongodb (2 replicas)
  - kafka (1 replica)
  - redis (1 replica)

Worker Node 2:
  - assistant-worker (3 replicas)
  - resume-worker (2 replicas)
  - interview-worker (2 replicas)
  - trino (1 replica)
  - spark-master (1 replica)

Worker Node 3:
  - data-processing-worker (2 replicas)
  - spark-worker (3 replicas)
  - airflow (1 replica)
  - jupyter (1 replica)
  - minio (1 replica)
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

### Phase 2: Data Lake (Optional)
1. Shared Infrastructure (MinIO, PostgreSQL - already deployed)
2. Hive Metastore
3. Trino
4. Spark (Master + Workers)
5. Airflow
6. Jupyter
7. Marquez

### Phase 3: Observability
1. Prometheus Stack
2. ServiceMonitors
3. Grafana Dashboards

## Resource Requirements

### Per Node Minimums
- **Master**: 8GB RAM, 4 CPU cores
- **Worker 1**: 16GB RAM, 4 CPU cores
- **Worker 2**: 16GB RAM, 4 CPU cores
- **Worker 3**: 16GB RAM, 4 CPU cores (optional)

### Total Cluster
- **Minimum**: 40GB RAM, 12 CPU cores (3 nodes)
- **Recommended**: 64GB RAM, 16 CPU cores (3-4 nodes)
- **With Datalake**: 80GB+ RAM, 20+ CPU cores (4 nodes)

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

