#!/bin/bash
# setup-secrets.sh
# Interactive script to set up Kubernetes secrets with REAL values.

SECRETS_DIR="./secrets_staging"
mkdir -p "$SECRETS_DIR"

GOOGLE_JSON_FILE="$SECRETS_DIR/google-credentials.json"
ENV_FILE="$SECRETS_DIR/secrets.env"

echo "==============================================="
echo "EnginEdge Secrets Setup"
echo "==============================================="

# --- Template Generation ---

NEW_FILES=false

if [ ! -f "$GOOGLE_JSON_FILE" ]; then
    echo "{}" > "$GOOGLE_JSON_FILE"
    echo "⚠️  Created template: $GOOGLE_JSON_FILE"
    echo "    -> ACTION: Paste your Google Service Account JSON content into this file."
    NEW_FILES=true
fi

if [ ! -f "$ENV_FILE" ]; then
    cat <<EOF > "$ENV_FILE"
# ==========================================
# EnginEdge Kubernetes Secrets Configuration
# ==========================================

# --- Google OAuth ---
# The Client ID from Google Cloud Console
GOOGLE_CLIENT_ID=placeholder-id
# The Client Secret from Google Cloud Console
GOOGLE_CLIENT_SECRET=placeholder-secret

# --- Datalake Credentials ---
# MinIO (Object Storage)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# Postgres (Metadata)
POSTGRES_USER=airflow
POSTGRES_PASSWORD=airflow
POSTGRES_DB=airflow

# Hive Metastore
HIVE_METASTORE_USER=hive
HIVE_METASTORE_PASSWORD=hive123
HIVE_METASTORE_DB=metastore

# Tokern (Governance)
TOKERN_USER=tokern
TOKERN_PASSWORD=tokern123
TOKERN_DB=tokern
EOF
    echo "⚠️  Created template: $ENV_FILE"
    echo "    -> ACTION: Edit this file and replace placeholders with real values."
    NEW_FILES=true
fi

if [ "$NEW_FILES" = true ]; then
    echo ""
    echo "❌ Configuration files were missing and have been created in '$SECRETS_DIR'."
    echo "Please edit them with your real secrets and run this script again."
    exit 0
fi

# --- Confirmation ---

echo "Found configuration files in '$SECRETS_DIR'."
echo "Please verify they contain your real secrets."
read -p "Are you ready to apply these secrets to the cluster? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Please edit the files and run this script again."
    exit 1
fi

# --- Application ---

echo "Loading configuration..."
# Load env vars safely
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "Error: $ENV_FILE not found!"
    exit 1
fi

echo "Applying secrets..."

# 1. datalake-secrets
kubectl create secret generic datalake-secrets \
  --from-literal=MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  --from-literal=MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  --from-literal=MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" \
  --from-literal=MINIO_SECRET_KEY="$MINIO_SECRET_KEY" \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB" \
  --from-literal=HIVE_METASTORE_USER="$HIVE_METASTORE_USER" \
  --from-literal=HIVE_METASTORE_PASSWORD="$HIVE_METASTORE_PASSWORD" \
  --from-literal=HIVE_METASTORE_DB="$HIVE_METASTORE_DB" \
  --from-literal=TOKERN_USER="$TOKERN_USER" \
  --from-literal=TOKERN_PASSWORD="$TOKERN_PASSWORD" \
  --from-literal=TOKERN_DB="$TOKERN_DB" \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. google-oauth-secret
kubectl create secret generic google-oauth-secret \
  --from-literal=client-id="$GOOGLE_CLIENT_ID" \
  --from-literal=client-secret="$GOOGLE_CLIENT_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. google-secret
# Check if json is valid or at least not empty default
if grep -q "{}" "$GOOGLE_JSON_FILE"; then
    echo "⚠️  Warning: $GOOGLE_JSON_FILE appears to be empty/default. 'google-secret' will be invalid."
fi

kubectl create secret generic google-secret \
  --from-file=google-credentials.json="$GOOGLE_JSON_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets applied."

# --- Storage (Wolfram) ---
echo "Ensuring Wolfram PV exists..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: wolfram-state-pv
  labels:
    type: local
spec:
  storageClassName: standard
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: "/mnt/data/wolfram-state"
EOF

echo "Done. Pods should start recovering shortly."


