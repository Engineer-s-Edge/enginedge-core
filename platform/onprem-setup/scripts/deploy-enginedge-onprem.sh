#!/bin/bash
# EnginEdge On-Premises Deployment Script
# This script deploys all EnginEdge services to your Kubernetes cluster
# Run this from the enginedge-core/platform directory

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ONPREM_DIR="$(dirname "$SCRIPT_DIR")"
PLATFORM_DIR="$(dirname "$ONPREM_DIR")"
K8S_DIR="$PLATFORM_DIR/k8s"

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl first."
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi
    
    # Check Helm
    if ! command -v helm &> /dev/null; then
        log_error "Helm not found. Please install Helm first."
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

check_secrets() {
    log_info "Checking for required secrets..."
    
    local missing_secrets=()
    
    # Check for secrets
    if ! kubectl get secret mongodb-secret &> /dev/null; then
        missing_secrets+=("mongodb-secret")
    fi
    
    if ! kubectl get secret postgres-secret &> /dev/null; then
        missing_secrets+=("postgres-secret")
    fi
    
    if ! kubectl get secret minio-secret &> /dev/null; then
        missing_secrets+=("minio-secret")
    fi
    
    if ! kubectl get secret ghcr-pull-secret &> /dev/null; then
        log_warn "ghcr-pull-secret not found. You may need to create it to pull images from GHCR."
        log_warn "Create it with: kubectl create secret docker-registry ghcr-pull-secret --docker-server=ghcr.io --docker-username=<USER> --docker-password=<PAT>"
    fi
    
    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_error "Missing required secrets: ${missing_secrets[*]}"
        log_error "Please create secrets first. See k8s/secrets/README.md for instructions."
        exit 1
    fi
    
    log_info "Required secrets found"
}

add_helm_repos() {
    log_info "Adding Helm repositories..."
    
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add minio https://charts.min.io/
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    log_info "Helm repositories added"
}

deploy_infrastructure() {
    log_info "Deploying infrastructure services..."
    
    # Deploy MongoDB
    log_info "Deploying MongoDB..."
    kubectl apply -f "$K8S_DIR/apps/mongodb.yaml"
    kubectl wait --for=condition=ready pod -l app=enginedge,component=mongodb --timeout=300s || log_warn "MongoDB not ready yet"
    
    # Deploy Kafka
    log_info "Deploying Kafka..."
    if ! helm list | grep -q "^kafka"; then
        helm upgrade --install kafka bitnami/kafka \
            --namespace default \
            -f "$K8S_DIR/charts/kafka/values.yaml"
    else
        log_warn "Kafka already installed. Skipping..."
    fi
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=kafka --timeout=300s || log_warn "Kafka not ready yet"
    
    # Deploy Redis
    log_info "Deploying Redis..."
    if ! helm list | grep -q "^redis"; then
        helm upgrade --install redis bitnami/redis \
            --namespace default \
            -f "$K8S_DIR/charts/redis/values.yaml"
    else
        log_warn "Redis already installed. Skipping..."
    fi
    
    # Deploy MinIO
    log_info "Deploying MinIO..."
    if ! helm list | grep -q "^minio"; then
        helm upgrade --install minio minio/minio \
            --namespace default \
            -f "$K8S_DIR/charts/minio/values.yaml"
    else
        log_warn "MinIO already installed. Skipping..."
    fi
    
    # Deploy PostgreSQL
    log_info "Deploying PostgreSQL..."
    if ! helm list | grep -q "^postgres-metastore"; then
        helm upgrade --install postgres-metastore bitnami/postgresql \
            --namespace default \
            -f "$K8S_DIR/charts/postgres/values.yaml"
    else
        log_warn "PostgreSQL already installed. Skipping..."
    fi
    
    log_info "Infrastructure services deployed"
}

