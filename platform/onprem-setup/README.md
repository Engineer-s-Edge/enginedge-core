# EnginEdge Multi-Node Kubernetes Setup

**See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete system architecture and component details.**

## Requirements

- **Linux**: Ubuntu 22.04 LTS Server (recommended) or Ubuntu 20.04 LTS
- **Master Node**: 4–8GB RAM, 2–4 CPU cores, 30GB disk
- **Worker Node 1 (Core+Infra)**: 16GB RAM, 4–6 CPU cores, 50–80GB disk
- **Worker Node 2 (Workers)**: 16–20GB RAM, 6–8 CPU cores, 50–100GB disk
- **Worker Node 3 (Data Lake & ML)**: 
  - **Minimal (light usage)**: 12–16GB RAM, 4–6 CPU cores, 50–100GB disk
  - **Production (heavy usage)**: 48–64GB RAM, 10–12 CPU cores, 200–300GB disk
- **Network**: All VMs must be able to communicate with each other

**Note**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed resource breakdown based on actual service requirements.

## Quick Start

### 1. Create VMs in Hyper-V
- **Master**: 4–8GB RAM, 2–4 CPU, 30GB disk → `enginedge-k8s-master` (192.168.100.10)
- **Worker1 (Core+Infra)**: 16GB RAM, 4–6 CPU, 50–80GB disk → `enginedge-k8s-worker1` (192.168.100.11)
- **Worker2 (Workers)**: 16–20GB RAM, 6–8 CPU, 50–100GB disk → `enginedge-k8s-worker2` (192.168.100.12)
- **DataLake (Dedicated)**: 12–16GB RAM (minimal) or 48–64GB (production), 4–6 CPU (minimal) or 10–12 CPU (production), 50–100GB disk (minimal) or 200–300GB (production) → `enginedge-k8s-datalake` (192.168.100.13)
  - Hosts: Data Lake stack (Trino, Spark, Airflow, Jupyter) + ML services (scheduling-model, spaCy, wolfram-kernel)
  - **For light usage**: Use `values-local.yaml` or `values-dev.yaml` when deploying Data Lake

### 2. Create Virtual Switch
1. Open Hyper-V Manager
2. Click "Virtual Switch Manager" → "Create Virtual Switch"
3. Select "Internal" (or "External" for internet access)
4. Name: `EnginEdge-K8s-Network`
5. Assign this switch to all VMs (VM Settings → Network Adapter)

### 3. Configure Static IPs
On each Ubuntu VM:

1. **Find network interface**: `ip addr show` (look for eth0, ens33, etc.)
2. **Edit netplan config**: `sudo nano /etc/netplan/00-installer-config.yaml`
3. **Configure static IP** (replace `eth0` with your interface name):
```yaml
network:
  version: 2
  ethernets:
    eth0:  # Replace with your actual interface (eth0, ens33, etc.)
      dhcp4: false
      addresses: [192.168.100.10/24]  # Use .11, .12, .13 for workers
      gateway4: 192.168.100.1
      nameservers: {addresses: [8.8.8.8, 8.8.4.4]}
```
4. **Apply**: `sudo netplan apply`
5. **Verify**: `ip addr show` and test ping between VMs

**IP Assignments:**
- Master: 192.168.100.10
- Worker1: 192.168.100.11
- Worker2: 192.168.100.12
- Data Lake: 192.168.100.13

**See [NETWORK-SETUP.md](./NETWORK-SETUP.md) for detailed instructions and troubleshooting.**

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
# Copy onprem-setup folder to each worker VM, then:
cd enginedge-core/platform/onprem-setup
chmod +x scripts/*.sh
./scripts/setup-worker-node.sh
# Paste join command from master when prompted
# Repeat for Worker1, Worker2, and Data Lake node
```

### 6. Data Lake Node Setup (Recommended)
```bash
# Copy onprem-setup folder to the dedicated Data Lake VM
cd enginedge-core/platform/onprem-setup
chmod +x scripts/*.sh
./scripts/setup-worker-node.sh

# (Optional) Pin shared stateful services to this node
# Edit k8s manifests to add nodeSelector/nodeAffinity for:
#   - minio
#   - postgres
```

### 7. Deploy EnginEdge (Core Platform)
```bash
# Run from enginedge-core/platform/onprem-setup directory
cd enginedge-core/platform/onprem-setup
./scripts/setup-secrets.sh
./scripts/deploy-enginedge-onprem.sh
```

### 8. Verify
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

The Data Lake is resource-intensive and runs best on the dedicated VM. Deploy after the core platform is running:

### 1. Ensure Data Lake Node is Joined
The Data Lake node should already be joined to the cluster (Step 5 above).

### 2. Pin MinIO and PostgreSQL to Data Lake Node (Optional)
To keep storage on the Data Lake node, add node affinity to MinIO and PostgreSQL deployments, or use nodeSelector with label `node-role=datalake`.

### 3. Deploy Data Lake Services
```bash
# From enginedge-datalake directory
cd ../../enginedge-datalake

# For minimal/light usage (12–16GB RAM node):
helm install datalake helm/datalake \
  --namespace datalake \
  --create-namespace \
  -f helm/datalake/values-local.yaml  # or values-dev.yaml

# For production/heavy usage (48–64GB RAM node):
helm install datalake helm/datalake \
  --namespace datalake \
  --create-namespace \
  -f helm/datalake/values-prod.yaml

# Or use Kubernetes manifests
kubectl apply -f kubernetes/
```

See `enginedge-datalake/helm/datalake/README.md` for detailed instructions.

**Note**: 
- Data Lake shares MinIO and PostgreSQL with the core platform
- **For 16GB RAM node**: Use `values-local.yaml` (minimal resources, single replicas) - total requests ~3.5–4Gi for Data Lake + ~3.5Gi for ML = ~7Gi + system = ~10–12GB total
- **For production**: Use `values-prod.yaml` (requires 48–64GB RAM)
- Consider using node affinity to pin data lake pods to the dedicated node

## Troubleshooting

**Worker won't join**: Check `sudo systemctl status kubelet` and verify network connectivity

**Pods not distributing**: Check `kubectl get nodes` - all should be Ready

**Network issues**: Verify all VMs use same virtual switch and can ping each other

**Data Lake not accessible**: Ensure API Gateway is running and you have admin role

