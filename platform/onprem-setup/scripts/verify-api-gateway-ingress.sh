#!/bin/bash
# Verify API Gateway Ingress Setup
# Run this script on the control plane node

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

NAMESPACE="${NAMESPACE:-default}"

log_header "API Gateway Ingress Verification"
echo ""

# Step 1: Check API Gateway Service
log_info "1. Checking API Gateway Service..."
if kubectl get svc api-gateway -n "$NAMESPACE" &> /dev/null; then
    kubectl get svc api-gateway -n "$NAMESPACE"
    log_info "✓ API Gateway service exists"
else
    log_error "✗ API Gateway service not found!"
    exit 1
fi
echo ""

# Step 2: Check API Gateway Deployment
log_info "2. Checking API Gateway Deployment..."
if kubectl get deployment api-gateway -n "$NAMESPACE" &> /dev/null; then
    kubectl get deployment api-gateway -n "$NAMESPACE"
    log_info "✓ API Gateway deployment exists"
else
    log_error "✗ API Gateway deployment not found!"
    exit 1
fi
echo ""

# Step 3: Check API Gateway Pods
log_info "3. Checking API Gateway Pods..."
PODS=$(kubectl get pods -l component=api-gateway -n "$NAMESPACE" --no-headers 2>/dev/null || echo "")
if [ -z "$PODS" ]; then
    log_error "✗ No API Gateway pods found!"
    exit 1
fi
echo "$PODS"
READY_PODS=$(echo "$PODS" | grep -c "Running" || echo "0")
log_info "✓ Found $READY_PODS running API Gateway pod(s)"
echo ""

# Step 4: Check NGINX Ingress Controller
log_info "4. Checking NGINX Ingress Controller..."
INGRESS_PODS=$(kubectl get pods -n ingress-nginx --no-headers 2>&1 || echo "")
if echo "$INGRESS_PODS" | grep -q "No resources found"; then
    log_warn "⚠ NGINX Ingress Controller not found in ingress-nginx namespace"
    log_warn "  You may need to install it using: ./install-nginx-ingress.sh"
else
    echo "$INGRESS_PODS"
    log_info "✓ NGINX Ingress Controller is running"
fi
echo ""

# Step 5: Check Ingress Class
log_info "5. Checking Ingress Class..."
if kubectl get ingressclass nginx &> /dev/null; then
    kubectl get ingressclass nginx
    log_info "✓ Ingress class 'nginx' exists"
else
    log_warn "⚠ Ingress class 'nginx' not found"
fi
echo ""

# Step 6: Check Ingress Resource
log_info "6. Checking API Gateway Ingress Resource..."
if kubectl get ingress api-gateway-ingress -n "$NAMESPACE" &> /dev/null; then
    kubectl get ingress api-gateway-ingress -n "$NAMESPACE"
    log_info "✓ Ingress resource exists"
else
    log_warn "⚠ Ingress resource not found. You may need to apply it:"
    log_warn "  kubectl apply -f <path-to-api-gateway-ingress.yaml>"
fi
echo ""

# Step 7: Describe Ingress for Details
log_info "7. Ingress Details..."
kubectl describe ingress api-gateway-ingress -n "$NAMESPACE" 2>/dev/null || log_warn "Could not describe ingress (may not exist yet)"
echo ""

# Step 8: Get Ingress Controller Service
log_info "8. Checking Ingress Controller Service (for external access)..."
INGRESS_SVC=$(kubectl get svc -n ingress-nginx -o wide 2>&1 || echo "")
if [ -n "$INGRESS_SVC" ] && ! echo "$INGRESS_SVC" | grep -q "No resources found"; then
    echo "$INGRESS_SVC"
    echo ""
    log_info "Note the NodePort or LoadBalancer IP/port above for external access"
    
    # Try to extract NodePort
    NODEPORT_HTTP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}' 2>/dev/null || echo "")
    if [ -n "$NODEPORT_HTTP" ]; then
        log_info "HTTP NodePort: $NODEPORT_HTTP"
    fi
else
    log_warn "⚠ Could not find ingress controller service"
fi
echo ""

log_header "Verification Complete"
echo ""
log_info "Next steps:"
echo "  1. Note the ingress controller service port (usually 30080 for HTTP)"
echo "  2. Test the API gateway: curl http://<node-ip>:<port>/api/health"
echo "  3. Or use the test script: ./test-api-gateway-ingress.sh"

