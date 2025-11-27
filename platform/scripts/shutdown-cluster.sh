#!/bin/bash
# Script to safely shut down the EnginEdge Kubernetes Cluster
# Run this on the Control Plane node

set -e

# Node definitions
WORKERS=("enginedge-k8s-core" "enginedge-k8s-data-and-ml" "enginedge-k8s-workers")
CONTROL_PLANE="enginedge-k8s-control-plane"

echo "⚠️  WARNING: This will drain and shut down the entire cluster."
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo "==============================================="
echo "Phase 1: Draining Worker Nodes"
echo "==============================================="

for node in "${WORKERS[@]}"; do
    echo "Draining $node..."
    # Ignore daemonsets (like Calico/Kube-Proxy) and local storage warnings
    # We use a timeout so if a pod is stuck, we don't hang forever
    kubectl drain "$node" --ignore-daemonsets --delete-emptydir-data --force --timeout=60s || echo "Warning: Drain on $node timed out or had errors, proceeding anyway..."
done

echo "==============================================="
echo "Phase 2: Shutting Down Worker VMs"
echo "==============================================="

for node in "${WORKERS[@]}"; do
    echo "Shutting down $node..."
    # Try to SSH and shutdown. 
    # -t forces a TTY so you can enter sudo password if needed
    # ConnectTimeout ensures we don't wait forever if the node is already down
    if ssh -t -o ConnectTimeout=5 "$node" "sudo shutdown -h now"; then
        echo "Shutdown command sent to $node."
    else
        echo "❌ Could not SSH into $node to shut it down."
        echo "   Please shut down $node manually via Hyper-V or SSH."
    fi
done

echo "==============================================="
echo "Phase 3: Shutting Down Control Plane"
echo "==============================================="

echo "Draining Control Plane ($CONTROL_PLANE)..."
kubectl drain "$CONTROL_PLANE" --ignore-daemonsets --delete-emptydir-data --force --timeout=60s || echo "Warning: Drain failed, proceeding..."

echo "Shutting down Control Plane in 10 seconds..."
echo "Press Ctrl+C to cancel."
sleep 10

sudo shutdown -h now
