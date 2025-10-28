# EnginEdge Kubernetes Migration

This directory contains the Kubernetes manifests and Helm configurations required to deploy the EnginEdge application stack.

## Prerequisites

*   A running Kubernetes cluster (e.g., `kind`, `minikube`, or a cloud provider).
*   `kubectl` configured to connect to your cluster.
*   `helm` v3 installed.

## Deployment Steps

The deployment is broken down into steps. It is recommended to follow them in order.

### Step 1: Deploy the Stateful Backend

This step deploys PostgreSQL and MinIO, which are required by other services.

**1. Add the required Helm repositories:**

First, add the Bitnami and MinIO Helm repositories. You only need to do this once.

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add minio https://charts.min.io/
helm repo update
```

**2. Apply the Kubernetes Secrets:**

These secrets contain the passwords for your services.

```bash
kubectl apply -f secrets/postgres-secret.yaml
kubectl apply -f secrets/minio-secret.yaml
```

**3. Install the Helm Charts:**

Now, install PostgreSQL and MinIO using the custom values files provided.

*   **PostgreSQL (for Hive Metastore):**
    ```bash
    helm install postgres-metastore bitnami/postgresql \
      --namespace default \
      -f charts/postgres/values.yaml
    ```

*   **MinIO (for Object Storage):**
    ```bash
    helm install minio minio/minio \
      --namespace default \
      -f charts/minio/values.yaml
    ```

After running these commands, PostgreSQL and MinIO will be deployed in your cluster, ready for the other application services.

### Step 2: Deploy Kafka

This step deploys the Kafka message broker, which is used for communication between the `main-node` and `worker-nodes`.

```bash
helm install kafka bitnami/kafka \
  --namespace default \
  -f charts/kafka/values.yaml
```

### Step 3: Deploy Redis Cache

This step deploys a Redis cache used by the `scheduling-model` service.

```bash
helm install redis bitnami/redis \
  --namespace default \
  -f charts/redis/values.yaml
```

### Step 4: Deploy Core Application Services

This step deploys the custom applications that make up the EnginEdge platform. It's best to apply the `ConfigMap` files first, followed by the application manifests.

```bash
# Apply the configuration files
kubectl apply -f config/main-node-config.yaml
kubectl apply -f config/worker-node-config.yaml
kubectl apply -f config/scheduling-model-config.yaml
kubectl apply -f config/news-ingestion-config.yaml

# Apply the application manifests
kubectl apply -f apps/wolfram-kernel.yaml
kubectl apply -f apps/scheduling-model.yaml
kubectl apply -f apps/worker-node.yaml
kubectl apply -f apps/main-node.yaml
```

### Step 5: Deploy the News Ingestion CronJob

This step deploys a `CronJob` that periodically runs the Python script to ingest news articles into MinIO.

**1. Build the Docker Image:**

First, you need to build the Docker image for the job script. If you are using `kind`, you can build the image directly into the cluster's node, which avoids needing a separate image registry.

```bash
# Build the image from the 'scripts/jobs' directory
docker build -t news-ingestion-job:latest ./scripts/jobs

# (For kind users) Load the image into your kind cluster
kind load docker-image news-ingestion-job:latest
```

**2. Apply the CronJob Manifest:**

Now, apply the `CronJob` manifest to your cluster.

```bash
kubectl apply -f apps/news-ingestion-cronjob.yaml
```

The `CronJob` is now active and will run every two hours to ingest new articles. After this step, all components of the application will have been deployed.

---

## Troubleshooting

### "Unable to connect to the server... connection refused" Error

If you see an error like this when running the "Check Cluster Status" command in the control center:
```
Unable to connect to the server: dial tcp 127.0.0.1:65439: connectex: No connection could be made because the target machine actively refused it.
```

**This is expected if your Kubernetes cluster is not running.**

The `control-center.py` script uses `kubectl` to communicate with your Kubernetes cluster. This error is the standard message from `kubectl` when it cannot find a running Kubernetes API server at the configured address.

**Solution:** Before you can use the Kubernetes management features of the control center (`Deploy`, `Destroy`, `Status`), you must start your local `kind` cluster. The command to do this is typically:
```bash
kind create cluster --config kind-config.yaml
```
Once your cluster is running, the "Check Cluster Status" command will succeed.
