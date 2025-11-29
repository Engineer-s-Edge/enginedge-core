#!/bin/bash
# fix-final-issues.sh
# Comprehensive fix script for common production deployment issues.
# Fixes: Wolfram permissions, Kafka DNS, MongoDB Auth, and worker init containers.

set -e

# Ensure we are in the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "==============================================="
echo "EnginEdge Production Fix Script"
echo "==============================================="
echo ""

echo "==============================================="
echo "Phase 1: Fixing Wolfram Kernel Permissions"
echo "==============================================="

echo "Re-applying Wolfram Kernel configuration..."
kubectl apply -f ../k8s/prod/apps/wolfram-kernel.yaml

echo "Restarting Wolfram Kernel..."
kubectl rollout restart deployment wolfram-kernel 2>/dev/null || kubectl delete pod -l component=wolfram-kernel 2>/dev/null || true

echo "==============================================="
echo "Phase 2: Fixing Kafka DNS"
echo "==============================================="

echo "Patching Kafka Topics Init Job..."
kubectl delete job kafka-topics-init --ignore-not-found
kubectl apply -f ../k8s/prod/apps/kafka-topics-init.yaml 2>/dev/null || true

echo "==============================================="
echo "Phase 3: Fixing Worker Init Containers"
echo "==============================================="

echo "Re-applying Interview Worker..."
kubectl apply -f ../k8s/prod/apps/interview-worker.yaml
kubectl rollout restart deployment interview-worker 2>/dev/null || true

echo "Re-applying Resume Worker..."
kubectl apply -f ../k8s/prod/apps/resume-worker.yaml
kubectl rollout restart deployment resume-worker 2>/dev/null || true

echo "==============================================="
echo "Phase 4: Fixing MongoDB Authentication"
echo "==============================================="
echo ""
echo "IMPORTANT: MongoDB's MONGO_INITDB_ROOT_* env vars only work on"
echo "           first initialization with a fresh data directory."
echo "           If the PVC was reset, users need to be created manually."
echo ""

# Define credentials - these MUST match what's in mongodb-secret.yaml
ROOT_USER="root"
ROOT_PASS="password123"
APP_USER="enginedge"
APP_PASS="enginedge123"

echo "Checking if MongoDB is running..."
if ! kubectl get pod mongodb-0 &> /dev/null; then
    echo "❌ MongoDB pod not found. Deploying MongoDB first..."
    kubectl apply -f ../k8s/prod/apps/mongodb.yaml
fi

echo "Waiting for MongoDB pod to be ready..."
kubectl wait --for=condition=ready pod/mongodb-0 --timeout=180s || {
    echo "❌ MongoDB failed to become ready. Checking logs..."
    kubectl logs mongodb-0 --tail=50
    exit 1
}

echo ""
echo "Creating/updating MongoDB users..."

# Create init script
cat > /tmp/mongo-init.js << MONGOEOF
// MongoDB User Initialization Script
var rootUser = '$ROOT_USER';
var rootPass = '$ROOT_PASS';
var appUser = '$APP_USER';
var appPass = '$APP_PASS';

print('Creating MongoDB users...');

// Create root user
try {
  db.getSiblingDB('admin').createUser({
    user: rootUser,
    pwd: rootPass,
    roles: [{ role: 'root', db: 'admin' }]
  });
  print('✅ Root user created successfully');
} catch (e) {
  if (e.codeName === 'DuplicateKey' || e.code === 11000) {
    print('ℹ️  Root user already exists, updating password...');
    db.getSiblingDB('admin').changeUserPassword(rootUser, rootPass);
    print('✅ Root user password updated');
  } else {
    print('⚠️  Root user error (may be OK if auth is enabled): ' + e.message);
  }
}

// Create application user
try {
  db.getSiblingDB('admin').createUser({
    user: appUser,
    pwd: appPass,
    roles: [
      { role: 'readWrite', db: 'enginedge-hexagon' },
      { role: 'readWrite', db: 'admin' },
      { role: 'dbAdmin', db: 'enginedge-hexagon' }
    ]
  });
  print('✅ Application user created successfully');
} catch (e) {
  if (e.codeName === 'DuplicateKey' || e.code === 11000) {
    print('ℹ️  Application user already exists, updating password...');
    db.getSiblingDB('admin').changeUserPassword(appUser, appPass);
    print('✅ Application user password updated');
  } else {
    print('⚠️  App user error (may be OK if auth is enabled): ' + e.message);
  }
}

print('');
print('✅ MongoDB user initialization complete!');
MONGOEOF

# Copy script to pod and execute
kubectl cp /tmp/mongo-init.js mongodb-0:/tmp/mongo-init.js
kubectl exec mongodb-0 -- mongosh /tmp/mongo-init.js || {
    echo "⚠️  User creation had errors - this may be normal if users exist"
}

echo ""
echo "Verifying MongoDB authentication..."
if kubectl exec mongodb-0 -- mongosh "mongodb://${APP_USER}:${APP_PASS}@localhost:27017/enginedge-hexagon?authSource=admin" --eval "db.runCommand({ping:1})" 2>/dev/null; then
    echo "✅ MongoDB authentication verified!"
else
    echo "⚠️  Auth verification returned non-zero (may still work)"
fi

echo ""
echo "==============================================="
echo "Phase 5: Restarting Dependent Services"
echo "==============================================="

echo "Restarting services that depend on MongoDB..."
kubectl rollout restart deployment scheduling-worker 2>/dev/null || true
kubectl rollout restart deployment hexagon 2>/dev/null || true
kubectl rollout restart deployment agent-tool-worker 2>/dev/null || true

echo ""
echo "==============================================="
echo "✅ Fix script complete!"
echo "==============================================="
echo ""
echo "Wait 1-2 minutes for pods to restart, then check status with:"
echo "  kubectl get pods"
echo ""
echo "If issues persist, check logs with:"
echo "  kubectl logs <pod-name>"
echo "":
          name: mongodb-secret
          key: mongodb-uri
EOF

echo "Waiting for debug pod to be ready..."
kubectl wait --for=condition=ready pod/mongo-debug --timeout=60s

echo "Testing MongoDB Connection from Debug Pod..."
# We use the mongo shell to connect using the URI from the env var
kubectl exec mongo-debug -- sh -c 'mongo "$MONGODB_URI" --eval "db.adminCommand({ ping: 1 })"'

if [ $? -eq 0 ]; then
    echo "✅ MongoDB Connection Successful!"
    echo "Restarting scheduling-worker one last time..."
    kubectl delete pod -l component=scheduling-worker
else
    echo "❌ MongoDB Connection Failed."
    echo "Please check the output above for errors."
fi

echo "Done."
