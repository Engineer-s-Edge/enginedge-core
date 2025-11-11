#!/bin/bash
# Destroys selected application components from Kubernetes.
set -e

kubectl cluster-info >/dev/null 2>&1 || { echo 'Cluster offline'; exit 1; }

echo 'Starting Kubernetes teardown for: Stateful Backend, Messaging, Core Applications, Scheduling App, News Ingestion Job, Observability...'

# --- Deleting Applications, ConfigMaps, and RBAC ---
# Note: PVCs are being preserved, deleting resources individually...
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\rbac/main-node-observability-rbac.yaml (excluding PVCs)
kubectl delete serviceaccount/main-node-observability -n default --ignore-not-found=true
kubectl delete role/main-node-observability-role -n default --ignore-not-found=true
kubectl delete rolebinding/main-node-observability-binding -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/worker-config.yaml (excluding PVCs)
kubectl delete configmap/worker-config -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/spacy-service-config.yaml (excluding PVCs)
kubectl delete configmap/spacy-service-config -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/scheduling-model-config.yaml (excluding PVCs)
kubectl delete configmap/scheduling-model-config -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/news-ingestion-config.yaml (excluding PVCs)
kubectl delete configmap/news-ingestion-config -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/core-config.yaml (excluding PVCs)
kubectl delete configmap/core-config -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/zookeeper.yaml (excluding PVCs)
kubectl delete service/zookeeper -n default --ignore-not-found=true
kubectl delete statefulset/zookeeper -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/wolfram-kernel.yaml (excluding PVCs)
kubectl delete service/wolfram-kernel -n default --ignore-not-found=true
kubectl delete deployment/wolfram-kernel -n default --ignore-not-found=true
# Skipping PVC 'wolfram-state' (preserve_pvc=true)
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/spacy-service.yaml (excluding PVCs)
kubectl delete service/spacy-service -n default --ignore-not-found=true
kubectl delete deployment/spacy-service -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/scheduling-worker.yaml (excluding PVCs)
kubectl delete service/scheduling-worker -n default --ignore-not-found=true
kubectl delete deployment/scheduling-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/scheduling-model.yaml (excluding PVCs)
kubectl delete service/scheduling-model -n default --ignore-not-found=true
kubectl delete deployment/scheduling-model -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/resume-worker.yaml (excluding PVCs)
kubectl delete service/resume-worker -n default --ignore-not-found=true
kubectl delete deployment/resume-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/news-ingestion-cronjob.yaml (excluding PVCs)
kubectl delete cronjob/news-ingestion-cronjob -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/mongodb.yaml (excluding PVCs)
kubectl delete service/mongodb-service -n default --ignore-not-found=true
kubectl delete statefulset/mongodb -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/latex-worker.yaml (excluding PVCs)
kubectl delete service/latex-worker -n default --ignore-not-found=true
kubectl delete deployment/latex-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/kafka.yaml (excluding PVCs)
kubectl delete configmap/kafka-config -n default --ignore-not-found=true
kubectl delete service/kafka -n default --ignore-not-found=true
kubectl delete statefulset/kafka -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/kafka-topics-init.yaml (excluding PVCs)
kubectl delete job/kafka-topics-init -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/interview-worker.yaml (excluding PVCs)
kubectl delete service/interview-worker -n default --ignore-not-found=true
kubectl delete deployment/interview-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/identity-worker.yaml (excluding PVCs)
kubectl delete service/identity-worker -n default --ignore-not-found=true
kubectl delete deployment/identity-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/hexagon.yaml (excluding PVCs)
kubectl delete service/hexagon -n default --ignore-not-found=true
kubectl delete deployment/hexagon -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/data-processing-worker.yaml (excluding PVCs)
kubectl delete service/data-processing-worker -n default --ignore-not-found=true
kubectl delete deployment/data-processing-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/assistant-worker.yaml (excluding PVCs)
kubectl delete service/assistant-worker -n default --ignore-not-found=true
kubectl delete deployment/assistant-worker -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/api-gateway.yaml (excluding PVCs)
kubectl delete service/api-gateway -n default --ignore-not-found=true
kubectl delete deployment/api-gateway -n default --ignore-not-found=true
# Processing C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/agent-tool-worker.yaml (excluding PVCs)
kubectl delete service/agent-tool-worker -n default --ignore-not-found=true
kubectl delete deployment/agent-tool-worker -n default --ignore-not-found=true

# --- Deleting Helm Releases ---
helm status kube-prometheus-stack --namespace default >/dev/null 2>&1 && helm delete kube-prometheus-stack --namespace default || true
helm status minio --namespace default >/dev/null 2>&1 && helm delete minio --namespace default || true
helm status postgres-metastore --namespace default >/dev/null 2>&1 && helm delete postgres-metastore --namespace default || true
helm status redis --namespace default >/dev/null 2>&1 && helm delete redis --namespace default || true

# --- Deleting Secrets ---
[ -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml ] && kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml --ignore-not-found=true || true
[ -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml ] && kubectl delete -f C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml --ignore-not-found=true || true

# --- Preserving PersistentVolumeClaims ---
echo 'Preserving PersistentVolumeClaims: wolfram-state'
# PVC 'wolfram-state' is preserved and will not be deleted
echo 'PersistentVolumeClaims preserved (wolfram-state and other PVCs retained).'
echo 'Kubernetes teardown finished.'
