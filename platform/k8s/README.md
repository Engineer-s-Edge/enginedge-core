# EnginEdge Platform - Kubernetes Manifests

## Overview

This directory contains Kubernetes manifests for deploying the EnginEdge platform and all workers.

## Structure

```
k8s/
├── README.md                                    # This file
├── resume-worker-deployment.yaml                # Resume Worker deployment, service, HPA
├── spacy-service-deployment.yaml           # Resume NLP Service deployment, service, HPA
├── resume-services-configmap.yaml               # ConfigMaps for resume services
├── resume-services-secrets.yaml                 # Secrets for resume services
└── resume-services-servicemonitor.yaml          # Prometheus ServiceMonitors
```

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Namespace `enginedge` created
- Core infrastructure deployed (MongoDB, Kafka, Redis)

## Deployment Order

### 1. Create Namespace (if not exists)

```bash
kubectl create namespace enginedge
```

### 2. Deploy Core Infrastructure First

Deploy in this order:
1. MongoDB
2. Redis
3. Kafka
4. MinIO (if using S3-compatible storage)

### 3. Deploy Resume Services

```bash
# Apply ConfigMaps
kubectl apply -f resume-services-configmap.yaml

# Apply Secrets (edit first!)
kubectl apply -f resume-services-secrets.yaml

# Deploy Resume NLP Service (needs to be ready for resume-worker)
kubectl apply -f spacy-service-deployment.yaml

# Wait for NLP service to be ready
kubectl wait --for=condition=ready pod -l app=spacy-service -n enginedge --timeout=120s

# Deploy Resume Worker
kubectl apply -f resume-worker-deployment.yaml

# Apply ServiceMonitors (if using Prometheus Operator)
kubectl apply -f resume-services-servicemonitor.yaml
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n enginedge -l app=resume-worker
kubectl get pods -n enginedge -l app=spacy-service

# Check services
kubectl get svc -n enginedge | grep resume

# Check HPA
kubectl get hpa -n enginedge | grep resume

# Check logs
kubectl logs -f deployment/resume-worker -n enginedge
kubectl logs -f deployment/spacy-service -n enginedge
```

## Configuration

### Resume Worker Environment Variables

Edit `resume-services-configmap.yaml` and `resume-worker-deployment.yaml`:

- `NODE_ENV` - Environment (production, development)
- `PORT` - Service port (default: 3006)
- `MONGODB_URI` - MongoDB connection string
- `KAFKA_BROKERS` - Kafka broker addresses
- `REDIS_URL` - Redis connection string
- `RESUME_NLP_SERVICE_URL` - NLP service URL

### Resume NLP Service Environment Variables

Edit `resume-services-configmap.yaml` and `spacy-service-deployment.yaml`:

- `PORT` - Service port (default: 8001)
- `WORKERS` - Number of uvicorn workers (default: 4)
- `KAFKA_BROKERS` - Kafka broker addresses
- `SPACY_MODEL` - spaCy model name (default: en_core_web_sm)

### Secrets

**IMPORTANT**: Edit `resume-services-secrets.yaml` before deploying:

```bash
# Generate secure secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For ENCRYPTION_KEY

# Edit secrets file
vi resume-services-secrets.yaml
```

## Scaling

### Manual Scaling

```bash
# Scale resume-worker
kubectl scale deployment resume-worker --replicas=5 -n enginedge

# Scale spacy-service
kubectl scale deployment spacy-service --replicas=8 -n enginedge
```

### Auto-scaling (HPA)

HPA is configured automatically:

**Resume Worker:**
- Min: 3 replicas
- Max: 10 replicas
- Target CPU: 70%
- Target Memory: 80%

**Resume NLP Service:**
- Min: 4 replicas
- Max: 20 replicas
- Target CPU: 75%
- Target Memory: 85%

```bash
# Check HPA status
kubectl get hpa -n enginedge

# Describe HPA
kubectl describe hpa resume-worker-hpa -n enginedge
kubectl describe hpa spacy-service-hpa -n enginedge
```

## Monitoring

### ServiceMonitors (Prometheus Operator)

If using Prometheus Operator, ServiceMonitors are included:

```bash
# Apply ServiceMonitors
kubectl apply -f resume-services-servicemonitor.yaml

# Check ServiceMonitors
kubectl get servicemonitor -n enginedge | grep resume
```

