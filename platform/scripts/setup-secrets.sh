#!/bin/bash
# EnginEdge Secrets Setup Helper Script
# This script helps create Kubernetes secrets from example files

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
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$PLATFORM_DIR/k8s/secrets"

generate_password() {
    openssl rand -base64 32 | tr -d '\n'
}

base64_encode() {
    echo -n "$1" | base64 -w 0
}

create_mongodb_secret() {
    log_info "Creating MongoDB secret..."
    
    if [ -f "$SECRETS_DIR/mongodb-secret.yaml" ]; then
        log_warn "mongodb-secret.yaml already exists. Skipping..."
        return
    fi
    
    if [ ! -f "$SECRETS_DIR/mongodb-secret.yaml.example" ]; then
        log_error "mongodb-secret.yaml.example not found!"
        return
    fi
    
    # Generate passwords
    MONGO_ROOT_PASSWORD=$(generate_password)
    MONGO_PASSWORD=$(generate_password)
    
    # Create MongoDB URI
    MONGO_URI="mongodb://enginedge-user:${MONGO_PASSWORD}@mongodb-service:27017/enginedge-hexagon?authSource=admin"
    
    # Copy example and replace values
    cp "$SECRETS_DIR/mongodb-secret.yaml.example" "$SECRETS_DIR/mongodb-secret.yaml"
    
    # Replace placeholders (this is a simple approach - you may need to adjust based on your example file format)
    sed -i "s/REPLACE_WITH_MONGO_ROOT_PASSWORD/$(base64_encode "$MONGO_ROOT_PASSWORD")/g" "$SECRETS_DIR/mongodb-secret.yaml"
    sed -i "s/REPLACE_WITH_MONGO_PASSWORD/$(base64_encode "$MONGO_PASSWORD")/g" "$SECRETS_DIR/mongodb-secret.yaml"
    sed -i "s|REPLACE_WITH_MONGODB_URI|$(base64_encode "$MONGO_URI")|g" "$SECRETS_DIR/mongodb-secret.yaml"
    
    log_info "MongoDB secret file created: $SECRETS_DIR/mongodb-secret.yaml"
    log_warn "Please review and edit the file if needed before applying."
}

create_postgres_secret() {
    log_info "Creating PostgreSQL secret..."
    
    if [ -f "$SECRETS_DIR/postgres-secret.yaml" ]; then
        log_warn "postgres-secret.yaml already exists. Skipping..."
        return
    fi
    
    if [ ! -f "$SECRETS_DIR/postgres-secret.yaml.example" ]; then
        log_error "postgres-secret.yaml.example not found!"
        return
    fi
    
    # Generate password
    POSTGRES_PASSWORD=$(generate_password)
    
    # Copy example and replace values
    cp "$SECRETS_DIR/postgres-secret.yaml.example" "$SECRETS_DIR/postgres-secret.yaml"
    
    sed -i "s/REPLACE_WITH_POSTGRES_PASSWORD/$(base64_encode "$POSTGRES_PASSWORD")/g" "$SECRETS_DIR/postgres-secret.yaml"
    
    log_info "PostgreSQL secret file created: $SECRETS_DIR/postgres-secret.yaml"
    log_warn "Please review and edit the file if needed before applying."
}

create_minio_secret() {
    log_info "Creating MinIO secret..."
    
    if [ -f "$SECRETS_DIR/minio-secret.yaml" ]; then
        log_warn "minio-secret.yaml already exists. Skipping..."
        return
    fi
    
    if [ ! -f "$SECRETS_DIR/minio-secret.yaml.example" ]; then
        log_error "minio-secret.yaml.example not found!"
        return
    fi
    
    # Generate credentials
    MINIO_ROOT_USER="minioadmin"
    MINIO_ROOT_PASSWORD=$(generate_password)
    
    # Copy example and replace values
    cp "$SECRETS_DIR/minio-secret.yaml.example" "$SECRETS_DIR/minio-secret.yaml"
    
    sed -i "s/REPLACE_WITH_MINIO_ROOT_USER/$(base64_encode "$MINIO_ROOT_USER")/g" "$SECRETS_DIR/minio-secret.yaml"
    sed -i "s/REPLACE_WITH_MINIO_ROOT_PASSWORD/$(base64_encode "$MINIO_ROOT_PASSWORD")/g" "$SECRETS_DIR/minio-secret.yaml"
    
    log_info "MinIO secret file created: $SECRETS_DIR/minio-secret.yaml"
    log_warn "Please review and edit the file if needed before applying."
}

