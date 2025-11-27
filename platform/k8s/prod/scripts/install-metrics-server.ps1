# Install metrics-server for Kubernetes HPA
# This script installs metrics-server which is required for HorizontalPodAutoscaler

$ErrorActionPreference = "Stop"

Write-Host "=== Installing Metrics Server ===" -ForegroundColor Cyan
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
    exit 1
}

Write-Host ""

# Check if metrics-server already exists
Write-Host "Checking if metrics-server is already installed..." -ForegroundColor Yellow
$existing = kubectl get deployment -n kube-system metrics-server -o name 2>&1
if ($existing -and $existing -notmatch "NotFound") {
    Write-Host "✓ metrics-server is already installed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Current status:" -ForegroundColor Cyan
    kubectl get deployment -n kube-system metrics-server
    exit 0
}

Write-Host "Installing metrics-server..." -ForegroundColor Yellow

# For kind/minikube, we need a modified version that works with self-signed certs
$isKind = kubectl config current-context 2>&1 | Select-String -Pattern "kind"
$isMinikube = kubectl config current-context 2>&1 | Select-String -Pattern "minikube"

if ($isKind -or $isMinikube) {
    Write-Host "Detected kind or minikube - using modified configuration..." -ForegroundColor Yellow
    
    # Create metrics-server manifest with insecure TLS for local clusters
    $metricsServerYaml = @"
apiVersion: v1
kind: ServiceAccount
metadata:
  name: metrics-server
  namespace: kube-system
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-server
  namespace: kube-system
  labels:
    k8s-app: metrics-server
spec:
  selector:
    matchLabels:
      k8s-app: metrics-server
  template:
    metadata:
      labels:
        k8s-app: metrics-server
    spec:
      serviceAccountName: metrics-server
      volumes:
      - name: tmp-dir
        emptyDir: {}
      containers:
      - name: metrics-server
        image: registry.k8s.io/metrics-server/metrics-server:v0.6.3
        args:
        - --cert-dir=/tmp
        - --secure-port=4443
        - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
        - --kubelet-use-node-status-port
        - --metric-resolution=15s
        - --kubelet-insecure-tls
        ports:
        - name: https
          containerPort: 4443
          protocol: TCP
        securityContext:
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000
        volumeMounts:
        - name: tmp-dir
          mountPath: /tmp
        imagePullPolicy: IfNotPresent
---
apiVersion: v1
kind: Service
metadata:
  name: metrics-server
  namespace: kube-system
  labels:
    k8s-app: metrics-server
spec:
  selector:
    k8s-app: metrics-server
  ports:
  - name: https
    port: 443
    protocol: TCP
    targetPort: https
---
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1beta1.metrics.k8s.io
spec:
  service:
    name: metrics-server
    namespace: kube-system
  group: metrics.k8s.io
  version: v1beta1
  insecureSkipTLSVerify: true
  groupPriorityMinimum: 100
  versionPriority: 100
"@
    
    $tempFile = Join-Path $env:TEMP "metrics-server-$(Get-Random).yaml"
    Set-Content -Path $tempFile -Value $metricsServerYaml
    
    kubectl apply -f $tempFile 2>&1 | Out-Null
    Remove-Item $tempFile -Force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ metrics-server installed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Installation failed" -ForegroundColor Red
        exit 1
    }
} else {
    # Use standard installation
    Write-Host "Using standard metrics-server installation..." -ForegroundColor Yellow
    
    $metricsServerYaml = "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
    kubectl apply -f $metricsServerYaml 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ metrics-server installed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Installation failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Waiting for metrics-server to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Wait for deployment to be ready
kubectl wait --namespace kube-system `
    --for=condition=available deployment/metrics-server `
    --timeout=300s 2>&1 | Out-Null

Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
kubectl get deployment -n kube-system metrics-server
kubectl top nodes 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ metrics-server is working correctly!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠ metrics-server installed but may need a moment to start collecting metrics" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✓ Metrics Server installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "HPA (Horizontal Pod Autoscaler) will now work correctly." -ForegroundColor White
Write-Host ""

