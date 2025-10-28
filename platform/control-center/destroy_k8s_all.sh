#!/bin/bash
# Destroys selected application components from Kubernetes.
set -e

kubectl cluster-info >/dev/null 2>&1 || { echo 'Cluster offline'; exit 1; }

echo 'Starting Kubernetes teardown for: Stateful Backend, Messaging, Core Applications, Scheduling App, News Ingestion Job...'

# --- Deleting Applications and ConfigMaps ---
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/worker-config.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/scheduling-model-config.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/news-ingestion-config.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/core-config.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/wolfram-kernel.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/scheduling-model.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/rnle-worker.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/news-ingestion-cronjob.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/assistant-worker.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/latex-worker.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/interview-worker.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/data-processing-worker.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/core.yaml --ignore-not-found=true
kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/agent-tool-worker.yaml --ignore-not-found=true

# --- Deleting Helm Releases ---
helm status kafka --namespace default >/dev/null 2>&1 && helm delete kafka --namespace default || true
helm status minio --namespace default >/dev/null 2>&1 && helm delete minio --namespace default || true
helm status postgres-metastore --namespace default >/dev/null 2>&1 && helm delete postgres-metastore --namespace default || true
helm status redis --namespace default >/dev/null 2>&1 && helm delete redis --namespace default || true

# --- Deleting Secrets ---
[ -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml ] && kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml --ignore-not-found=true || true
[ -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml ] && kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml --ignore-not-found=true || true

echo 'Kubernetes teardown finished.'
