#!/bin/bash
# Install NGINX Ingress Controller for Kubernetes
# This script installs NGINX Ingress Controller using Helm or kubectl

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    log_info "Checking cluster connection..."
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to cluster. Please start your Kubernetes cluster first."
        exit 1
    fi
    
    log_info "Cluster is accessible"
}

check_helm() {
    if command -v helm &> /dev/null; then
        HELM_VERSION=$(helm version --short 2>&1 || echo "")
        if [[ -n "$HELM_VERSION" ]]; then
            log_info "Helm found - will use Helm for installation"
            return 0
        fi
    fi
    
    log_warn "Helm not found - will use kubectl apply method"
    return 1
}

install_with_helm() {
    log_info "Installing NGINX Ingress Controller using Helm..."
    
    # Add ingress-nginx Helm repo
    log_info "Adding ingress-nginx Helm repository..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>&1 | grep -v "already exists" || true
    helm repo update
    
    # Install ingress-nginx
    log_info "Installing ingress-nginx controller..."
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=NodePort \
        --set controller.service.nodePorts.http=30080 \
        --set controller.service.nodePorts.https=30443 \
        --wait \
        --timeout 5m
    
    if [ $? -eq 0 ]; then
        log_info "NGINX Ingress Controller installed successfully with Helm"
    else
        log_error "Installation failed"
        exit 1
    fi
}

install_with_kubectl() {
    log_info "Installing NGINX Ingress Controller using kubectl..."
    
    INGRESS_VERSION="${INGRESS_VERSION:-v1.8.2}"
    INGRESS_YAML="https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-${INGRESS_VERSION}/deploy/static/provider/cloud/deploy.yaml"
    
    log_info "Downloading and applying ingress-nginx manifest (version: $INGRESS_VERSION)..."
    kubectl apply -f "$INGRESS_YAML"
    
    if [ $? -eq 0 ]; then
        log_info "NGINX Ingress Controller manifest applied successfully"
    else
        log_error "Installation failed"
        exit 1
    fi
    
    # Wait for ingress controller to be ready
    log_info "Waiting for ingress controller to be ready (this may take a few minutes)..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=300s || {
        log_warn "Timeout waiting for pods. They may still be starting up."
        log_warn "Check status with: kubectl get pods -n ingress-nginx"
    }
}

verify_installation() {
    log_header "Verification"
    
    echo ""
    log_info "Ingress controller pods:"
    kubectl get pods -n ingress-nginx
    
    echo ""
    log_info "Ingress class:"
    kubectl get ingressclass
    
    echo ""
    log_info "Ingress controller service:"
    kubectl get svc -n ingress-nginx
    
    echo ""
    log_info "Getting NodePort for external access..."
    NODEPORT_HTTP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}' 2>/dev/null || echo "N/A")
    NODEPORT_HTTPS=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.name=="https")].nodePort}' 2>/dev/null || echo "N/A")
    
    if [ "$NODEPORT_HTTP" != "N/A" ]; then
        log_info "HTTP NodePort: $NODEPORT_HTTP"
    fi
    if [ "$NODEPORT_HTTPS" != "N/A" ]; then
        log_info "HTTPS NodePort: $NODEPORT_HTTPS"
    fi
}

main() {
    log_header "Installing NGINX Ingress Controller"
    echo ""
    
    check_kubectl
    echo ""
    
    if check_helm; then
        install_with_helm
    else
        install_with_kubectl
    fi
    
    echo ""
    verify_installation
    
    echo ""
    log_header "Installation Complete"
    log_info "Next steps:"
    echo "  1. Apply your ingress resources: kubectl apply -f <ingress-yaml>"
    echo "  2. Access services via NodePort (usually 30080 for HTTP)"
    echo "  3. Example: curl http://<node-ip>:30080/api/health"
    echo ""
}

main "$@"

