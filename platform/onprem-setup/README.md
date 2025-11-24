# EnginEdge Multi-Node Kubernetes Setup

**See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete system architecture and component details.**

## Requirements

- **Linux**: Ubuntu 22.04 LTS Server (recommended) or Ubuntu 20.04 LTS
- **Master Node**: 8GB RAM, 4 CPU cores, 50GB disk minimum
- **Worker Nodes**: 16GB RAM, 4 CPU cores, 100GB disk minimum each
- **Network**: All VMs must be able to communicate with each other

## Quick Start

### 1. Create VMs in Hyper-V
- **Master**: 8GB RAM, 4 CPU, 50GB disk → `enginedge-k8s-master` (192.168.100.10)
- **Worker1**: 16GB RAM, 4 CPU, 100GB disk → `enginedge-k8s-worker1` (192.168.100.11)
- **Worker2**: 16GB RAM, 4 CPU, 100GB disk → `enginedge-k8s-worker2` (192.168.100.12)

### 2. Create Virtual Switch
Hyper-V Manager → Virtual Switch Manager → Create Internal Switch → Name: `EnginEdge-K8s-Network`

### 3. Configure Static IPs
On each VM, edit `/etc/netplan/00-installer-config.yaml`:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses: [192.168.100.10/24]  # Use .11, .12 for workers
      gateway4: 192.168.100.1
      nameservers: {addresses: [8.8.8.8, 8.8.4.4]}
```
Apply: `sudo netplan apply`

### 4. Master Node Setup
```bash
# Copy onprem-setup folder to VM, then:
cd enginedge-core/platform/onprem-setup
chmod +x scripts/*.sh
./scripts/setup-kubeadm.sh
./scripts/install-cni.sh
./scripts/install-metrics-server.sh
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Get join command (save this!)
kubeadm token create --print-join-command
```

### 5. Worker Nodes Setup
```bash
# Copy onprem-setup folder to VM, then:
cd enginedge-core/platform/onprem-setup
chmod +x scripts/*.sh
./scripts/setup-worker-node.sh
# Paste join command from master when prompted
```

### 6. Deploy EnginEdge
```bash
# Run from enginedge-core/platform/onprem-setup directory
cd enginedge-core/platform/onprem-setup
./scripts/setup-secrets.sh
./scripts/deploy-enginedge-onprem.sh
```

### 7. Verify
```bash
kubectl get nodes
kubectl get pods -o wide  # See pods distributed across nodes
```

## Scripts

- `setup-kubeadm.sh` - Install Kubernetes on master
- `setup-worker-node.sh` - Install Kubernetes on workers
- `install-cni.sh` - Install Calico CNI
- `install-metrics-server.sh` - Install metrics server
- `setup-secrets.sh` - Create Kubernetes secrets
- `deploy-enginedge-onprem.sh` - Deploy all EnginEdge core platform services

**Note**: This deploys the core platform only. Data Lake deployment is separate (see below).

## Deploying Data Lake (Optional)

The Data Lake is a separate component for big data processing. To deploy:

```bash
# From enginedge-datalake directory
cd ../../enginedge-datalake

# Deploy using Helm
helm install datalake helm/datalake \
  --namespace datalake \
  --create-namespace \
  -f helm/datalake/values-prod.yaml

# Or use Kubernetes manifests
kubectl apply -f kubernetes/
```

See `enginedge-datalake/helm/datalake/README.md` for detailed instructions.

**Note**: Data Lake shares MinIO and PostgreSQL with the core platform.

## Troubleshooting

**Worker won't join**: Check `sudo systemctl status kubelet` and verify network connectivity

**Pods not distributing**: Check `kubectl get nodes` - all should be Ready

**Network issues**: Verify all VMs use same virtual switch and can ping each other

**Data Lake not accessible**: Ensure API Gateway is running and you have admin role

