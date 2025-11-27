# Kubernetes Secrets

This directory contains the secret files required for the EnginEdge Kubernetes deployment.

## Using Secrets Safely

This repo only includes `*.example` templates and documentation. Real secret files such as `minio-secret.yaml`, `postgres-secret.yaml`, `kafka-secret.yaml`, `mongodb-secret.yaml`, `jwt-secret.yaml`, and `google-secret.yaml` must never be committed. The `.gitignore` is configured to ignore any real secret files in this folder.

## Production Deployment

⚠️ **WARNING**: Never commit actual secrets. Use these steps to create local, untracked secret files from the templates.

For production deployments:

1. Copy the appropriate example to a working file (which is ignored by git):
   - `cp k8s/secrets/minio-secret.yaml.example k8s/secrets/minio-secret.yaml`
   - `cp k8s/secrets/postgres-secret.yaml.example k8s/secrets/postgres-secret.yaml`
   - `cp k8s/secrets/kafka-secret.yaml.example k8s/secrets/kafka-secret.yaml`
   - `cp k8s/secrets/mongodb-secret.yaml.example k8s/secrets/mongodb-secret.yaml`
   - `cp k8s/secrets/jwt-secret.yaml.example k8s/secrets/jwt-secret.yaml`
   - `cp k8s/secrets/google-secret.yaml.example k8s/secrets/google-secret.yaml`
2. Generate secure, random credentials for each service
3. Base64 encode the credentials
4. Replace the placeholder values in your local secret files
5. Apply the secrets to your cluster with `kubectl apply -f k8s/secrets/<name>.yaml`
6. Consider using external secret management tools like:
   - Kubernetes External Secrets
   - HashiCorp Vault
   - Cloud provider secret managers (AWS Secrets Manager, Azure Key Vault, etc.)

## Base64 Encoding

To encode credentials for Kubernetes secrets:

```bash
echo -n 'your-password' | base64
```

## Example Templates

The `*.example` files in this directory provide templates for creating new secrets.