#!/bin/bash
set -e

# 1. Define Variables
SECRETS_DIR="$HOME/enginedge-platform/k8s/prod/secrets"
mkdir -p $SECRETS_DIR

# Helper function
generate_password() { openssl rand -base64 32 | tr -d '\n'; }
base64_encode() { echo -n "$1" | base64 -w 0; }

# Generate Credentials
MONGO_ROOT_USER="root"
MONGO_ROOT_PASSWORD=$(generate_password)
MONGO_PASSWORD=$(generate_password)
MONGO_URI="mongodb://root:${MONGO_PASSWORD}@mongodb-service:27017/enginedge-hexagon?authSource=admin"

POSTGRES_PASSWORD=$(generate_password)

MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD=$(generate_password)

echo "Generating secrets in $SECRETS_DIR..."

# 2. Create MongoDB Secret
cat <<EOF > "$SECRETS_DIR/mongodb-secret.yaml"
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-secret
  namespace: default
type: Opaque
data:
  mongodb-root-username: $(base64_encode "$MONGO_ROOT_USER")
  mongodb-root-password: $(base64_encode "$MONGO_ROOT_PASSWORD")
  mongodb-uri: $(base64_encode "$MONGO_URI")
EOF

# 3. Create Postgres Secret
cat <<EOF > "$SECRETS_DIR/postgres-secret.yaml"
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: default
type: Opaque
data:
  postgres-password: $(base64_encode "$POSTGRES_PASSWORD")
EOF

# 4. Create MinIO Secret
cat <<EOF > "$SECRETS_DIR/minio-secret.yaml"
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: default
type: Opaque
data:
  rootUser: $(base64_encode "$MINIO_ROOT_USER")
  rootPassword: $(base64_encode "$MINIO_ROOT_PASSWORD")
EOF

# 5. Apply Secrets to Cluster
echo "Applying Secrets..."
kubectl apply -f "$SECRETS_DIR/mongodb-secret.yaml"
kubectl apply -f "$SECRETS_DIR/postgres-secret.yaml"
kubectl apply -f "$SECRETS_DIR/minio-secret.yaml"

echo "✅ Secrets created and applied successfully!"
