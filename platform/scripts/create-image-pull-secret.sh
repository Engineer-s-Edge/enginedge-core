#!/usr/bin/env bash
set -euo pipefail

# Usage: REGISTRY=ghcr.io USERNAME=<user> TOKEN=<token> SECRET_NAME=ghcr-pull-secret NAMESPACE=default ./create-image-pull-secret.sh

: "${REGISTRY:?set REGISTRY}" 
: "${USERNAME:?set USERNAME}"
: "${TOKEN:?set TOKEN}"
SECRET_NAME=${SECRET_NAME:-ghcr-pull-secret}
NAMESPACE=${NAMESPACE:-default}

echo "Creating imagePullSecret $SECRET_NAME in namespace $NAMESPACE for $REGISTRY..."
kubectl create secret docker-registry "$SECRET_NAME" \
  --docker-server="$REGISTRY" \
  --docker-username="$USERNAME" \
  --docker-password="$TOKEN" \
  --namespace "$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Done. Set Helm value: --set imagePullSecrets[0].name=$SECRET_NAME"
