Param()
$ErrorActionPreference = 'Stop'
Write-Host 'Tearing down: Stateful Backend, Messaging, Core Applications, Scheduling App, News Ingestion Job'
try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }
Write-Host 'Starting Kubernetes teardown...'

# --- Deleting Applications and ConfigMaps ---
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/worker-config.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/scheduling-model-config.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/news-ingestion-config.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/core-config.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/wolfram-kernel.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/scheduling-model.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/resume-worker.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/news-ingestion-cronjob.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/llm-worker.yaml' --ignore-not-found=true
if (helm status api-gateway --namespace default 2>$null) { helm delete api-gateway --namespace default }
if (helm status identity-worker --namespace default 2>$null) { helm delete identity-worker --namespace default }
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/latex-worker.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/interview-worker.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/data-processing-worker.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/control-plane.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/main-node.yaml' --ignore-not-found=true
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/agent-tool-worker.yaml' --ignore-not-found=true

# --- Deleting Helm Releases ---
if (helm status kafka --namespace default 2>$null) { helm delete kafka --namespace default }
if (helm status minio --namespace default 2>$null) { helm delete minio --namespace default }
if (helm status postgres-metastore --namespace default 2>$null) { helm delete postgres-metastore --namespace default }
if (helm status redis --namespace default 2>$null) { helm delete redis --namespace default }
if (helm status kube-prometheus-stack --namespace observability 2>$null) { helm delete kube-prometheus-stack --namespace observability }

# --- Deleting Observability Manifests ---
kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\observability\servicemonitors\' --ignore-not-found=true

# --- Deleting Secrets ---
if (Test-Path 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml') { kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml' --ignore-not-found=true }
if (Test-Path 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml') { kubectl delete -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml' --ignore-not-found=true }

Write-Host 'Kubernetes teardown finished.'
