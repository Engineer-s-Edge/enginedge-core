#!/bin/bash
# fix-dns-and-image.sh
# Fixes the scheduling-model image and restarts CoreDNS

echo "==============================================="
echo "Phase 1: Fixing Scheduling Model Image"
echo "==============================================="

# Get the absolute path to the script directory to find the YAML file reliably
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PLATFORM_ROOT="$(dirname "$SCRIPT_DIR")"
YAML_FILE="$PLATFORM_ROOT/k8s/prod/apps/scheduling-model.yaml"

if [ -f "$YAML_FILE" ]; then
    echo "Applying $YAML_FILE..."
    kubectl apply -f "$YAML_FILE"
else
    echo "❌ Error: Could not find $YAML_FILE"
    echo "   Attempting fallback to relative path..."
    kubectl apply -f ../k8s/prod/apps/scheduling-model.yaml || echo "Failed to apply YAML."
fil

echo "==============================================="
echo "Phase 2: Restarting CoreDNS"
echo "==============================================="

echo "Restarting CoreDNS to flush caches and fix resolution..."
kubectl rollout restart deployment coredns -n kube-system

echo "Waiting for CoreDNS to roll out..."
kubectl rollout status deployment coredns -n kube-system

echo "==============================================="
echo "Phase 3: Verifying DNS"
echo "==============================================="

echo "Testing internal DNS resolution..."
# Launch a tiny pod to test DNS
kubectl run dns-test --image=busybox:1.28 --restart=Never --rm -it -- nslookup kubernetes.default

echo ""
echo "✅ Fixes applied."
echo "Please wait 1-2 minutes and run 'scripts/diagnose-cluster.sh' again."
