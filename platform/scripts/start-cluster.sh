#!/bin/bash
# Script to restore the EnginEdge Kubernetes Cluster after a shutdown
# Run this on the Control Plane node AFTER all VMs are powered on

set -e

# Node definitions
NODES=("enginedge-k8s-control-plane" "enginedge-k8s-core" "enginedge-k8s-data-and-ml" "enginedge-k8s-workers")

echo "==============================================="
echo "Restoring Cluster Nodes"
echo "==============================================="

for node in "${NODES[@]}"; do
    echo "Checking $node..."
    
    # Check if node is Ready
    if kubectl get node "$node" | grep -q "Ready"; then
        echo "Node $node is online. Uncordoning..."
        kubectl uncordon "$node"
    else
        echo "⚠️  Node $node is NotReady or unreachable."
        echo "   Please check if the VM is powered on."
    fi
done

echo "==============================================="
echo "Cluster Status"
echo "==============================================="
kubectl get nodes

echo ""
echo "✅ Cluster restore process complete."
