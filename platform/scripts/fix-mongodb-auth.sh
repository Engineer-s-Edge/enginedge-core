#!/bin/bash
# fix-mongodb-auth.sh
# Creates MongoDB users to match what the applications expect.
# This script is safe to run multiple times - it will update passwords if users exist.
#
# IMPORTANT: The core issue this fixes is that MONGO_INITDB_ROOT_* env vars
# only work on FIRST initialization. If the PVC is reset but users weren't
# created, MongoDB runs without auth. This script creates the users manually.

set -e

echo "==============================================="
echo "MongoDB Authentication Fix Script"
echo "==============================================="

# Define credentials - these MUST match what's in mongodb-secret.yaml
ROOT_USER="root"
ROOT_PASS="password123"
APP_USER="enginedge"
APP_PASS="enginedge123"

echo ""
echo "Step 1: Checking MongoDB pod status..."
if ! kubectl get pod mongodb-0 &> /dev/null; then
    echo "❌ MongoDB pod not found. Please ensure MongoDB is deployed first."
    exit 1
fi

echo "Waiting for MongoDB pod to be ready..."
kubectl wait --for=condition=ready pod/mongodb-0 --timeout=120s

echo ""
echo "Step 2: Creating/updating MongoDB users..."

# Create init script and copy to pod
cat > /tmp/mongo-init.js << 'MONGOEOF'
// Create root user
var rootUser = 'ROOT_USER_PLACEHOLDER';
var rootPass = 'ROOT_PASS_PLACEHOLDER';
var appUser = 'APP_USER_PLACEHOLDER';
var appPass = 'APP_PASS_PLACEHOLDER';

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
    print('❌ Error creating root user: ' + e.message);
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
  print('✅ Application user "' + appUser + '" created successfully');
} catch (e) {
  if (e.codeName === 'DuplicateKey' || e.code === 11000) {
    print('ℹ️  Application user already exists, updating password...');
    db.getSiblingDB('admin').changeUserPassword(appUser, appPass);
    print('✅ Application user password updated');
  } else {
    print('❌ Error creating application user: ' + e.message);
  }
}

print('');
print('✅ MongoDB user initialization complete!');
MONGOEOF

# Replace placeholders with actual values
sed -i "s/ROOT_USER_PLACEHOLDER/$ROOT_USER/g" /tmp/mongo-init.js
sed -i "s/ROOT_PASS_PLACEHOLDER/$ROOT_PASS/g" /tmp/mongo-init.js
sed -i "s/APP_USER_PLACEHOLDER/$APP_USER/g" /tmp/mongo-init.js
sed -i "s/APP_PASS_PLACEHOLDER/$APP_PASS/g" /tmp/mongo-init.js

# Copy script to pod and execute
kubectl cp /tmp/mongo-init.js mongodb-0:/tmp/mongo-init.js
kubectl exec mongodb-0 -- mongosh /tmp/mongo-init.js

echo ""
echo "Step 3: Verifying authentication..."

# Test connection with application user
if kubectl exec mongodb-0 -- mongosh "mongodb://${APP_USER}:${APP_PASS}@localhost:27017/enginedge-hexagon?authSource=admin" --eval "db.runCommand({ping:1})" 2>/dev/null; then
    echo "✅ Application user authentication verified!"
else
    echo "❌ Application user authentication failed!"
    exit 1
fi

echo ""
echo "Step 4: Restarting dependent services..."

# Restart services that depend on MongoDB
kubectl rollout restart deployment scheduling-worker 2>/dev/null || true
kubectl rollout restart deployment hexagon 2>/dev/null || true
kubectl rollout restart deployment agent-tool-worker 2>/dev/null || true
kubectl rollout restart deployment interview-worker 2>/dev/null || true
kubectl rollout restart deployment resume-worker 2>/dev/null || true

echo ""
echo "==============================================="
echo "✅ MongoDB authentication fix complete!"
echo "==============================================="
echo ""
echo "Services are restarting. Check their status with:"
echo "  kubectl get pods"
echo ""