deploy_observability() {
    log_info "Deploying observability stack..."
    
    # Create observability namespace
    kubectl create namespace observability --dry-run=client -o yaml | kubectl apply -f -
    
    # Install Prometheus Stack
    if ! helm list -n observability | grep -q "^kube-prometheus-stack"; then
        helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
            --namespace observability \
            -f "$K8S_DIR/observability/helm-values.yaml"
    else
        log_warn "Prometheus stack already installed. Skipping..."
    fi
    
    # Wait for Prometheus operator
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus-operator -n observability --timeout=300s || log_warn "Prometheus operator not ready yet"
    
    # Apply ServiceMonitors
    log_info "Applying ServiceMonitors..."
    kubectl apply -f "$K8S_DIR/observability/servicemonitors/" || log_warn "Some ServiceMonitors may have failed"
    
    # Apply Grafana Dashboards
    log_info "Applying Grafana Dashboards..."
    kubectl apply -f "$K8S_DIR/observability/dashboards/" || log_warn "Some dashboards may have failed"
    
    # Apply Alerting Rules
    log_info "Applying Alerting Rules..."
    kubectl apply -f "$K8S_DIR/observability/alerting-rules.yaml" || log_warn "Alerting rules may have failed"
    
    log_info "Observability stack deployed"
}

deploy_applications() {
    log_info "Deploying EnginEdge applications..."
    
    # Apply ConfigMaps
    log_info "Applying ConfigMaps..."
    kubectl apply -f "$K8S_DIR/config/" || log_warn "Some ConfigMaps may have failed"
    
    # Apply RBAC
    log_info "Applying RBAC resources..."
    kubectl apply -f "$K8S_DIR/rbac/" || log_warn "Some RBAC resources may have failed"
    
    # Deploy applications
    log_info "Deploying application services..."
    
    # Core services first
    kubectl apply -f "$K8S_DIR/apps/api-gateway.yaml" || log_warn "API Gateway deployment failed"
    kubectl apply -f "$K8S_DIR/apps/hexagon.yaml" || log_warn "Hexagon deployment failed"
    kubectl apply -f "$K8S_DIR/apps/identity-worker.yaml" || log_warn "Identity Worker deployment failed"
    
    # Wait for identity worker (needed by other services)
    kubectl wait --for=condition=ready pod -l app=enginedge,component=identity-worker --timeout=300s || log_warn "Identity Worker not ready yet"
    
    # Workers
    kubectl apply -f "$K8S_DIR/apps/assistant-worker.yaml" || log_warn "Assistant Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/agent-tool-worker.yaml" || log_warn "Agent Tool Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/data-processing-worker.yaml" || log_warn "Data Processing Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/interview-worker.yaml" || log_warn "Interview Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/latex-worker.yaml" || log_warn "LaTeX Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/resume-worker.yaml" || log_warn "Resume Worker deployment failed"
    kubectl apply -f "$K8S_DIR/apps/scheduling-worker.yaml" || log_warn "Scheduling Worker deployment failed"
    
    # Supporting services
    kubectl apply -f "$K8S_DIR/apps/spacy-service.yaml" || log_warn "spaCy Service deployment failed"
    kubectl apply -f "$K8S_DIR/apps/scheduling-model.yaml" || log_warn "Scheduling Model deployment failed"
    kubectl apply -f "$K8S_DIR/apps/wolfram-kernel.yaml" || log_warn "Wolfram Kernel deployment failed"
    
    # Kafka topics
    kubectl apply -f "$K8S_DIR/apps/kafka-topics-init.yaml" || log_warn "Kafka topics init failed"
    
    # News ingestion cronjob
    kubectl apply -f "$K8S_DIR/apps/news-ingestion-cronjob.yaml" || log_warn "News ingestion cronjob failed"
    
    log_info "Application services deployed"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    echo ""
    log_info "Pod status:"
    kubectl get pods
    
    echo ""
    log_info "Service status:"
    kubectl get svc
    
    echo ""
    log_info "Deployment status:"
    kubectl get deployments
    
    log_info "Deployment verification complete"
}

main() {
    log_info "Starting EnginEdge on-premises deployment..."
    
    check_prerequisites
    check_secrets
    add_helm_repos
    deploy_infrastructure
    deploy_observability
    deploy_applications
    verify_deployment
    
    log_info "Deployment complete!"
    log_info "Access services:"
    log_info "  - API Gateway: kubectl port-forward svc/api-gateway 8080:8080"
    log_info "  - Grafana: kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n observability"
    log_info "  - Prometheus: kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n observability"
}

main "$@"

