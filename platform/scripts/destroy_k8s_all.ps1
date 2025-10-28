Param()
$ErrorActionPreference = 'Stop'
Write-Host 'Tearing down: Stateful Backend, Messaging, Core Applications, Scheduling App, News Ingestion Job'
try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }
Write-Host 'Starting Kubernetes teardown...'

# --- Deleting Applications and ConfigMaps ---
kubectl delete -f '../k8s/config/worker-node-config.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/config/scheduling-model-config.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/config/news-ingestion-config.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/config/main-node-config.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/apps/worker-node.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/apps/wolfram-kernel.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/apps/scheduling-model.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/apps/news-ingestion-cronjob.yaml' --ignore-not-found=true
kubectl delete -f '../k8s/apps/main-node.yaml' --ignore-not-found=true

# --- Deleting Helm Releases ---
if (helm status kafka --namespace default 2>$null) { helm delete kafka --namespace default }
if (helm status minio --namespace default 2>$null) { helm delete minio --namespace default }
if (helm status postgres-metastore --namespace default 2>$null) { helm delete postgres-metastore --namespace default }
if (helm status redis --namespace default 2>$null) { helm delete redis --namespace default }

# --- Deleting Secrets ---
if (Test-Path 'C:\Users\chris\Engineering\EnginEdge\k8s\secrets/postgres-secret.yaml') { kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\k8s\secrets/postgres-secret.yaml' --ignore-not-found=true }
if (Test-Path 'C:\Users\chris\Engineering\EnginEdge\k8s\secrets/minio-secret.yaml') { kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\k8s\secrets/minio-secret.yaml' --ignore-not-found=true }

Write-Host 'Kubernetes teardown finished.'
