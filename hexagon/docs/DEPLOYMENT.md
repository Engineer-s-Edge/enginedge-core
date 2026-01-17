# Hexagon Deployment Guide

## Prerequisites

- Docker and Docker Compose
- Kubernetes cluster (kind, minikube, or cloud)
- kubectl configured
- Helm 3.x
- Node.js 20+ (for local development)

## Local Development

### Using Docker Compose

1. **Start infrastructure:**
   ```bash
   cd enginedge-core/platform
   docker-compose up -d mongodb kafka redis
   ```

2. **Configure environment:**
   ```bash
   cd enginedge-core/hexagon
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start hexagon:**
   ```bash
   npm run start:dev
   ```

5. **Verify:**
   ```bash
   curl http://localhost:3000/api/health
   ```

### Using Docker

1. **Build image:**
   ```bash
   cd enginedge-core/hexagon
   docker build -t hexagon:latest .
   ```

2. **Run container:**
   ```bash
   docker run -p 3000:3000 \
     -e MONGODB_URI=mongodb://host.docker.internal:27017/enginedge-hexagon \
     -e REDIS_URL=redis://host.docker.internal:6379/0 \
     -e KAFKA_BROKERS=host.docker.internal:9094 \
     hexagon:latest
   ```

## Kubernetes Deployment

### Using Control Center

1. **Start control center:**
   ```bash
   cd enginedge-core/platform/control-center
   python control-center.py
   ```

2. **Select "Kubernetes (kind)"**

3. **Choose "Deploy now"**

4. **Select "Core Applications" or "Full Stack"**

5. **Wait for deployment to complete**

### Manual Deployment

1. **Build and load image:**
   ```bash
   cd enginedge-core/hexagon
   docker build -t hexagon:latest .
   kind load docker-image hexagon:latest --name enginedge
   ```

2. **Apply manifests:**
   ```bash
   cd enginedge-core/platform/k8s
   kubectl apply -f config/control-plane-config.yaml
   kubectl apply -f apps/control-plane.yaml
   ```

3. **Verify deployment:**
   ```bash
   kubectl get pods -l component=hexagon
   kubectl logs -f deployment/hexagon
   ```

4. **Port forward (optional):**
   ```bash
   kubectl port-forward svc/hexagon 3000:3000
   ```

## Environment Variables

### Required

- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection string
- `KAFKA_BROKERS` - Kafka broker addresses (comma-separated)

### Optional

- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)
- `WORKER_DISCOVERY_MODE` - kubernetes|static (default: kubernetes)
- `WORKER_HEALTH_CHECK_INTERVAL` - Health check interval in ms (default: 30000)
- `WORKFLOW_MAX_DURATION` - Max workflow duration in ms (default: 300000)

See `.env.example` for complete list.

## Health Checks

### Liveness Probe

```bash
curl http://localhost:3000/api/health
```

Expected: `200 OK` with `{"status":"ok"}`

### Readiness Probe

The service is ready when:
- MongoDB connection established
- Redis connection established
- Kafka producer/consumer connected

## Monitoring

### Prometheus Metrics

```bash
curl http://localhost:3000/metrics
```

### Logs

**Docker Compose:**
```bash
docker-compose logs -f hexagon
```

**Kubernetes:**
```bash
kubectl logs -f deployment/hexagon
```

## Troubleshooting

### Service Won't Start

1. **Check dependencies:**
   ```bash
   # MongoDB
   docker exec mongodb mongosh --eval "db.adminCommand('ping')"
   
   # Redis
   docker exec enginedge-redis redis-cli ping
   
   # Kafka
   docker exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092
   ```

2. **Check logs:**
   ```bash
   docker-compose logs hexagon
   ```

3. **Verify environment variables:**
   ```bash
   docker-compose exec hexagon env | grep -E 'MONGODB|REDIS|KAFKA'
   ```

### Workers Not Responding

1. **Check worker health:**
   ```bash
   curl http://localhost:3001/health  # Assistant worker
   ```

2. **Check Kafka connectivity:**
   ```bash
   docker exec kafka kafka-topics --list --bootstrap-server localhost:9092
   ```

3. **Verify worker topics:**
   ```bash
   # Should see topics like:
   # job.requests.assistant
   # job.responses.assistant
   ```

### Workflow Not Completing

1. **Check request status:**
   ```bash
   curl http://localhost:3000/api/orchestrate/<requestId>
   ```

2. **Check worker assignments:**
   - Verify all workers are healthy
   - Check Kafka consumer lag
   - Review worker logs

3. **Check MongoDB:**
   ```bash
   docker exec mongodb mongosh enginedge-hexagon
   db.orchestration_requests.find({status: "processing"}).pretty()
   ```

## Scaling

### Horizontal Scaling

The hexagon can be scaled horizontally:

```bash
kubectl scale deployment hexagon --replicas=3
```

**Considerations:**
- Kafka consumer group ensures only one instance processes each message
- MongoDB handles concurrent requests
- Redis caching is shared across instances

### Vertical Scaling

Adjust resource limits in `control-plane.yaml`:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

## Backup and Recovery

### MongoDB Backup

```bash
docker exec mongodb mongodump --out /backup
```

### Restore

```bash
docker exec mongodb mongorestore /backup
```

## Upgrade Procedure

1. **Build new image:**
   ```bash
   docker build -t hexagon:v1.1.0 .
   ```

2. **Update deployment:**
   ```bash
   kubectl set image deployment/hexagon hexagon=hexagon:v1.1.0
   ```

3. **Monitor rollout:**
   ```bash
   kubectl rollout status deployment/hexagon
   ```

4. **Rollback if needed:**
   ```bash
   kubectl rollout undo deployment/hexagon
   ```

