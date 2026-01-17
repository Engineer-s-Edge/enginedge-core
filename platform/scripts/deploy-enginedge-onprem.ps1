<#
.SYNOPSIS
    Deploys EnginEdge services to the Kubernetes cluster.
.PARAMETER Prod
    If set, uses production manifests. Otherwise uses dev manifests.
#>

param(
    [switch]$Prod
)

$ErrorActionPreference = "Stop"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PlatformDir = Split-Path -Parent $ScriptDir

if ($Prod) {
    $K8sDir = Join-Path $PlatformDir "k8s\prod"
    Write-Host "Using PRODUCTION manifests from $K8sDir" -ForegroundColor Cyan
} else {
    $K8sDir = Join-Path $PlatformDir "k8s\dev"
    Write-Host "Using DEV manifests from $K8sDir" -ForegroundColor Cyan
}

function Log-Info($Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Log-Warn($Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Log-Error($Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check Prerequisites
Log-Info "Checking prerequisites..."
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Log-Error "kubectl not found. Please install kubectl first."
    exit 1
}
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Log-Error "Helm not found. Please install Helm first."
    exit 1
}

try {
    kubectl cluster-info | Out-Null
} catch {
    Log-Error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
    exit 1
}

# Apply Configs and Secrets FIRST
$ConfigDir = Join-Path $K8sDir "config"
if (Test-Path $ConfigDir) {
    Log-Info "Applying configurations..."
    kubectl apply -f $ConfigDir
}

$SecretsDir = Join-Path $K8sDir "secrets"
if (Test-Path $SecretsDir) {
    Log-Info "Applying secrets..."
    kubectl apply -f $SecretsDir
}

# Check Secrets (Verification)
Log-Info "Verifying required secrets..."
$RequiredSecrets = @("mongodb-secret", "postgres-secret", "minio-secret")
$MissingSecrets = @()

foreach ($secret in $RequiredSecrets) {
    if (-not (kubectl get secret $secret -ErrorAction SilentlyContinue)) {
        $MissingSecrets += $secret
    }
}

if (-not (kubectl get secret ghcr-pull-secret -ErrorAction SilentlyContinue)) {
    Log-Warn "ghcr-pull-secret not found. You may need to create it to pull images from GHCR."
    Log-Warn "Run: .\create-image-pull-secret.ps1 -Registry ghcr.io -Username <USER> -Token <PAT>"
}

if ($MissingSecrets.Count -gt 0) {
    Log-Error "Missing required secrets: $($MissingSecrets -join ', ')"
    Log-Error "Please create secrets first. See k8s/secrets/README.md for instructions."
    exit 1
}

# Add Helm Repos
Log-Info "Adding Helm repositories..."
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add minio https://charts.min.io/
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Deploy Infrastructure
Log-Info "Deploying infrastructure services..."

# MongoDB
Log-Info "Deploying MongoDB..."
$MongoYaml = Join-Path $K8sDir "apps\mongodb.yaml"
if (Test-Path $MongoYaml) {
    kubectl apply -f $MongoYaml
} else {
    Log-Warn "MongoDB manifest not found at $MongoYaml"
}

# Kafka
Log-Info "Deploying Kafka..."
if (-not (helm list -q | Select-String "kafka")) {
    $KafkaValues = Join-Path $K8sDir "charts\kafka\values.yaml"
    if (Test-Path $KafkaValues) {
        helm upgrade --install kafka bitnami/kafka --namespace default -f $KafkaValues
    } else {
        Log-Warn "Kafka values file not found at $KafkaValues. Installing with defaults."
        helm upgrade --install kafka bitnami/kafka --namespace default
    }
} else {
    Log-Warn "Kafka already installed. Skipping..."
}

# Redis
Log-Info "Deploying Redis..."
if (-not (helm list -q | Select-String "redis")) {
    $RedisValues = Join-Path $K8sDir "charts\redis\values.yaml"
    if (Test-Path $RedisValues) {
        helm upgrade --install redis bitnami/redis --namespace default -f $RedisValues
    } else {
        Log-Warn "Redis values file not found at $RedisValues. Installing with defaults."
        helm upgrade --install redis bitnami/redis --namespace default
    }
} else {
    Log-Warn "Redis already installed. Skipping..."
}

# MinIO
Log-Info "Deploying MinIO..."
if (-not (helm list -q | Select-String "minio")) {
    $MinioValues = Join-Path $K8sDir "charts\minio\values.yaml"
    if (Test-Path $MinioValues) {
        helm upgrade --install minio minio/minio --namespace default -f $MinioValues
    } else {
        Log-Warn "MinIO values file not found at $MinioValues. Installing with defaults."
        helm upgrade --install minio minio/minio --namespace default
    }
} else {
    Log-Warn "MinIO already installed. Skipping..."
}

# Deploy Apps
Log-Info "Deploying applications..."
$AppsDir = Join-Path $K8sDir "apps"
if (Test-Path $AppsDir) {
    kubectl apply -f $AppsDir
} else {
    Log-Error "Apps directory not found at $AppsDir"
}

Log-Info "Deployment finished! Check status with: kubectl get pods"