create_jwt_secret() {
    log_info "Creating JWT secret..."
    
    if [ -f "$SECRETS_DIR/jwt-secret.yaml" ]; then
        log_warn "jwt-secret.yaml already exists. Skipping..."
        return
    fi
    
    if [ ! -f "$SECRETS_DIR/jwt-secret.yaml.example" ]; then
        log_error "jwt-secret.yaml.example not found!"
        return
    fi
    
    # Generate JWT secret
    JWT_SECRET=$(generate_password)
    
    # Copy example and replace values
    cp "$SECRETS_DIR/jwt-secret.yaml.example" "$SECRETS_DIR/jwt-secret.yaml"
    
    sed -i "s/REPLACE_WITH_JWT_SECRET/$(base64_encode "$JWT_SECRET")/g" "$SECRETS_DIR/jwt-secret.yaml"
    
    log_info "JWT secret file created: $SECRETS_DIR/jwt-secret.yaml"
    log_warn "Please review and edit the file if needed before applying."
}

create_ghcr_pull_secret() {
    log_info "Creating GHCR pull secret..."
    
    if kubectl get secret ghcr-pull-secret &> /dev/null; then
        log_warn "ghcr-pull-secret already exists. Skipping..."
        return
    fi
    
    read -p "Enter your GitHub username: " GITHUB_USERNAME
    read -sp "Enter your GitHub Personal Access Token: " GITHUB_PAT
    echo
    read -p "Enter your email: " GITHUB_EMAIL
    
    kubectl create secret docker-registry ghcr-pull-secret \
        --docker-server=ghcr.io \
        --docker-username="$GITHUB_USERNAME" \
        --docker-password="$GITHUB_PAT" \
        --docker-email="$GITHUB_EMAIL" \
        --namespace=default
    
    log_info "GHCR pull secret created in default namespace"
}

apply_secrets() {
    log_info "Applying secrets to Kubernetes cluster..."
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        return
    fi
    
    # Apply secrets
    for secret_file in "$SECRETS_DIR"/*.yaml; do
        if [ -f "$secret_file" ] && [[ "$secret_file" != *.example ]]; then
            log_info "Applying $(basename "$secret_file")..."
            kubectl apply -f "$secret_file" || log_warn "Failed to apply $(basename "$secret_file")"
        fi
    done
    
    log_info "Secrets applied to cluster"
}

main() {
    log_info "EnginEdge Secrets Setup Helper"
    log_info "This script will help you create Kubernetes secrets"
    
    echo ""
    echo "What would you like to do?"
    echo "1) Create all secret files from examples"
    echo "2) Create MongoDB secret"
    echo "3) Create PostgreSQL secret"
    echo "4) Create MinIO secret"
    echo "5) Create JWT secret"
    echo "6) Create GHCR pull secret"
    echo "7) Apply all secrets to cluster"
    echo "8) Exit"
    echo ""
    read -p "Enter choice [1-8]: " choice
    
    case $choice in
        1)
            create_mongodb_secret
            create_postgres_secret
            create_minio_secret
            create_jwt_secret
            log_info "All secret files created. Please review them before applying."
            ;;
        2)
            create_mongodb_secret
            ;;
        3)
            create_postgres_secret
            ;;
        4)
            create_minio_secret
            ;;
        5)
            create_jwt_secret
            ;;
        6)
            create_ghcr_pull_secret
            ;;
        7)
            apply_secrets
            ;;
        8)
            log_info "Exiting..."
            exit 0
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
}

main "$@"