### Manual Prometheus Configuration

If not using Prometheus Operator, add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'resume-worker'
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
          - enginedge
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_label_app]
        action: keep
        regex: resume-worker
    metrics_path: '/metrics'

  - job_name: 'spacy-service'
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
          - enginedge
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_label_app]
        action: keep
        regex: spacy-service
    metrics_path: '/metrics'
```

## Troubleshooting

### Resume Worker Issues

```bash
# Check logs
kubectl logs -f deployment/resume-worker -n enginedge

# Check events
kubectl get events -n enginedge --field-selector involvedObject.name=resume-worker

# Describe pod
kubectl describe pod -l app=resume-worker -n enginedge

# Get into container
kubectl exec -it deployment/resume-worker -n enginedge -- /bin/sh
```

### Resume NLP Service Issues

```bash
# Check logs
kubectl logs -f deployment/spacy-service -n enginedge

# Check if spaCy model loaded
kubectl logs deployment/spacy-service -n enginedge | grep "spaCy"

# Check events
kubectl get events -n enginedge --field-selector involvedObject.name=spacy-service

# Get into container
kubectl exec -it deployment/spacy-service -n enginedge -- /bin/sh
```

### Common Issues

**Issue: Resume NLP Service fails to start**
```bash
# Check if spaCy model is installed
kubectl logs deployment/spacy-service -n enginedge | grep "model"

# Rebuild Docker image with spaCy model
cd enginedge-workers/spacy-service
docker build -t spacy-service:latest .
```

**Issue: Resume Worker can't connect to NLP service**
```bash
# Check service exists
kubectl get svc spacy-service -n enginedge

# Test connectivity from resume-worker
kubectl exec -it deployment/resume-worker -n enginedge -- curl http://spacy-service:8001/health
```

**Issue: High memory usage**
```bash
# Check resource usage
kubectl top pods -n enginedge -l app=spacy-service

# Increase memory limits in deployment
kubectl edit deployment spacy-service -n enginedge
```

## Updates and Rollbacks

### Update Deployment

```bash
# Update image
kubectl set image deployment/resume-worker resume-worker=resume-worker:v1.1.0 -n enginedge

# Or apply updated YAML
kubectl apply -f resume-worker-deployment.yaml

# Check rollout status
kubectl rollout status deployment/resume-worker -n enginedge
```

### Rollback

```bash
# View rollout history
kubectl rollout history deployment/resume-worker -n enginedge

# Rollback to previous version
kubectl rollout undo deployment/resume-worker -n enginedge

# Rollback to specific revision
kubectl rollout undo deployment/resume-worker --to-revision=2 -n enginedge
```

## Resource Requirements

### Resume Worker
- **Requests**: 512Mi memory, 500m CPU
- **Limits**: 2Gi memory, 2000m CPU
- **Replicas**: 3-10 (auto-scaling)

### Resume NLP Service
- **Requests**: 1Gi memory, 1000m CPU
- **Limits**: 4Gi memory, 4000m CPU
- **Replicas**: 4-20 (auto-scaling)

### Total Cluster Requirements

For default configuration (3 resume-worker + 4 spacy-service):
- **Minimum**: ~6Gi memory, 6 CPU cores
- **Recommended**: ~12Gi memory, 12 CPU cores (with headroom)

## Production Checklist

- [ ] Secrets properly configured (not using defaults)
- [ ] Resource limits adjusted for workload
- [ ] MongoDB indexes created
- [ ] Kafka topics created
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Alerts configured
- [ ] Backup strategy in place
- [ ] Logging configured (ELK/Loki)
- [ ] Network policies configured (if using)
- [ ] Ingress configured for external access
- [ ] SSL/TLS certificates configured
- [ ] Health checks verified
- [ ] Auto-scaling tested

## Additional Resources

- [Resume Worker Documentation](../../enginedge-workers/resume-worker/documentation/)
- [Resume NLP Service Documentation](../../enginedge-workers/spacy-service/)
- [Platform Docker Compose](../docker-compose.yml)
- [Deployment Guide](../../enginedge-workers/resume-worker/documentation/DEPLOYMENT.md)

---

**Last Updated**: November 3, 2025  
**Version**: 1.0.0
