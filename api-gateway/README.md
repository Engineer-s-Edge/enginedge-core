# EnginEdge API Gateway

## Overview

The API Gateway is the central entry point for all EnginEdge services, providing:

- **Authentication & Authorization** (JWT + Role-Based Access Control)
- **Request Proxying** to worker services
- **Rate Limiting** per IP/route
- **Admin-Only Access** for sensitive services (Datalake UIs)
- **Health Monitoring** of all services

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  API Gateway                     │
│                  (Port 3001)                     │
└───────────────────┬─────────────────────────────┘
                    │
    ┌───────────────┼──────────────────┐
    │               │                  │
    ▼               ▼                  ▼
Public Routes   Protected Routes   Admin-Only Routes
    │               │                  │
/api/auth/login   /api/assistants/* /api/datalake/*
/api/auth/register /api/scheduling/* (JWT + admin role)
/api/health       /api/resume/*
                  /api/interview/*
                  /api/data/*
```

## Features

### 1. Authentication & Authorization

#### JWT Authentication

All protected routes require a valid JWT token:

```bash
Authorization: Bearer <token>
```

#### Role-Based Access Control (RBAC)

Admin-only routes require the `admin` role in the JWT payload:

```json
{
  "userId": "123",
  "email": "admin@example.com",
  "roles": ["admin"]
}
```

### 2. Service Proxying

The gateway proxies requests to worker services.

**HTTP Routes (Port 3001)**
Most HTTP routes are proxied directly without authentication checks at the gateway level (authentication is handled by the worker if needed), except for `datalake` routes which are admin-only.

| Route               | Target Service            | Default Port | Auth Enforced by Gateway |
| ------------------- | ------------------------- | ------------ | ------------------------ |
| `/api/assistants/*` | assistant-worker          | 3001         | ❌                       |
| `/api/interview/*`  | interview-worker          | 3004         | ❌                       |
| `/api/data/*`       | data-processing-worker    | 3003         | ❌                       |
| `/api/scheduling/*` | scheduling-worker         | 3000         | ❌                       |
| `/api/calendar/*`   | scheduling-worker         | 3000         | ❌                       |
| `/api/latex/*`      | latex-worker              | 3005         | ❌                       |
| `/api/resume/*`     | resume-worker             | 3006         | ❌                       |
| `/api/tools/*`      | agent-tool-worker         | 3002         | ❌                       |
| `/api/datalake/*`   | Various datalake services | N/A          | ✅ (Admin Only)          |

**WebSocket Routes**
The gateway also proxies WebSocket connections. **Authentication is enforced at the gateway for all specific WebSocket routes.**

| Route Prefix        | Target Service              | Auth Required |
| ------------------- | --------------------------- | ------------- |
| `/api/assistants/*` | assistant-worker:3001       | ✅            |
| `/api/interview/*`  | interview-worker:3004       | ✅            |
| `/api/data/*`       | data-processing-worker:3003 | ✅            |
| `/api/scheduling/*` | scheduling-worker:3000      | ✅            |
| `/api/calendar/*`   | scheduling-worker:3000      | ✅            |
| `/api/latex/*`      | latex-worker:3005           | ✅            |
| `/api/resume/*`     | resume-worker:3006          | ✅            |
| `/api/tools/*`      | agent-tool-worker:3002      | ✅            |

### 3. Datalake Admin-Only Access

All datalake UI routes are protected by JWT + admin role:

```typescript
@Controller('datalake')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DatalakeProxyController {
  // MinIO Console
  @All('minio/*') forwardMinio() {}

  // Trino Query UI
  @All('trino/*') forwardTrino() {}

  // Airflow Orchestration UI
  @All('airflow/*') forwardAirflow() {}

  // Jupyter Analytics
  @All('jupyter/*') forwardJupyter() {}

  // Spark Master UI
  @All('spark/*') forwardSpark() {}

  // Marquez Lineage UI
  @All('marquez/*') forwardMarquez() {}
}
```

**Why Admin-Only?**

- These UIs expose sensitive data lake infrastructure
- Allow direct data access and query execution
- Can modify ETL pipelines and workflows
- Should only be accessible to trusted administrators

### 4. Rate Limiting

Rate limiting is applied per IP address and route:

- **Default**: 100 requests per 60 seconds
- **Configurable** via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX` env vars

### 5. Health Monitoring

Health endpoint checks gateway status:

```bash
GET /health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-11-04T10:00:00Z"
}
```

## Security Guards

### JwtAuthGuard

Validates JWT tokens and attaches user to request:

```typescript
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Req() req) {
  return req.user; // { userId, email, roles }
}
```

### RolesGuard

Checks if user has required roles:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Get('admin-only')
adminEndpoint() { }
```

## Usage Examples

### 1. Login (Get JWT Token)

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

### 2. Access Public Route (No Auth)

```bash
curl http://localhost:3001/assistants
```

### 3. Access Protected Route (JWT Required)

```bash
curl http://localhost:3001/auth/profile \
  -H "Authorization: Bearer <token>"
```

### 4. Access Admin Route (JWT + Admin Role)

```bash
# Will succeed for admin users
curl http://localhost:3001/datalake/minio/login \
  -H "Authorization: Bearer <admin-token>"

# Will fail with 403 for non-admin users
curl http://localhost:3001/datalake/minio/login \
  -H "Authorization: Bearer <user-token>"
```

Response (non-admin):

```json
{
  "statusCode": 403,
  "message": "Insufficient permissions"
}
```

## Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Auth Service
IDENTITY_WORKER_URL=http://identity-worker:3000

# Worker Services
ASSISTANT_WORKER_URL=http://assistant-worker:3000
SCHEDULING_WORKER_URL=http://scheduling-worker:3000
DATA_WORKER_URL=http://data-processing-worker:3003

# Datalake Services (Admin-Only)
MINIO_CONSOLE_URL=http://minio:9001
TRINO_URL=http://trino:8080
AIRFLOW_URL=http://airflow:8080
JUPYTER_URL=http://jupyter:8888
SPARK_MASTER_URL=http://spark-master:8080
MARQUEZ_WEB_URL=http://marquez-web:3000

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

## Deployment

### Docker Compose

```yaml
api-gateway:
  build: ./api-gateway
  ports:
    - '3001:3001'
  environment:
    - PORT=3001
    - JWT_SECRET=${JWT_SECRET}
    - IDENTITY_WORKER_URL=http://identity-worker:3000
    - MINIO_CONSOLE_URL=http://minio:9001
    - TRINO_URL=http://trino:8080
    - AIRFLOW_URL=http://airflow:8080
  depends_on:
    - identity-worker
  networks:
    - enginedge-network
```

### Kubernetes

```bash
# Deploy API Gateway
kubectl apply -f platform/k8s/apps/api-gateway/

# Check status
kubectl get pods -l app=api-gateway
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Build
npm run build

# Run in production
npm start
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:e2e
```

### Test Admin Access

```bash
# Create test script
cat > test-admin.sh << 'EOF'
#!/bin/bash

# Login as admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.accessToken')

# Test datalake access (should succeed)
echo "Testing admin access to datalake..."
curl -s http://localhost:3001/datalake/minio/ \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  && echo "✅ Admin access granted"

# Login as regular user
USER_TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}' \
  | jq -r '.accessToken')

# Test datalake access (should fail)
echo "Testing user access to datalake..."
curl -s http://localhost:3001/datalake/minio/ \
  -H "Authorization: Bearer $USER_TOKEN" \
  && echo "❌ User should not have access" \
  || echo "✅ User access denied (expected)"
EOF

chmod +x test-admin.sh
./test-admin.sh
```

## Monitoring

### Prometheus Metrics

```bash
# Endpoint
GET /metrics
```

### Health Checks

```bash
# Liveness
GET /health

# Readiness
GET /health/ready
```

### Logging

All requests are logged with:

- Request ID
- User ID (if authenticated)
- Route
- Method
- Status Code
- Duration

## Security Best Practices

1. **JWT Secret**: Use strong, random secret in production
2. **HTTPS**: Enable TLS for all external traffic
3. **Rate Limiting**: Adjust limits based on load patterns
4. **CORS**: Configure allowed origins properly
5. **Audit Logging**: Monitor admin access to datalake
6. **Network Policies**: Restrict pod-to-pod communication
7. **Secret Management**: Use Kubernetes secrets or vault

## Troubleshooting

### 401 Unauthorized

- Token expired or invalid
- Missing `Authorization` header
- Check JWT_SECRET matches between services

### 403 Forbidden

- User lacks required role (e.g., `admin`)
- Check JWT payload contains correct roles
- Verify RolesGuard is working properly

### 429 Too Many Requests

- Rate limit exceeded
- Adjust `RATE_LIMIT_MAX` or wait for cooldown
- Consider implementing per-user rate limiting

### 502 Bad Gateway

- Target service is down
- Check worker service health
- Verify service URLs in environment variables

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../../LICENSE) for details.
