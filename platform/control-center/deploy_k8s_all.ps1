Param()
$ErrorActionPreference = 'Stop'
Write-Host 'Deploying: Stateful Backend, Messaging, Core Applications, Scheduling App, News Ingestion Job'
try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }
Write-Host 'Starting Kubernetes deployment...'

# --- Applying Secrets and ConfigMaps ---
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/core-config.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/news-ingestion-config.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/scheduling-model-config.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\config/worker-config.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/minio-secret.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\secrets/postgres-secret.yaml'

# --- Installing Helm Charts for 3rd party services ---
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add minio https://charts.min.io/
helm repo update

helm install kafka bitnami/kafka -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\charts/kafka/values.yaml' --namespace default
helm install minio minio/minio -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\charts/minio/values.yaml' --namespace default
helm install postgres-metastore bitnami/postgresql -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\charts/postgres/values.yaml' --namespace default
helm install redis bitnami/redis -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\charts/redis/values.yaml' --namespace default

# --- Deploying Core Applications ---
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/agent-tool-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/core.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/data-processing-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/interview-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/latex-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/assistant-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/news-ingestion-cronjob.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/rnle-worker.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/scheduling-model.yaml'
kubectl apply -f 'C:\Users\chris\Engineering\EnginEdge\enginedge-core\platform\k8s\apps/wolfram-kernel.yaml'

Write-Host 'Kubernetes deployment finished.'
