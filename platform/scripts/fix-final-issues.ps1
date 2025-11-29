# fix-final-issues.ps1
# Fixes Wolfram permissions, Kafka DNS, and MongoDB Auth

Write-Host "==============================================="
Write-Host "Phase 1: Fixing Wolfram Kernel Permissions"
Write-Host "==============================================="

# Re-applying Wolfram Kernel configuration
Write-Host "Re-applying Wolfram Kernel configuration..."
kubectl apply -f enginedge-core/platform/k8s/prod/apps/wolfram-kernel.yaml

Write-Host "Restarting Wolfram Kernel..."
kubectl delete pod -l component=wolfram-kernel

Write-Host "==============================================="
Write-Host "Phase 2: Fixing Kafka DNS"
Write-Host "==============================================="

Write-Host "Patching Kafka Topics Init Job..."
# We need to delete the old job first because fields are immutable
kubectl delete job kafka-topics-init --ignore-not-found

# Apply the updated job from the repo
kubectl apply -f enginedge-core/platform/k8s/prod/apps/kafka-topics-init.yaml

Write-Host "==============================================="
Write-Host "Phase 3: Fixing Worker Init Containers"
Write-Host "==============================================="

Write-Host "Re-applying Interview Worker..."
kubectl apply -f enginedge-core/platform/k8s/prod/apps/interview-worker.yaml
kubectl delete pod -l component=interview-worker

Write-Host "Re-applying Resume Worker..."
kubectl apply -f enginedge-core/platform/k8s/prod/apps/resume-worker.yaml
kubectl delete pod -l component=resume-worker

Write-Host "==============================================="
Write-Host "Phase 4: Debugging MongoDB Auth"
Write-Host "==============================================="

Write-Host "Launching MongoDB Debug Pod..."
$mongoDebugYaml = @"
apiVersion: v1
kind: Pod
metadata:
  name: mongo-debug
spec:
  containers:
  - name: mongo-debug
    image: mongo:5.0.24
    command: ["sleep", "3600"]
    env:
    - name: MONGODB_URI
      valueFrom:
        secretKeyRef:
          name: mongodb-secret
          key: mongodb-uri
"@

$mongoDebugYaml | kubectl apply -f -

Write-Host "Waiting for debug pod to be ready..."
kubectl wait --for=condition=ready pod/mongo-debug --timeout=60s

Write-Host "Testing MongoDB Connection from Debug Pod..."
# We use the mongo shell to connect using the URI from the env var
kubectl exec mongo-debug -- sh -c 'mongo "$MONGODB_URI" --eval "db.adminCommand({ ping: 1 })"'

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ MongoDB Connection Successful!" -ForegroundColor Green
    Write-Host "Restarting scheduling-worker one last time..."
    kubectl delete pod -l component=scheduling-worker
} else {
    Write-Host "❌ MongoDB Connection Failed." -ForegroundColor Red
    Write-Host "Please check the output above for errors."
}

Write-Host "Done."
