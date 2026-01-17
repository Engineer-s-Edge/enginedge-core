# NGINX Ingress Controller Installation Guide

This guide provides step-by-step commands to install NGINX Ingress Controller and set up API Gateway ingress on your EnginEdge cluster.

## Prerequisites

- SSH access to your control plane node (192.168.72.102)
- Kubernetes cluster is running and accessible
- `kubectl` is configured and working

## Installation Steps

### 1. Navigate to the onprem-setup directory

```bash
cd enginedge-core/platform/onprem-setup
```

### 2. Make scripts executable

```bash
chmod +x scripts/*.sh
```

### 3. Install NGINX Ingress Controller

```bash
./scripts/install-nginx-ingress.sh
```

This script will:
- Check if Helm is available (uses Helm if found, otherwise uses kubectl)
- Install NGINX Ingress Controller in the `ingress-nginx` namespace
- Configure NodePort service (HTTP: 30080, HTTPS: 30443)
- Wait for the controller to be ready
- Display verification information

**Expected output:** You should see the ingress controller pods running and the NodePort information.

### 4. Apply API Gateway Ingress Configuration

```bash
kubectl apply -f ../../platform/k8s/prod/apps/api-gateway-ingress.yaml
```

### 5. Verify the Setup

```bash
./scripts/verify-api-gateway-ingress.sh
```

This will check:
- API Gateway service and deployment
- API Gateway pods status
- NGINX Ingress Controller status
- Ingress resource status
- Ingress controller service details

### 6. Get the Ingress Controller Port

```bash
kubectl get svc -n ingress-nginx
```

Look for the `ingress-nginx-controller` service and note the NodePort (usually **30080** for HTTP).

### 7. Test the API Gateway

```bash
./scripts/test-api-gateway-ingress.sh 192.168.72.102 30080
```

Or test manually:

```bash
# Health check
curl http://192.168.72.102:30080/api/health

# API documentation
curl http://192.168.72.102:30080/api/docs

# Test authentication endpoint
curl -X POST http://192.168.72.102:30080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

## Quick Command Reference

```bash
# Full installation sequence
cd enginedge-core/platform/onprem-setup
chmod +x scripts/*.sh
./scripts/install-nginx-ingress.sh
kubectl apply -f ../../platform/k8s/prod/apps/api-gateway-ingress.yaml
./scripts/verify-api-gateway-ingress.sh
kubectl get svc -n ingress-nginx
./scripts/test-api-gateway-ingress.sh 192.168.72.102 30080
```

## Troubleshooting

### Ingress Controller Not Starting

Check pod status:
```bash
kubectl get pods -n ingress-nginx
kubectl describe pod -n ingress-nginx -l app.kubernetes.io/component=controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

### Ingress Resource Not Working

Check ingress status:
```bash
kubectl get ingress api-gateway-ingress
kubectl describe ingress api-gateway-ingress
```

### Cannot Access API Gateway

1. Verify ingress controller is running:
   ```bash
   kubectl get pods -n ingress-nginx
   ```

2. Check the NodePort:
   ```bash
   kubectl get svc -n ingress-nginx ingress-nginx-controller
   ```

3. Verify API Gateway pods are running:
   ```bash
   kubectl get pods -l component=api-gateway
   ```

4. Test from within the cluster:
   ```bash
   kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- curl http://api-gateway:8080/api/health
   ```

### Port Already in Use

If port 30080 is already in use, you can modify the ingress controller service:

```bash
# Edit the service to use a different NodePort
kubectl edit svc ingress-nginx-controller -n ingress-nginx
# Change the nodePort value under ports
```

Or reinstall with a custom port using Helm:
```bash
helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.service.nodePorts.http=30081
```

## Accessing from Other Machines

Once installed, you can access the API Gateway from any machine on the network:

```bash
# Replace <node-ip> with your control plane IP (192.168.72.102)
# Replace <port> with the NodePort (usually 30080)
curl http://<node-ip>:<port>/api/health
```

## Next Steps

- Set up DNS entries if you want to use hostnames instead of IP addresses
- Configure TLS certificates for HTTPS access
- Set up firewall rules to allow traffic on the NodePort
- Configure load balancing if you have multiple control plane nodes

