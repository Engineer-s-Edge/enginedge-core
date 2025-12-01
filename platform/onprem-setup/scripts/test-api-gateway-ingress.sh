#!/bin/bash
# Test API Gateway Ingress
# Usage: ./test-api-gateway-ingress.sh [node-ip] [ingress-port]

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

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
}

# Get parameters
CONTROL_PLANE_IP="${1:-192.168.72.102}"
INGRESS_PORT="${2:-30080}"

BASE_URL="http://${CONTROL_PLANE_IP}:${INGRESS_PORT}"

log_header "API Gateway Ingress Testing"
echo ""
log_info "Testing API Gateway at: $BASE_URL"
echo ""

# Test 1: Health Check
log_info "1. Testing Health Endpoint..."
if curl -sf -m 10 "${BASE_URL}/api/health" > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s -m 10 "${BASE_URL}/api/health")
    log_success "Health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "${BASE_URL}/api/health" || echo "000")
    if [ "$HTTP_CODE" != "000" ]; then
        log_warn "Health check returned HTTP $HTTP_CODE"
    else
        log_fail "Health check failed - connection refused or timeout"
        log_warn "Make sure:"
        echo "   - Ingress controller is running"
        echo "   - Ingress resource is applied"
        echo "   - API Gateway pods are running"
        echo "   - Correct port is specified (check with: kubectl get svc -n ingress-nginx)"
    fi
fi
echo ""

# Test 2: API Documentation
log_info "2. Testing API Documentation Endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "${BASE_URL}/api/docs" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log_success "API documentation accessible"
    log_info "Visit: $BASE_URL/api/docs in your browser"
elif [ "$HTTP_CODE" != "000" ]; then
    log_warn "API docs endpoint returned HTTP $HTTP_CODE"
else
    log_warn "Could not reach API docs endpoint"
fi
echo ""

# Test 3: Test Authentication Endpoint
log_info "3. Testing Authentication Endpoint..."
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -m 10 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' \
    "${BASE_URL}/api/auth/login" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "Authentication endpoint is accessible (200 OK)"
elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
    log_success "Authentication endpoint is accessible (HTTP $HTTP_CODE - expected with test credentials)"
elif [ "$HTTP_CODE" != "000" ]; then
    log_warn "Authentication endpoint returned HTTP $HTTP_CODE"
else
    log_warn "Could not reach authentication endpoint"
fi
echo ""

# Test 4: Test Worker Service Proxying (Assistants)
log_info "4. Testing Worker Service Proxying (Assistants)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "${BASE_URL}/api/assistants" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log_success "Assistants endpoint is accessible"
elif [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "503" ]; then
    log_warn "Assistants endpoint returned HTTP $HTTP_CODE (may be expected if worker service is not ready)"
elif [ "$HTTP_CODE" != "000" ]; then
    log_warn "Assistants endpoint returned HTTP $HTTP_CODE"
else
    log_warn "Could not reach assistants endpoint"
fi
echo ""

# Summary
log_header "Test Summary"
echo ""
log_info "Base URL: $BASE_URL"
echo ""
log_info "Available endpoints to test:"
echo "  - Health:     $BASE_URL/api/health"
echo "  - API Docs:   $BASE_URL/api/docs"
echo "  - Auth Login: $BASE_URL/api/auth/login"
echo "  - Assistants: $BASE_URL/api/assistants"
echo ""
log_info "To test from another machine, use:"
echo "  curl http://${CONTROL_PLANE_IP}:${INGRESS_PORT}/api/health"
echo ""

