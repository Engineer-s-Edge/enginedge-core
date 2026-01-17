#!/bin/bash
# Install Calico CNI Plugin for Kubernetes
# Run this after kubeadm init

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

CALICO_VERSION="${CALICO_VERSION:-v3.26.4}"

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

install_calico() {
    log_info "Installing Calico CNI plugin (version: $CALICO_VERSION)..."
    
    # Install Calico operator (use apply to make it idempotent)
    kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/tigera-operator.yaml
    
    # Wait for operator to be ready
    log_info "Waiting for Calico operator to be ready..."
    kubectl wait --for=condition=available deployment/tigera-operator -n tigera-operator --timeout=300s || true
    
    # Install Calico custom resources (use apply to make it idempotent)
    kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/custom-resources.yaml
    
    # Wait for Calico pods to be ready
    log_info "Waiting for Calico pods to be ready (this may take a few minutes)..."
    kubectl wait --for=condition=ready pod -l k8s-app=calico-kube-controllers -n calico-system --timeout=600s
    
    # Wait for Calico node pods
    kubectl wait --for=condition=ready pod -l k8s-app=calico-node -n calico-system --timeout=600s
    
    log_info "Calico CNI installed successfully!"
}

verify_installation() {
    log_info "Verifying installation..."
    
    # Check Calico pods
    kubectl get pods -n calico-system
    
    # Check node status
    echo ""
    log_info "Node status:"
    kubectl get nodes
    
    # Check if node is Ready
    if kubectl get nodes | grep -q "Ready"; then
        log_info "Node is Ready! CNI installation successful."
    else
        log_warn "Node is not Ready yet. Wait a few more minutes and check again."
    fi
}

main() {
    check_kubectl
    install_calico
    verify_installation
    
    log_info "CNI installation complete!"
    log_warn "If running a single-node cluster, remove the taint:"
    log_warn "kubectl taint nodes --all node-role.kubernetes.io/control-plane-"
}

main "$@"

