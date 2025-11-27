# Install NGINX Ingress Controller for Kubernetes
# This script installs NGINX Ingress Controller using Helm or kubectl

$ErrorActionPreference = "Stop"

Write-Host "=== Installing NGINX Ingress Controller ===" -ForegroundColor Cyan
Write-Host ""

# Check for kubectl
try {
    $null = kubectl version --client --short 2>&1
    Write-Host "✓ kubectl found" -ForegroundColor Green
} catch {
    Write-Host "✗ kubectl not found. Please install kubectl." -ForegroundColor Red
    exit 1
}

# Check if cluster is accessible
Write-Host "Checking cluster connection..." -ForegroundColor Yellow
try {
    $null = kubectl cluster-info 2>&1
    Write-Host "✓ Cluster is accessible" -ForegroundColor Green
} catch {
    Write-Host "✗ Cannot connect to cluster. Please start your Kubernetes cluster first." -ForegroundColor Red
    Write-Host "  For kind: kind create cluster" -ForegroundColor Yellow
    Write-Host "  For minikube: minikube start" -ForegroundColor Yellow
    Write-Host "  For Docker Desktop: Enable Kubernetes in settings" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check if Helm is available
$useHelm = $false
try {
    $helmVersion = helm version --short 2>&1
    $useHelm = $true
    Write-Host "✓ Helm found - will use Helm for installation" -ForegroundColor Green
} catch {
    Write-Host "⚠ Helm not found - will use kubectl apply method" -ForegroundColor Yellow
}

Write-Host ""

if ($useHelm) {
    # Install using Helm
    Write-Host "Installing NGINX Ingress Controller using Helm..." -ForegroundColor Yellow
    
    # Add ingress-nginx Helm repo
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>&1 | Out-Null
    helm repo update 2>&1 | Out-Null
    
    # Install ingress-nginx
    helm install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx `
        --create-namespace `
        --set controller.service.type=NodePort `
        --set controller.service.nodePorts.http=30080 `
        --set controller.service.nodePorts.https=30443 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ NGINX Ingress Controller installed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Installation failed" -ForegroundColor Red
        exit 1
    }
} else {
    # Install using kubectl apply
    Write-Host "Installing NGINX Ingress Controller using kubectl..." -ForegroundColor Yellow
    
    $ingressYaml = "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml"
    
    kubectl apply -f $ingressYaml 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ NGINX Ingress Controller installed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Installation failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Waiting for ingress controller to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Wait for pods to be ready
kubectl wait --namespace ingress-nginx `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/component=controller `
    --timeout=300s 2>&1 | Out-Null

Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
kubectl get pods -n ingress-nginx
kubectl get ingressclass

Write-Host ""
Write-Host "✓ NGINX Ingress Controller installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Your Ingress resources will now work" -ForegroundColor White
Write-Host "2. Access services via: http://api.enginedge.local (add to /etc/hosts or use port-forward)" -ForegroundColor White
Write-Host ""

