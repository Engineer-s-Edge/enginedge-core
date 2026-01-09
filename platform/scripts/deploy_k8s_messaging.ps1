Param()
$ErrorActionPreference = 'Stop'
Write-Host 'Deploying: Messaging'
try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }
Write-Host 'Starting Kubernetes deployment...'

# --- Applying Secrets and ConfigMaps ---

# --- Installing Helm Charts for 3rd party services ---
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add minio https://charts.min.io/
helm repo update

helm upgrade --install kafka bitnami/kafka -f '../k8s/charts/kafka/values.yaml' --namespace default
helm upgrade --install redis bitnami/redis -f '../k8s/charts/redis/values.yaml' --namespace default

# --- Deploying Core Applications ---

Write-Host 'Kubernetes deployment finished.'
