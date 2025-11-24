#!/bin/bash
# Install Kubernetes Metrics Server
# Required for HPA (Horizontal Pod Autoscaler) to work

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_warn "kubectl not found. Make sure kubeconfig is set up."
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_warn "Cannot connect to cluster. Make sure kubeconfig is configured."
        exit 1
    fi
}

install_metrics_server() {
    log_info "Installing metrics-server..."
    
    # Apply metrics-server manifest
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    
    # Patch metrics-server to work with self-signed certificates (common in on-prem setups)
    log_info "Patching metrics-server for self-signed certificates..."
    kubectl patch deployment metrics-server -n kube-system --type='json' -p='[
        {
            "op": "add",
            "path": "/spec/template/spec/containers/0/args/-",
            "value": "--kubelet-insecure-tls"
        }
    ]' || log_warn "Failed to patch metrics-server. You may need to do this manually."
    
    # Wait for metrics-server to be ready
    log_info "Waiting for metrics-server to be ready..."
    kubectl wait --for=condition=ready pod -l k8s-app=metrics-server -n kube-system --timeout=300s
    
    log_info "Metrics-server installed successfully!"
}

verify_installation() {
    log_info "Verifying metrics-server installation..."
    
    # Wait a bit for metrics to start collecting
    sleep 10
    
    # Check metrics-server pod
    kubectl get pods -n kube-system | grep metrics-server
    
    # Try to get node metrics
    log_info "Testing metrics collection..."
    if kubectl top nodes 2>/dev/null; then
        log_info "Metrics are working! You can now use HPA."
    else
        log_warn "Metrics not available yet. Wait a minute and try: kubectl top nodes"
    fi
}

main() {
    check_kubectl
    install_metrics_server
    verify_installation
    
    log_info "Metrics-server installation complete!"
    log_info "You can now use HPA (Horizontal Pod Autoscaler) in your deployments."
}

main "$@"

